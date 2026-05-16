"""Watchlist repository."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.orm import RunIndex, Watchlist


@dataclass
class WatchlistWithLatestRun:
    """Watchlist item augmented with latest run info."""
    item: Watchlist
    latest_decision: str | None
    latest_confidence: float | None
    latest_run_at: datetime | None


async def list_watchlist(session: AsyncSession) -> list[WatchlistWithLatestRun]:
    result = await session.execute(
        select(Watchlist).options(selectinload(Watchlist.schedules)).order_by(Watchlist.ticker)
    )
    items = list(result.scalars().all())

    augmented = []
    for item in items:
        # Find most recent completed run for this ticker
        run_row = (
            await session.execute(
                select(RunIndex)
                .where(RunIndex.ticker == item.ticker)
                .where(RunIndex.status == "done")
                .order_by(RunIndex.finished_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        augmented.append(WatchlistWithLatestRun(
            item=item,
            latest_decision=run_row.decision if run_row else None,
            latest_confidence=None,  # confidence not yet stored
            latest_run_at=run_row.finished_at if run_row else None,
        ))

    return augmented


async def get_by_ticker(session: AsyncSession, ticker: str) -> Watchlist | None:
    result = await session.execute(
        select(Watchlist)
        .options(selectinload(Watchlist.schedules))
        .where(Watchlist.ticker == ticker)
    )
    return result.scalar_one_or_none()


async def get_by_id(session: AsyncSession, watchlist_id: int) -> Watchlist | None:
    result = await session.execute(
        select(Watchlist)
        .options(selectinload(Watchlist.schedules))
        .where(Watchlist.id == watchlist_id)
    )
    return result.scalar_one_or_none()


async def create_watchlist_item(session: AsyncSession, ticker: str) -> Watchlist:
    item = Watchlist(ticker=ticker)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    # Eagerly load schedules
    result = await session.execute(
        select(Watchlist)
        .options(selectinload(Watchlist.schedules))
        .where(Watchlist.id == item.id)
    )
    return result.scalar_one()


async def delete_watchlist_item(session: AsyncSession, ticker: str) -> bool:
    item = await get_by_ticker(session, ticker)
    if item is None:
        return False
    await session.delete(item)
    await session.commit()
    return True
