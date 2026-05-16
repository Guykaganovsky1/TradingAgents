"""Watchlist API: /api/watchlist + /api/watchlist/{ticker}/schedules."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import repos.schedules as schedules_repo
import repos.watchlist as watchlist_repo
from api.deps import get_session, require_auth
from core.logging import get_audit_logger
from models.schemas import (
    ScheduleCreate,
    ScheduleDetail,
    WatchlistCreate,
    WatchlistItem,
    WatchlistItemWithSchedules,
)

logger = logging.getLogger("dashboard.api.watchlist")
router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


@router.get("", response_model=list[WatchlistItemWithSchedules])
async def list_watchlist(
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> list[WatchlistItemWithSchedules]:
    rows = await watchlist_repo.list_watchlist(session)
    result = []
    for row in rows:
        obj = WatchlistItemWithSchedules.model_validate(row.item)
        obj.latest_decision = row.latest_decision
        obj.latest_confidence = row.latest_confidence
        obj.latest_run_at = row.latest_run_at
        result.append(obj)
    return result


@router.post("", response_model=WatchlistItem, status_code=201)
async def add_to_watchlist(
    body: WatchlistCreate,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> WatchlistItem:
    existing = await watchlist_repo.get_by_ticker(session, body.ticker)
    if existing:
        raise HTTPException(status_code=409, detail=f"Ticker '{body.ticker}' already in watchlist")
    item = await watchlist_repo.create_watchlist_item(session, body.ticker)
    get_audit_logger().info("watchlist.add ticker=%s", body.ticker)
    logger.info("Added %s to watchlist", body.ticker)
    return WatchlistItem.model_validate(item)


@router.delete("/{ticker}", status_code=204)
async def remove_from_watchlist(
    ticker: str,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> None:
    deleted = await watchlist_repo.delete_watchlist_item(session, ticker.upper())
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Ticker '{ticker}' not in watchlist")
    get_audit_logger().info("watchlist.remove ticker=%s", ticker)


@router.get("/{ticker}/schedules", response_model=list[ScheduleDetail])
async def list_ticker_schedules(
    ticker: str,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> list[ScheduleDetail]:
    rows = await schedules_repo.list_schedules_for_ticker(session, ticker.upper())
    result = []
    for sched, t in rows:
        detail = ScheduleDetail.model_validate(sched)
        detail.ticker = t
        result.append(detail)
    return result


@router.post("/{ticker}/schedules", response_model=ScheduleDetail, status_code=201)
async def create_ticker_schedule(
    ticker: str,
    body: ScheduleCreate,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> ScheduleDetail:
    item = await watchlist_repo.get_by_ticker(session, ticker.upper())
    if item is None:
        raise HTTPException(
            status_code=404, detail=f"Ticker '{ticker}' not in watchlist — add it first"
        )
    sched = await schedules_repo.create_schedule(
        session,
        watchlist_id=item.id,
        cron_expr=body.cron_expr,
        analysts=[a.value for a in body.analysts],
        enabled=body.enabled,
    )
    get_audit_logger().info(
        "schedule.create ticker=%s cron=%s analysts=%s", ticker, body.cron_expr, body.analysts
    )
    detail = ScheduleDetail.model_validate(sched)
    detail.ticker = ticker.upper()
    return detail
