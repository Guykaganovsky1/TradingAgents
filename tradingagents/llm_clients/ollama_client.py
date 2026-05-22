"""Native Ollama LangChain client.

Why this exists instead of routing Ollama through OpenAIClient:
    Ollama exposes two HTTP surfaces — `/v1/chat/completions` (OpenAI-compatible
    shim) and `/api/chat` (native). They disagree on Qwen3-style reasoning
    models: the OpenAI shim silently drops `think`, `chat_template_kwargs`,
    and `reasoning_effort`, so qwen3 always burns the full `max_tokens` inside
    a `<think>` block and never reaches the analyst's tool-call phase before
    timing out. langchain-ollama's ChatOllama uses /api/chat directly and
    exposes a first-class `reasoning: bool | str | None` field that disables
    the thinking phase end-to-end. We auto-set `reasoning=False` for the qwen3
    family so the dashboard's 120s per-call budget is enough to complete a turn.
"""
from typing import Any, Optional

from langchain_ollama import ChatOllama

from .base_client import BaseLLMClient
from .validators import validate_model

# kwargs accepted by ChatOllama that we want to forward from the call site
_PASSTHROUGH_KWARGS = (
    "temperature", "top_p", "top_k", "num_predict", "num_ctx",
    "timeout", "callbacks", "format", "keep_alive",
    "reasoning",  # explicit override wins over our auto-default
)

# Model families where Ollama enables thinking by default. Disabling
# thinking on these is the difference between a 120s call that times
# out and a 10s call that completes.
_THINKING_FAMILIES = ("qwen3", "deepseek-r1", "gpt-oss")


def _is_thinking_model(model: str) -> bool:
    """Heuristic: does this Ollama model emit <think> blocks by default?"""
    name = model.lower()
    return any(name.startswith(family) for family in _THINKING_FAMILIES)


class OllamaClient(BaseLLMClient):
    """Client for local Ollama models via langchain-ollama's native /api/chat."""

    provider = "ollama"

    def get_llm(self) -> Any:
        self.warn_if_unknown_model()
        llm_kwargs: dict[str, Any] = {"model": self.model}

        if self.base_url:
            # ChatOllama wants the bare host root (http://localhost:11434),
            # not the /v1 path that ChatOpenAI takes. Strip /v1 if present
            # so existing settings stored as "http://localhost:11434/v1"
            # keep working without forcing a migration.
            base = self.base_url.rstrip("/")
            if base.endswith("/v1"):
                base = base[:-3]
            llm_kwargs["base_url"] = base

        for key in _PASSTHROUGH_KWARGS:
            if key in self.kwargs:
                llm_kwargs[key] = self.kwargs[key]

        # Auto-disable thinking for reasoning-by-default families unless
        # the caller passed `reasoning` explicitly. This is the load-bearing
        # fix for qwen3:14b timeouts on /v1/chat/completions.
        if "reasoning" not in llm_kwargs and _is_thinking_model(self.model):
            llm_kwargs["reasoning"] = False

        return ChatOllama(**llm_kwargs)

    def validate_model(self) -> bool:
        return validate_model("ollama", self.model)
