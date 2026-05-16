"""GET /healthz — unauthenticated health check."""
from __future__ import annotations

import time

from fastapi import APIRouter

from models.schemas import HealthResponse

router = APIRouter()

_START_TIME = time.time()
_VERSION = "0.1.0"


@router.get("/healthz", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=_VERSION,
        uptime_seconds=round(time.time() - _START_TIME, 1),
    )
