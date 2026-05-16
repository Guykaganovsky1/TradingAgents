"""Scans API: CRUD + WebSocket streaming for market scanner."""
from __future__ import annotations

import json
import logging

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy.ext.asyncio import AsyncSession

import repos.scans as scans_repo
import repos.settings as settings_repo
from api.deps import get_session, require_auth
from core.db import get_session_factory
from core.logging import get_audit_logger
from core.rate_limit import limiter
from core.security import decrypt_secret, get_api_token
from models.schemas import (
    ScanCreate,
    ScanListResponse,
    ScanSummary,
)
from services.scanner.manager import get_scan_manager

logger = logging.getLogger("dashboard.api.scans")
router = APIRouter(prefix="/api/scans", tags=["scans"])


async def _load_scanner_settings(session: AsyncSession) -> dict:
    """Load scanner-related settings from app_settings."""
    all_settings = await settings_repo.get_all_settings(session)
    setting_map = {s.key: s for s in all_settings}

    alpha_key: str | None = None
    if "alpha_vantage_api_key" in setting_map and setting_map["alpha_vantage_api_key"].value_encrypted:
        try:
            alpha_key = decrypt_secret(setting_map["alpha_vantage_api_key"].value_encrypted)
        except Exception:
            logger.warning("Failed to decrypt alpha_vantage_api_key")

    reddit_id: str | None = None
    if "reddit_client_id" in setting_map and setting_map["reddit_client_id"].value_plain:
        reddit_id = setting_map["reddit_client_id"].value_plain

    reddit_secret: str | None = None
    if "reddit_client_secret" in setting_map and setting_map["reddit_client_secret"].value_encrypted:
        try:
            reddit_secret = decrypt_secret(setting_map["reddit_client_secret"].value_encrypted)
        except Exception:
            logger.warning("Failed to decrypt reddit_client_secret")

    return {
        "alpha_vantage_key": alpha_key,
        "reddit_client_id": reddit_id,
        "reddit_client_secret": reddit_secret,
    }


@router.post("", response_model=ScanSummary, status_code=202)
@limiter.limit("5/minute")
async def create_scan(
    request: Request,
    body: ScanCreate,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> ScanSummary:
    """Start a new market scan. Returns immediately with scan_id."""
    scanner_settings = await _load_scanner_settings(session)

    scan = await scans_repo.create_scan(
        session,
        universes=body.universes,
        top_n=body.top_n,
    )

    get_audit_logger().info(
        "scan.start id=%s universes=%s top_n=%d",
        scan.scan_id, body.universes, body.top_n,
    )

    mgr = get_scan_manager()
    mgr.start_scan(
        scan_id=scan.scan_id,
        universes=body.universes,
        top_n=body.top_n,
        min_price=body.min_price,
        min_volume_usd=body.min_volume_usd,
        db_session_factory=get_session_factory(),
        alpha_vantage_key=scanner_settings["alpha_vantage_key"],
        reddit_client_id=scanner_settings["reddit_client_id"],
        reddit_client_secret=scanner_settings["reddit_client_secret"],
    )

    logger.info("Queued scan %s for universes %s", scan.scan_id, body.universes)
    return ScanSummary.model_validate(scan)


@router.get("", response_model=ScanListResponse)
async def list_scans(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> ScanListResponse:
    """List scan history, newest first."""
    items, total = await scans_repo.list_scans(session, limit=limit, offset=offset)
    return ScanListResponse(
        items=[ScanSummary.model_validate(s) for s in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{scan_id}", response_model=ScanSummary)
async def get_scan(
    scan_id: str,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> ScanSummary:
    """Get full scan record including results when complete."""
    scan = await scans_repo.get_scan(session, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return ScanSummary.model_validate(scan)


@router.get("/{scan_id}/results")
async def get_scan_results(
    scan_id: str,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> dict:
    """Sugar endpoint: just the results JSON when scan is complete."""
    scan = await scans_repo.get_scan(session, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status != "complete":
        raise HTTPException(
            status_code=409,
            detail=f"Scan is not complete (status: {scan.status})",
        )
    results = json.loads(scan.results) if scan.results else []
    return {"scan_id": scan_id, "results": results}


@router.delete("/{scan_id}", status_code=204)
async def delete_scan(
    scan_id: str,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> None:
    """Remove a scan from history. Cannot delete a running scan."""
    scan = await scans_repo.get_scan(session, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status == "running":
        raise HTTPException(status_code=409, detail="Cannot delete a running scan")

    get_audit_logger().info("scan.delete id=%s", scan_id)
    await scans_repo.delete_scan(session, scan_id)


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

async def ws_scan(websocket: WebSocket, scan_id: str) -> None:
    """Stream scan events to connected clients."""
    token = websocket.query_params.get("token")
    if not token or token != get_api_token():
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    mgr = get_scan_manager()

    # Send buffered events for reconnect catch-up
    buffered = mgr.get_buffer(scan_id)
    if buffered:
        await websocket.send_text(json.dumps({
            "type": "state_snapshot",
            "events": buffered,
        }))

    q = mgr.subscribe(scan_id)
    try:
        while True:
            event = await q.get()
            if mgr.is_sentinel(event):
                await websocket.send_text(json.dumps({"type": "stream_end"}))
                break
            await websocket.send_text(json.dumps(event, default=str))
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for scan %s", scan_id)
    except Exception as exc:
        logger.error("WebSocket error for scan %s: %s", scan_id, exc)
    finally:
        mgr.unsubscribe(scan_id, q)
