"""RunManager: owns active runs and per-run event queues."""
from __future__ import annotations

import asyncio
import contextlib
import logging
from collections import deque
from datetime import UTC, datetime
from typing import Any

from core.config import get_settings

logger = logging.getLogger("dashboard.services.run_manager")

_SENTINEL = object()  # signals stream end


class RunManager:
    """Manages active analysis runs and WebSocket event queues."""

    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task] = {}
        # per run_id: deque of last N events (for reconnect catch-up)
        self._event_buffers: dict[str, deque[dict]] = {}
        # per run_id: set of live asyncio.Queue (one per connected WS client)
        self._subscribers: dict[str, set[asyncio.Queue]] = {}
        self._settings = get_settings()

    # ------------------------------------------------------------------
    # Subscription management
    # ------------------------------------------------------------------

    def subscribe(self, run_id: str) -> asyncio.Queue:
        """Create and register a new subscriber queue for run_id."""
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._subscribers.setdefault(run_id, set()).add(q)
        return q

    def unsubscribe(self, run_id: str, q: asyncio.Queue) -> None:
        subs = self._subscribers.get(run_id)
        if subs:
            subs.discard(q)

    def get_buffer(self, run_id: str) -> list[dict]:
        """Return buffered events so reconnecting clients can catch up."""
        return list(self._event_buffers.get(run_id, []))

    # ------------------------------------------------------------------
    # Event publishing
    # ------------------------------------------------------------------

    def publish(self, run_id: str, event: dict) -> None:
        """Store event in buffer and fanout to all subscribers."""
        buf = self._event_buffers.setdefault(
            run_id, deque(maxlen=self._settings.ws_event_buffer_size)
        )
        buf.append(event)
        for q in list(self._subscribers.get(run_id, [])):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("Subscriber queue full for run %s — dropping event", run_id)

    def publish_done(self, run_id: str) -> None:
        """Signal completion to all subscribers (sentinel value)."""
        for q in list(self._subscribers.get(run_id, [])):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(_SENTINEL)

    @staticmethod
    def is_sentinel(event: Any) -> bool:
        return event is _SENTINEL

    # ------------------------------------------------------------------
    # Run lifecycle
    # ------------------------------------------------------------------

    def is_running(self, run_id: str) -> bool:
        task = self._tasks.get(run_id)
        return task is not None and not task.done()

    def start_run(
        self,
        run_id: str,
        ticker: str,
        analysis_date: str,
        analysts: list[str],
        config: dict,
        db_session_factory,
    ) -> None:
        """Kick off an analysis run as a background asyncio.Task."""
        if self.is_running(run_id):
            return
        task = asyncio.create_task(
            self._run_analysis(run_id, ticker, analysis_date, analysts, config, db_session_factory),
            name=f"run-{run_id}",
        )
        self._tasks[run_id] = task

    async def _run_analysis(
        self,
        run_id: str,
        ticker: str,
        analysis_date: str,
        analysts: list[str],
        config: dict,
        db_session_factory,
    ) -> None:
        """Execute TradingAgentsGraph in a thread pool and stream events."""
        import repos.runs as runs_repo  # noqa: PLC0415
        from services.ws_callback import WebSocketStreamCallback  # noqa: PLC0415

        # Create a queue that the callback writes to
        event_queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
        callback = WebSocketStreamCallback(event_queue)

        # Mark as running in DB
        async with db_session_factory() as session:
            await runs_repo.update_run_status(session, run_id, "running")

        self.publish(run_id, {
            "type": "status",
            "status": "running",
            "timestamp": datetime.now(tz=UTC).isoformat(),
        })

        loop = asyncio.get_event_loop()

        # Stats accumulator
        stats = {
            "tokens_in": 0,
            "tokens_out": 0,
            "llm_calls": 0,
            "tool_calls": 0,
            "decision": None,
        }

        async def _drain_queue():
            """Forward events from callback queue to all subscribers."""
            while True:
                try:
                    evt = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                    # Accumulate stats from events
                    if evt.get("type") == "llm_end" and evt.get("usage"):
                        stats["tokens_in"] += evt["usage"].get("input_tokens", 0)
                        stats["tokens_out"] += evt["usage"].get("output_tokens", 0)
                    elif evt.get("type") == "llm_start":
                        stats["llm_calls"] += 1
                    elif evt.get("type") == "tool_start":
                        stats["tool_calls"] += 1
                    self.publish(run_id, evt)
                    event_queue.task_done()
                except TimeoutError:
                    if _done_flag.is_set():
                        break

        _done_flag = asyncio.Event()

        async def _run_in_thread():
            def _execute():
                import os
                import sys
                # Make tradingagents importable
                project_root = os.path.dirname(os.path.dirname(os.path.dirname(
                    os.path.abspath(__file__)
                )))
                if project_root not in sys.path:
                    sys.path.insert(0, project_root)

                from tradingagents.graph.trading_graph import TradingAgentsGraph  # noqa: PLC0415

                graph = TradingAgentsGraph(
                    selected_analysts=analysts,
                    debug=False,
                    config=config,
                    callbacks=[callback],
                )
                final_state, decision = graph.propagate(ticker, analysis_date)
                return final_state, decision

            return await loop.run_in_executor(None, _execute)

        try:
            drain_task = asyncio.create_task(_drain_queue())

            try:
                final_state, decision = await _run_in_thread()
                stats["decision"] = str(decision).strip() if decision else None
            finally:
                _done_flag.set()
                await drain_task

            # Drain remaining events
            while not event_queue.empty():
                try:
                    evt = event_queue.get_nowait()
                    self.publish(run_id, evt)
                except asyncio.QueueEmpty:
                    break

            # Update DB with success
            async with db_session_factory() as session:
                await runs_repo.update_run_status(
                    session, run_id, "done",
                    decision=stats["decision"],
                    tokens_in=stats["tokens_in"],
                    tokens_out=stats["tokens_out"],
                    llm_calls=stats["llm_calls"],
                    tool_calls=stats["tool_calls"],
                )

            self.publish(run_id, {
                "type": "status",
                "status": "done",
                "decision": stats["decision"],
                "timestamp": datetime.now(tz=UTC).isoformat(),
            })

        except Exception as exc:
            logger.exception("Run %s failed: %s", run_id, exc)
            _done_flag.set()
            async with db_session_factory() as session:
                await runs_repo.update_run_status(
                    session, run_id, "error",
                    error_message=str(exc)[:2000],
                )
            self.publish(run_id, {
                "type": "status",
                "status": "error",
                "error": str(exc)[:500],
                "timestamp": datetime.now(tz=UTC).isoformat(),
            })
        finally:
            self.publish_done(run_id)


# Singleton
_run_manager: RunManager | None = None


def get_run_manager() -> RunManager:
    global _run_manager
    if _run_manager is None:
        _run_manager = RunManager()
    return _run_manager
