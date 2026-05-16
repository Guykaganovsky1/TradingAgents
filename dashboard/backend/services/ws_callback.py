"""WebSocket streaming callback handler."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult

logger = logging.getLogger("dashboard.services.ws_callback")


class WebSocketStreamCallback(BaseCallbackHandler):
    """Enqueues JSON-serialisable events into an asyncio.Queue for WebSocket streaming."""

    def __init__(self, queue: asyncio.Queue) -> None:
        super().__init__()
        self._queue = queue

    def _put(self, event: dict) -> None:
        """Non-blocking put; drops if queue is full (consumer is slow)."""
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("WS event queue full — dropping event type=%s", event.get("type"))

    # -- LLM events ----------------------------------------------------------

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        **kwargs: Any,
    ) -> None:
        name = serialized.get("name", serialized.get("id", ["?"])[-1])
        self._put({"type": "llm_start", "model": name})

    def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list[Any]],
        **kwargs: Any,
    ) -> None:
        name = serialized.get("name", serialized.get("id", ["?"])[-1])
        self._put({"type": "llm_start", "model": name})

    def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        try:
            gen = response.generations[0][0]
        except (IndexError, TypeError):
            return

        usage: dict[str, int] = {}
        if hasattr(gen, "message") and hasattr(gen.message, "usage_metadata"):
            meta = gen.message.usage_metadata or {}
            usage = {
                "input_tokens": meta.get("input_tokens", 0),
                "output_tokens": meta.get("output_tokens", 0),
            }
        self._put({"type": "llm_end", "usage": usage})

    def on_llm_error(self, error: BaseException, **kwargs: Any) -> None:
        self._put({"type": "llm_error", "error": str(error)})

    # -- Tool events ---------------------------------------------------------

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        **kwargs: Any,
    ) -> None:
        name = serialized.get("name", "unknown_tool")
        self._put({"type": "tool_start", "tool": name})

    def on_tool_end(self, output: str, **kwargs: Any) -> None:
        self._put({"type": "tool_end"})

    def on_tool_error(self, error: BaseException, **kwargs: Any) -> None:
        self._put({"type": "tool_error", "error": str(error)})

    # -- Agent/chain events --------------------------------------------------

    def on_agent_action(self, action: Any, **kwargs: Any) -> None:
        self._put({"type": "agent_action", "tool": getattr(action, "tool", "?")})

    def on_agent_finish(self, finish: Any, **kwargs: Any) -> None:
        self._put({"type": "agent_finish"})

    def on_chain_start(
        self, serialized: dict[str, Any], inputs: dict[str, Any], **kwargs: Any
    ) -> None:
        name = serialized.get("name", serialized.get("id", ["?"])[-1])
        self._put({"type": "chain_start", "name": name})

    def on_chain_end(self, outputs: dict[str, Any], **kwargs: Any) -> None:
        self._put({"type": "chain_end"})
