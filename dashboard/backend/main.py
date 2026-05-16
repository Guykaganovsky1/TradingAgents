"""FastAPI application entry point."""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# ---------------------------------------------------------------------------
# Bootstrap path so tradingagents is importable
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

# ---------------------------------------------------------------------------
# App bootstrap
# ---------------------------------------------------------------------------
from core.config import get_settings  # noqa: E402
from core.db import create_tables  # noqa: E402
from core.errors import (  # noqa: E402
    ConflictError,
    NotFoundError,
    ValidationError,
    conflict_error_handler,
    generic_error_handler,
    not_found_handler,
    validation_error_handler,
)
from core.logging import configure_logging  # noqa: E402
from core.rate_limit import limiter  # noqa: E402
from core.scheduler import shutdown_scheduler, start_scheduler  # noqa: E402
from core.security import generate_fernet_key_if_missing, generate_token_if_missing  # noqa: E402

settings = get_settings()

# Configure logging first
configure_logging(settings.data_dir)
logger = logging.getLogger("dashboard.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    logger.info("Dashboard backend starting up...")

    # Generate token and fernet key if missing
    generate_token_if_missing(settings.token_path)
    generate_fernet_key_if_missing(settings.fernet_key_path)

    # Create DB tables (alembic handles migrations in production)
    await create_tables()
    logger.info("Database ready at %s", settings.database_url)

    # Start scheduler
    start_scheduler()

    logger.info("Dashboard backend ready on http://%s:%d", settings.host, settings.port)
    yield

    # Shutdown
    shutdown_scheduler()
    logger.info("Dashboard backend shut down")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="TradingAgents Dashboard API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS — locked to frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom error handlers
app.add_exception_handler(NotFoundError, not_found_handler)
app.add_exception_handler(ValidationError, validation_error_handler)
app.add_exception_handler(ConflictError, conflict_error_handler)
app.add_exception_handler(Exception, generic_error_handler)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
from api.health import router as health_router  # noqa: E402
from api.runs import router as runs_router  # noqa: E402
from api.scans import router as scans_router  # noqa: E402
from api.schedules import router as schedules_router  # noqa: E402
from api.settings import router as settings_router  # noqa: E402
from api.stats import router as stats_router  # noqa: E402
from api.watchlist import router as watchlist_router  # noqa: E402

app.include_router(health_router)
app.include_router(watchlist_router)
app.include_router(schedules_router)
app.include_router(runs_router)
app.include_router(settings_router)
app.include_router(stats_router)
app.include_router(scans_router)

# WebSocket route is on the runs router but mounted at /ws/runs/{run_id}
# Re-register it at the app level for the /ws prefix
from api.runs import ws_run_stream  # noqa: E402
from api.scans import ws_scan  # noqa: E402

app.add_api_websocket_route("/ws/runs/{run_id}", ws_run_stream)
app.add_api_websocket_route("/ws/scans/{scan_id}", ws_scan)
