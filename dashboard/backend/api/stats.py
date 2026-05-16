"""Stats API: /api/stats/overview + /api/stats/tokens."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

import repos.runs as runs_repo
from api.deps import get_session, require_auth
from models.schemas import StatsOverview, TokenStats

logger = logging.getLogger("dashboard.api.stats")
router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/overview", response_model=StatsOverview)
async def get_overview(
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> StatsOverview:
    data = await runs_repo.get_stats_overview(session)
    return StatsOverview(**data)


@router.get("/tokens", response_model=list[TokenStats])
async def get_token_stats(
    days: int = Query(30, ge=1, le=365),
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> list[TokenStats]:
    rows = await runs_repo.get_token_stats(session, days)
    return [TokenStats(**row) for row in rows]
