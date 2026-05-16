"""ScanManager: orchestrates scan lifecycle, streams progress via event queues."""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
import time
from collections import deque
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("dashboard.scanner.manager")

_SENTINEL = object()
_TICKER_RE = re.compile(r"^[A-Z0-9.\-]{1,15}$")
_SCAN_CONCURRENCY = 20  # per-ticker semaphore

USER_AGENT = "TradingAgents-Dashboard-Scanner/0.1 (+https://github.com/Guykaganovsky1/TradingAgents)"


def _sanitize_ticker(symbol: str) -> str | None:
    """Uppercase and validate ticker. Returns None if invalid."""
    s = symbol.strip().upper()
    if _TICKER_RE.match(s):
        return s
    return None


class ScanManager:
    """Manages active scans, per-scan event queues, and WebSocket broadcast."""

    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task] = {}
        self._event_buffers: dict[str, deque[dict]] = {}
        self._subscribers: dict[str, set[asyncio.Queue]] = {}

    # ------------------------------------------------------------------
    # Subscription management (mirrors RunManager pattern)
    # ------------------------------------------------------------------

    def subscribe(self, scan_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._subscribers.setdefault(scan_id, set()).add(q)
        return q

    def unsubscribe(self, scan_id: str, q: asyncio.Queue) -> None:
        subs = self._subscribers.get(scan_id)
        if subs:
            subs.discard(q)

    def get_buffer(self, scan_id: str) -> list[dict]:
        return list(self._event_buffers.get(scan_id, []))

    def is_running(self, scan_id: str) -> bool:
        task = self._tasks.get(scan_id)
        return task is not None and not task.done()

    @staticmethod
    def is_sentinel(event: Any) -> bool:
        return event is _SENTINEL

    # ------------------------------------------------------------------
    # Event publishing
    # ------------------------------------------------------------------

    def publish(self, scan_id: str, event: dict) -> None:
        buf = self._event_buffers.setdefault(scan_id, deque(maxlen=50))
        buf.append(event)
        for q in list(self._subscribers.get(scan_id, [])):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("Subscriber queue full for scan %s — dropping event", scan_id)

    def publish_done(self, scan_id: str) -> None:
        for q in list(self._subscribers.get(scan_id, [])):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(_SENTINEL)

    # ------------------------------------------------------------------
    # Scan lifecycle
    # ------------------------------------------------------------------

    def start_scan(
        self,
        scan_id: str,
        universes: list[str],
        top_n: int,
        min_price: float | None,
        min_volume_usd: float | None,
        db_session_factory,
        alpha_vantage_key: str | None = None,
        reddit_client_id: str | None = None,
        reddit_client_secret: str | None = None,
    ) -> None:
        if self.is_running(scan_id):
            return
        task = asyncio.create_task(
            self._run_scan(
                scan_id,
                universes,
                top_n,
                min_price,
                min_volume_usd,
                db_session_factory,
                alpha_vantage_key,
                reddit_client_id,
                reddit_client_secret,
            ),
            name=f"scan-{scan_id}",
        )
        self._tasks[scan_id] = task

    async def _run_scan(
        self,
        scan_id: str,
        universes: list[str],
        top_n: int,
        min_price: float | None,
        min_volume_usd: float | None,
        db_session_factory,
        alpha_vantage_key: str | None,
        reddit_client_id: str | None,
        reddit_client_secret: str | None,
    ) -> None:
        import repos.scans as scans_repo  # noqa: PLC0415

        # Mark running
        async with db_session_factory() as session:
            await scans_repo.update_scan_status(session, scan_id, "running")

        self.publish(scan_id, {
            "type": "status",
            "status": "running",
            "timestamp": datetime.now(tz=UTC).isoformat(),
        })

        try:
            # Step 1: Build universe
            candidates = await self._build_universe(scan_id, universes, db_session_factory)

            # Sanitize tickers
            candidates = [c for c in candidates if _sanitize_ticker(c.symbol) is not None]

            # Deduplicate by symbol
            seen: set[str] = set()
            deduped = []
            for c in candidates:
                if c.symbol not in seen:
                    seen.add(c.symbol)
                    deduped.append(c)
            candidates = deduped

            # Apply price/volume filters (only if we have the data from the universe)
            if min_price is not None:
                candidates = [
                    c for c in candidates
                    if c.price is None or c.price >= min_price
                ]
            if min_volume_usd is not None:
                candidates = [
                    c for c in candidates
                    if c.volume_usd_24h is None or c.volume_usd_24h >= min_volume_usd
                ]

            universe_size = len(candidates)
            async with db_session_factory() as session:
                await scans_repo.update_scan(
                    session, scan_id, universe_size=universe_size, progress_pct=5
                )

            self.publish(scan_id, {
                "type": "universe_built",
                "universe_size": universe_size,
            })

            if universe_size == 0:
                raise ValueError("Universe is empty after filtering")

            # Step 2: Score all candidates
            results = await self._score_all(
                scan_id,
                candidates,
                db_session_factory,
                alpha_vantage_key,
                reddit_client_id,
                reddit_client_secret,
                top_n,
            )

            # Step 3: Serialize and persist
            results_json = json.dumps([r.dict() for r in results], default=str)
            async with db_session_factory() as session:
                await scans_repo.update_scan_status(
                    session, scan_id, "complete",
                    results=results_json,
                    progress_pct=100,
                )

            self.publish(scan_id, {
                "type": "scan_complete",
                "top": [r.dict() for r in results],
            })

        except Exception as exc:
            logger.exception("Scan %s failed: %s", scan_id, exc)
            async with db_session_factory() as session:
                await scans_repo.update_scan_status(
                    session, scan_id, "error",
                    error_message=str(exc)[:2000],
                )
            self.publish(scan_id, {
                "type": "scan_error",
                "message": str(exc)[:500],
            })
        finally:
            self.publish_done(scan_id)

    async def _build_universe(self, scan_id: str, universes: list[str], db_session_factory) -> list:
        """Fetch all requested universes and merge candidates."""
        from services.scanner.universes import (  # noqa: PLC0415
            CryptoUniverse,
            Nasdaq100Universe,
            SP500Universe,
            WatchlistUniverse,
        )

        all_candidates = []
        for universe_name in universes:
            try:
                if universe_name == "watchlist":
                    async with db_session_factory() as session:
                        provider = WatchlistUniverse(session)
                        items = await provider.fetch()
                elif universe_name == "sp500":
                    provider = SP500Universe()
                    items = await provider.fetch()
                elif universe_name == "nasdaq100":
                    provider = Nasdaq100Universe()
                    items = await provider.fetch()
                elif universe_name == "crypto":
                    provider = CryptoUniverse()
                    items = await provider.fetch()
                else:
                    logger.warning("Unknown universe: %s", universe_name)
                    items = []
                all_candidates.extend(items)
                logger.info("Universe %s: %d candidates", universe_name, len(items))
            except Exception as exc:
                logger.warning("Universe %s failed: %s", universe_name, exc)
        return all_candidates

    async def _score_all(
        self,
        scan_id: str,
        candidates: list,
        db_session_factory,
        alpha_vantage_key: str | None,
        reddit_client_id: str | None,
        reddit_client_secret: str | None,
        top_n: int,
    ) -> list:
        """Score all candidates with per-factor concurrency and emit progress events."""
        import repos.scans as scans_repo  # noqa: PLC0415
        from models.schemas import FactorDetail, ScannerResult  # noqa: PLC0415
        from services.scanner.factors import (  # noqa: PLC0415
            FundamentalFactor,
            NewsFactor,
            SentimentFactor,
            TechnicalFactor,
        )
        from services.scanner.scorer import (  # noqa: PLC0415
            build_suggested_analysts,
            compute_composite,
        )

        technical_f = TechnicalFactor()
        news_f = NewsFactor(alpha_vantage_key=alpha_vantage_key)
        sentiment_f = SentimentFactor(
            client_id=reddit_client_id,
            client_secret=reddit_client_secret,
        )
        fundamental_f = FundamentalFactor()

        factor_map = {
            "technical": technical_f,
            "news": news_f,
            "sentiment": sentiment_f,
            "fundamental": fundamental_f,
        }
        factor_weights = {
            "technical": 0.40,
            "news": 0.30,
            "sentiment": 0.20,
            "fundamental": 0.10,
        }

        sem = asyncio.Semaphore(_SCAN_CONCURRENCY)
        total = len(candidates)

        # Track factor-level progress
        factor_progress: dict[str, dict] = {
            name: {"completed": 0, "total": total, "status": "pending"}
            for name in factor_map
        }

        # Per-factor result storage
        factor_results_store: dict[str, dict[str, Any]] = {c.symbol: {} for c in candidates}

        async def score_ticker_factor(symbol: str, asset_class: str, fname: str, scorer) -> None:
            async with sem:
                try:
                    result = await scorer.score(symbol, asset_class)
                except Exception as exc:
                    logger.debug("Factor %s failed for %s: %s", fname, symbol, exc)
                    from services.scanner.factors.base import FactorResult  # noqa: PLC0415
                    result = FactorResult(score=None, signals=["Error"])
                factor_results_store[symbol][fname] = result

        # Run all factors in parallel across all tickers
        factor_start_times: dict[str, float] = {}
        factor_tasks_by_factor: dict[str, list[asyncio.Task]] = {}

        for fname, scorer in factor_map.items():
            factor_start_times[fname] = time.time()
            tasks = []
            for c in candidates:
                t = asyncio.create_task(
                    score_ticker_factor(c.symbol, c.asset_class, fname, scorer)
                )
                tasks.append(t)
            factor_tasks_by_factor[fname] = tasks

        # Update progress as factor tasks complete
        async def track_factor_progress(fname: str, tasks: list[asyncio.Task]) -> None:
            for completed, t in enumerate(asyncio.as_completed(tasks), start=1):
                await t
                factor_progress[fname]["completed"] = completed

                # Publish factor_progress event every ~10% or at least every 25 tickers
                if completed % max(1, total // 10) == 0 or completed == total:
                    self.publish(scan_id, {
                        "type": "factor_progress",
                        "factor": fname,
                        "completed": completed,
                        "total": total,
                    })

                # Update DB progress
                if completed % max(1, total // 5) == 0:
                    pct = 5 + int(85 * sum(fp["completed"] for fp in factor_progress.values()) / (total * len(factor_map)))
                    fp_json = json.dumps({
                        n: "done" if fp["completed"] == total else "running"
                        for n, fp in factor_progress.items()
                    })
                    async with db_session_factory() as session:
                        await scans_repo.update_scan(
                            session, scan_id, progress_pct=pct, factor_progress=fp_json
                        )

            # Factor complete
            duration_s = round(time.time() - factor_start_times[fname], 1)
            self.publish(scan_id, {
                "type": "factor_complete",
                "factor": fname,
                "duration_s": duration_s,
            })
            factor_progress[fname]["status"] = "done"

        # Run all progress trackers concurrently
        tracker_tasks = [
            asyncio.create_task(track_factor_progress(fname, tasks))
            for fname, tasks in factor_tasks_by_factor.items()
        ]
        await asyncio.gather(*tracker_tasks, return_exceptions=True)

        # Build scored results
        scored: list[ScannerResult] = []
        for c in candidates:
            fr = factor_results_store.get(c.symbol, {})
            composite = compute_composite(fr, c.asset_class, factor_weights)
            if composite is None:
                continue  # exclude tickers where all factors failed

            suggested = build_suggested_analysts(fr, c.asset_class)
            analyst_str = ",".join(suggested)
            run_url = f"/run?ticker={c.symbol}&analysts={analyst_str}"

            factors_out: dict[str, FactorDetail] = {}
            for fname, weight in factor_weights.items():
                fr_item = fr.get(fname)
                if fr_item:
                    factors_out[fname] = FactorDetail(
                        score=fr_item.score,
                        weight=weight,
                        signals=fr_item.signals or [],
                    )
                else:
                    factors_out[fname] = FactorDetail(score=None, weight=weight, signals=[])

            scored.append(ScannerResult(
                symbol=c.symbol,
                name=c.name,
                asset_class=c.asset_class,
                composite_score=composite,
                rank=0,  # assigned below
                factors=factors_out,
                price=c.price,
                price_change_24h_pct=c.price_change_24h_pct,
                volume_usd_24h=c.volume_usd_24h,
                suggested_analysts=suggested,
                run_url=run_url,
            ))

        # Sort and assign ranks
        scored.sort(key=lambda s: s.composite_score, reverse=True)
        top = scored[:top_n]
        for i, r in enumerate(top):
            r.rank = i + 1

        return top


# Singleton
_scan_manager: ScanManager | None = None


def get_scan_manager() -> ScanManager:
    global _scan_manager
    if _scan_manager is None:
        _scan_manager = ScanManager()
    return _scan_manager
