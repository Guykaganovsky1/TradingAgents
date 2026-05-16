"""Scans repository — async SQLAlchemy 2.x CRUD."""
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.orm import Scan


async def create_scan(
    session: AsyncSession,
    universes: list[str],
    top_n: int = 5,
) -> Scan:
    scan = Scan(
        scan_id=str(uuid.uuid4()),
        universes=json.dumps(universes),
        top_n=top_n,
        status="queued",
        progress_pct=0,
        universe_size=0,
    )
    session.add(scan)
    await session.commit()
    await session.refresh(scan)
    return scan


async def get_scan(session: AsyncSession, scan_id: str) -> Scan | None:
    result = await session.execute(select(Scan).where(Scan.scan_id == scan_id))
    return result.scalar_one_or_none()


async def list_scans(
    session: AsyncSession,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Scan], int]:
    count_result = await session.execute(select(func.count()).select_from(Scan))
    total = count_result.scalar_one()

    query = (
        select(Scan)
        .order_by(Scan.started_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.execute(query)
    return list(result.scalars().all()), total


async def update_scan(
    session: AsyncSession,
    scan_id: str,
    **kwargs,
) -> Scan | None:
    scan = await get_scan(session, scan_id)
    if scan is None:
        return None
    for k, v in kwargs.items():
        setattr(scan, k, v)
    await session.commit()
    await session.refresh(scan)
    return scan


async def update_scan_status(
    session: AsyncSession,
    scan_id: str,
    status: str,
    **kwargs,
) -> Scan | None:
    scan = await get_scan(session, scan_id)
    if scan is None:
        return None
    scan.status = status
    if status == "complete":
        scan.completed_at = datetime.now(tz=UTC)
        scan.progress_pct = 100
    elif status == "error":
        scan.completed_at = datetime.now(tz=UTC)
    for k, v in kwargs.items():
        setattr(scan, k, v)
    await session.commit()
    await session.refresh(scan)
    return scan


async def delete_scan(session: AsyncSession, scan_id: str) -> bool:
    scan = await get_scan(session, scan_id)
    if scan is None:
        return False
    await session.delete(scan)
    await session.commit()
    return True
