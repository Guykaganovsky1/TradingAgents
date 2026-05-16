"""Watchlist universe: reads from dashboard.db watchlist table."""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.orm import Watchlist

from .base import ScanCandidate

logger = logging.getLogger("dashboard.scanner.universes.watchlist")


class WatchlistUniverse:
    """Returns all tickers from the user's watchlist."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def fetch(self) -> list[ScanCandidate]:
        try:
            result = await self._session.execute(select(Watchlist))
            items = list(result.scalars().all())
            candidates = [
                ScanCandidate(
                    symbol=item.ticker,
                    name=item.display_name or item.ticker,
                    asset_class="stock",
                )
                for item in items
            ]
            logger.info("Watchlist universe: %d tickers", len(candidates))
            return candidates
        except Exception as exc:
            logger.warning("Watchlist fetch failed: %s", exc)
            return []
