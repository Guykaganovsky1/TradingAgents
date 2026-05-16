"""Schedules API: /api/schedules/{id}."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import repos.schedules as schedules_repo
import repos.watchlist as watchlist_repo
from api.deps import get_session, require_auth
from core.logging import get_audit_logger
from models.schemas import ScheduleDetail, ScheduleUpdate

logger = logging.getLogger("dashboard.api.schedules")
router = APIRouter(prefix="/api/schedules", tags=["schedules"])


@router.get("/{schedule_id}", response_model=ScheduleDetail)
async def get_schedule(
    schedule_id: int,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> ScheduleDetail:
    sched = await schedules_repo.get_schedule(session, schedule_id)
    if sched is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    wl = await watchlist_repo.get_by_id(session, sched.watchlist_id)
    detail = ScheduleDetail.model_validate(sched)
    detail.ticker = wl.ticker if wl else None
    return detail


@router.patch("/{schedule_id}", response_model=ScheduleDetail)
async def update_schedule(
    schedule_id: int,
    body: ScheduleUpdate,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> ScheduleDetail:
    updates = body.model_dump(exclude_none=True)
    if "analysts" in updates:
        updates["analysts"] = [a.value if hasattr(a, "value") else a for a in updates["analysts"]]

    sched = await schedules_repo.update_schedule(session, schedule_id, **updates)
    if sched is None:
        raise HTTPException(status_code=404, detail="Schedule not found")

    get_audit_logger().info("schedule.update id=%d fields=%s", schedule_id, list(updates.keys()))

    wl = await watchlist_repo.get_by_id(session, sched.watchlist_id)
    detail = ScheduleDetail.model_validate(sched)
    detail.ticker = wl.ticker if wl else None
    return detail


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: int,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> None:
    deleted = await schedules_repo.delete_schedule(session, schedule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Schedule not found")
    get_audit_logger().info("schedule.delete id=%d", schedule_id)
