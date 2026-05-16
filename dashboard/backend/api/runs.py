"""Runs API: CRUD + report sections + WS streaming."""
from __future__ import annotations

import contextlib
import json
import logging
import re

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

import repos.runs as runs_repo
import repos.settings as settings_repo
from api.deps import get_session, require_auth
from core.config import get_settings
from core.db import get_session_factory
from core.logging import get_audit_logger
from core.rate_limit import limiter
from core.security import decrypt_secret, get_api_token
from models.schemas import RunCreate, RunListResponse, RunSummary
from services.report_reader import VALID_SECTIONS, read_report_section_by_date
from services.run_manager import get_run_manager
from services.ticker_validator import validate_ticker as _validate_ticker

logger = logging.getLogger("dashboard.api.runs")
router = APIRouter(prefix="/api/runs", tags=["runs"])

_MODEL_ID_RE = re.compile(r"^[a-zA-Z0-9._:/-]+$")


async def _build_run_config(session: AsyncSession) -> dict:
    """Build TradingAgents config from stored settings."""
    import os  # noqa: PLC0415,E401
    import sys

    from tradingagents.default_config import DEFAULT_CONFIG  # noqa: PLC0415

    # Make tradingagents importable
    project_root = get_settings().data_dir.parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    config = dict(DEFAULT_CONFIG)

    all_settings = await settings_repo.get_all_settings(session)
    setting_map = {s.key: s for s in all_settings}

    plain_keys = ["llm_provider", "deep_think_llm", "quick_think_llm", "backend_url",
                  "output_language", "max_debate_rounds", "max_risk_discuss_rounds"]
    for key in plain_keys:
        if key in setting_map and setting_map[key].value_plain is not None:
            val = setting_map[key].value_plain
            if key in ("max_debate_rounds", "max_risk_discuss_rounds"):
                with contextlib.suppress(ValueError):
                    val = int(val)
            config[key] = val

    # Decrypt and inject API keys into environment (TradingAgentsGraph reads from env)
    key_env_map = {
        "openai_api_key": "OPENAI_API_KEY",
        "anthropic_api_key": "ANTHROPIC_API_KEY",
        "google_api_key": "GOOGLE_API_KEY",
    }
    for db_key, env_var in key_env_map.items():
        if db_key in setting_map and setting_map[db_key].value_encrypted:
            try:
                plain = decrypt_secret(setting_map[db_key].value_encrypted)
                os.environ[env_var] = plain
            except Exception:
                logger.warning("Failed to decrypt %s", db_key)

    return config


@router.get("/validate/{symbol}")
async def validate_symbol(
    symbol: str,
    _auth=Depends(require_auth),
) -> dict:
    """Validate a ticker symbol via yfinance."""
    # Re-validate regex before the yfinance call
    from models.schemas import TICKER_REGEX  # noqa: PLC0415
    symbol = symbol.strip().upper()
    if not TICKER_REGEX.match(symbol):
        return {"valid": False, "message": "Invalid ticker format"}

    valid, message = await _validate_ticker(symbol)
    return {"valid": valid, "message": message, "ticker": symbol}


@router.get("", response_model=RunListResponse)
async def list_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ticker: str | None = None,
    status: str | None = None,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> RunListResponse:
    items, total = await runs_repo.list_runs(session, page, page_size, ticker, status)
    return RunListResponse(
        items=[RunSummary.model_validate(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=RunSummary, status_code=202)
@limiter.limit(get_settings().rate_limit_runs)
async def create_run(
    request: Request,
    body: RunCreate,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> RunSummary:
    config = await _build_run_config(session)

    run = await runs_repo.create_run(
        session,
        ticker=body.ticker,
        analysis_date=body.analysis_date,
        analysts=[a.value for a in body.analysts],
        llm_provider=config.get("llm_provider"),
        deep_model=config.get("deep_think_llm"),
        quick_model=config.get("quick_think_llm"),
    )

    get_audit_logger().info(
        "run.start id=%s ticker=%s date=%s analysts=%s",
        run.id, body.ticker, body.analysis_date, body.analysts,
    )

    # Start background task — survives client disconnect
    mgr = get_run_manager()
    mgr.start_run(
        run_id=run.id,
        ticker=body.ticker,
        analysis_date=body.analysis_date,
        analysts=[a.value for a in body.analysts],
        config=config,
        db_session_factory=get_session_factory(),
    )

    logger.info("Queued run %s for %s on %s", run.id, body.ticker, body.analysis_date)
    return RunSummary.model_validate(run)


@router.get("/{run_id}", response_model=RunSummary)
async def get_run(
    run_id: str,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> RunSummary:
    run = await runs_repo.get_run(session, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunSummary.model_validate(run)


@router.delete("/{run_id}", status_code=204)
async def delete_run(
    run_id: str,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> None:
    run = await runs_repo.get_run(session, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status == "running":
        raise HTTPException(status_code=409, detail="Cannot delete a running run")
    await session.delete(run)
    await session.commit()


@router.get("/{run_id}/report/{section}")
async def get_report_section(
    run_id: str,
    section: str,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> dict:
    """Return a specific section from the analysis report."""
    run = await runs_repo.get_run(session, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    if section not in VALID_SECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid section. Valid: {sorted(VALID_SECTIONS)}",
        )

    try:
        content = read_report_section_by_date(run.ticker, run.analysis_date, section)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if content is None:
        raise HTTPException(status_code=404, detail="Report section not found")

    return {"run_id": run_id, "section": section, "content": content}


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@router.websocket("/ws/runs/{run_id}")
async def ws_run_stream(
    run_id: str,
    websocket: WebSocket,
    token: str | None = None,
) -> None:
    """Stream run events to connected clients."""
    # Auth via query param
    if not token or token != get_api_token():
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    mgr = get_run_manager()

    # Send buffered events first (state snapshot for reconnect)
    buffered = mgr.get_buffer(run_id)
    if buffered:
        await websocket.send_text(json.dumps({
            "type": "state_snapshot",
            "events": buffered,
        }))

    q = mgr.subscribe(run_id)
    try:
        while True:
            event = await q.get()
            if mgr.is_sentinel(event):
                await websocket.send_text(json.dumps({"type": "stream_end"}))
                break
            await websocket.send_text(json.dumps(event, default=str))
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for run %s", run_id)
    except Exception as exc:
        logger.error("WebSocket error for run %s: %s", run_id, exc)
    finally:
        mgr.unsubscribe(run_id, q)
