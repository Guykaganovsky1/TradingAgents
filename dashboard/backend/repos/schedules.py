"""Schedules repository."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.orm import Schedule, Watchlist


async def get_schedule(session: AsyncSession, schedule_id: int) -> Schedule | None:
    result = await session.execute(
        select(Schedule).where(Schedule.id == schedule_id)
    )
    return result.scalar_one_or_none()


async def create_schedule(
    session: AsyncSession,
    watchlist_id: int,
    cron_expr: str,
    analysts: list[str],
    enabled: bool = True,
) -> Schedule:
    sched = Schedule(
        watchlist_id=watchlist_id,
        cron_expr=cron_expr,
        analysts=analysts,
        enabled=enabled,
    )
    session.add(sched)
    await session.commit()
    await session.refresh(sched)
    return sched


async def update_schedule(
    session: AsyncSession,
    schedule_id: int,
    **kwargs,
) -> Schedule | None:
    sched = await get_schedule(session, schedule_id)
    if sched is None:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(sched, k, v)
    await session.commit()
    await session.refresh(sched)
    return sched


async def delete_schedule(session: AsyncSession, schedule_id: int) -> bool:
    sched = await get_schedule(session, schedule_id)
    if sched is None:
        return False
    await session.delete(sched)
    await session.commit()
    return True


async def list_schedules_for_ticker(
    session: AsyncSession, ticker: str
) -> list[tuple[Schedule, str]]:
    result = await session.execute(
        select(Schedule, Watchlist.ticker)
        .join(Watchlist, Schedule.watchlist_id == Watchlist.id)
        .where(Watchlist.ticker == ticker)
    )
    return list(result.all())


async def list_all_enabled_schedules(
    session: AsyncSession,
) -> list[tuple[Schedule, str]]:
    result = await session.execute(
        select(Schedule, Watchlist.ticker)
        .join(Watchlist, Schedule.watchlist_id == Watchlist.id)
        .where(Schedule.enabled.is_(True))
    )
    return list(result.all())
