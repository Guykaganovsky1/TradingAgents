"""LLM catalog: static model options + dynamic Ollama tag fetch."""
from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger("dashboard.services.llm_catalog")


# ---------------------------------------------------------------------------
# Codex extras (not in upstream model_catalog).
# The Codex API (Responses API) and Codex CLI are exposed as separate
# providers so the user can wire the coding-planner agent independently.
# ---------------------------------------------------------------------------
OPENCODE_GO_MODELS: dict[str, list[dict[str, str]]] = {
    # OpenCode Go subscription proxy. One API key fronts ~12 frontier
    # coding-tuned models via standard OpenAI Chat Completions wire format.
    # Endpoint: https://opencode.ai/zen/go/v1
    # Verified end-to-end (tool_calls returned correctly) on 2026-05-20.
    "deep": [
        {"label": "Kimi K2.6 — Moonshot's flagship, 200k ctx", "value": "kimi-k2.6"},
        {"label": "GLM-5.1 — Zhipu, strong coding & reasoning", "value": "glm-5.1"},
        {"label": "DeepSeek V4 Pro — Best DeepSeek tier", "value": "deepseek-v4-pro"},
        {"label": "Qwen 3.6 Plus — Alibaba's latest", "value": "qwen3.6-plus"},
        {"label": "MiMo V2.5 Pro — Xiaomi's reasoning model", "value": "mimo-v2.5-pro"},
        {"label": "Kimi K2.5 — Earlier Kimi K2 variant", "value": "kimi-k2.5"},
        {"label": "GLM-5 — Previous Zhipu flagship", "value": "glm-5"},
    ],
    "quick": [
        {"label": "DeepSeek V4 Flash — Fastest, cheapest", "value": "deepseek-v4-flash"},
        {"label": "MiMo V2.5 — Faster MiMo variant", "value": "mimo-v2.5"},
        {"label": "Qwen 3.5 Plus — Solid baseline Qwen", "value": "qwen3.5-plus"},
        {"label": "Kimi K2.5 — Faster Kimi", "value": "kimi-k2.5"},
    ],
}


MOONSHOT_MODELS: dict[str, list[dict[str, str]]] = {
    # Moonshot AI models. All OpenAI-compatible function-calling.
    # Endpoint: https://api.moonshot.ai/v1
    "deep": [
        {"label": "Kimi K2 (latest preview) — 200k ctx, strong reasoning", "value": "kimi-k2-0905-preview"},
        {"label": "Kimi K2 (turbo) — Faster Kimi K2 variant", "value": "kimi-k2-turbo-preview"},
        {"label": "Moonshot v1 128k — Long-context legacy", "value": "moonshot-v1-128k"},
        {"label": "Kimi Latest — Auto-rolling latest stable", "value": "kimi-latest"},
    ],
    "quick": [
        {"label": "Moonshot v1 8k — Cheapest, short tasks", "value": "moonshot-v1-8k"},
        {"label": "Moonshot v1 32k — Mid-range, balanced", "value": "moonshot-v1-32k"},
        {"label": "Kimi K2 (turbo) — Fast K2 variant", "value": "kimi-k2-turbo-preview"},
    ],
}


CODEX_EXTRAS: dict[str, dict[str, list[dict[str, str]]]] = {
    "codex": {
        "deep": [
            {"label": "GPT-5 Codex - Coding-tuned, Responses API", "value": "gpt-5-codex"},
            {"label": "GPT-5 Codex Mini - Faster, cheaper coding", "value": "gpt-5-codex-mini"},
        ],
        "quick": [
            {"label": "GPT-5 Codex Mini - Faster, cheaper coding", "value": "gpt-5-codex-mini"},
        ],
    },
    "codex-cli": {
        # The Codex CLI defaults to the model in ~/.codex/config.toml.
        # Empty string = let CLI choose; explicit values override.
        "deep": [
            {"label": "(config.toml default) - Use account's Codex model", "value": ""},
            {"label": "GPT-5 Codex - via ChatGPT Plus subscription", "value": "gpt-5-codex"},
        ],
        "quick": [
            {"label": "(config.toml default) - Use account's Codex model", "value": ""},
        ],
    },
    "kimi-cli": {
        # Kimi CLI (Moonshot AI). Coding agent like Codex CLI — uses Kimi
        # account auth via `kimi login`. Empty value = default from
        # ~/.kimi/config.toml. Best used as the Coding Planner agent,
        # not as the main analyst LLM (no LangChain bind_tools support).
        "deep": [
            {"label": "(config.toml default) - Use account's Kimi model", "value": ""},
            {"label": "Kimi K2 (0905 preview) - 200k ctx, strong coding", "value": "kimi-k2-0905-preview"},
            {"label": "Kimi K2 (turbo) - Faster variant", "value": "kimi-k2-turbo-preview"},
        ],
        "quick": [
            {"label": "(config.toml default) - Use account's Kimi model", "value": ""},
            {"label": "Kimi K2 (turbo) - Faster variant", "value": "kimi-k2-turbo-preview"},
        ],
    },
}


def get_providers() -> list[str]:
    """Return list of known LLM providers (upstream + Codex extras)."""
    # Add project root to path to import tradingagents
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    try:
        from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS  # noqa: PLC0415
        upstream = list(MODEL_OPTIONS.keys())
    except ImportError:
        logger.warning("Could not import model_catalog; returning Codex-only provider list")
        upstream = []

    # Append Codex providers (de-duped) so they're selectable in the UI.
    for codex_provider in CODEX_EXTRAS:
        if codex_provider not in upstream:
            upstream.append(codex_provider)
    # Moonshot — OpenAI-compatible Kimi K2 + moonshot-v1 family.
    if "moonshot" not in upstream:
        upstream.append("moonshot")
    # Kimi for Coding — separate endpoint (api.kimi.com/coding/v1), sk-kimi-* keys.
    if "kimi" not in upstream:
        upstream.append("kimi")
    # OpenCode Go — subscription proxy fronting Kimi K2.6/GLM-5.1/DeepSeek V4/...
    if "opencode-go" not in upstream:
        upstream.append("opencode-go")
    return upstream


def get_model_options() -> dict[str, dict[str, list[dict[str, str]]]]:
    """Return model options per provider and mode."""
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    try:
        from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS  # noqa: PLC0415
    except ImportError:
        logger.warning("Could not import model_catalog")
        return {}

    result: dict[str, dict[str, list[dict[str, str]]]] = {}
    for provider, modes in MODEL_OPTIONS.items():
        result[provider] = {}
        for mode, options in modes.items():
            result[provider][mode] = [
                {"label": label, "value": value} for label, value in options
            ]
    # Merge Codex extras (not in upstream catalog).
    for codex_provider, modes in CODEX_EXTRAS.items():
        if codex_provider not in result:
            result[codex_provider] = {mode: list(opts) for mode, opts in modes.items()}
    # Merge Moonshot models.
    if "moonshot" not in result:
        result["moonshot"] = {mode: list(opts) for mode, opts in MOONSHOT_MODELS.items()}
    # Kimi for Coding — single model name. The /coding/v1 endpoint only
    # exposes one model: 'kimi-for-coding' (display name Kimi-k2.6,
    # 262k context, reasoning + vision capable).
    if "kimi" not in result:
        result["kimi"] = {
            "deep":  [{"label": "Kimi-k2.6 (for Coding) - 262k ctx, reasoning", "value": "kimi-for-coding"}],
            "quick": [{"label": "Kimi-k2.6 (for Coding) - 262k ctx, reasoning", "value": "kimi-for-coding"}],
        }
    # OpenCode Go — full curated catalog (Kimi K2.6 + GLM-5.1 + DeepSeek V4 + …).
    if "opencode-go" not in result:
        result["opencode-go"] = {mode: list(opts) for mode, opts in OPENCODE_GO_MODELS.items()}
    return result


async def fetch_ollama_models(base_url: str | None = None) -> list[str]:
    """Fetch available Ollama models via /api/tags endpoint."""
    import httpx  # noqa: PLC0415

    url = (base_url or "http://localhost:11434").rstrip("/") + "/api/tags"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return [m["name"] for m in data.get("models", [])]
    except Exception as exc:
        logger.warning("Could not fetch Ollama models from %s: %s", url, exc)
        return []
