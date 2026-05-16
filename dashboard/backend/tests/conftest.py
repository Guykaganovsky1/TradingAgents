"""Test configuration: in-memory SQLite, test client with auth."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Add backend dir to sys.path
_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# Add project root so tradingagents is importable
_ROOT = _BACKEND.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# Point data dir to a temp location for tests
_TEST_DATA = Path("/tmp/dashboard_test_data")
_TEST_DATA.mkdir(exist_ok=True)
os.environ.setdefault("DATA_DIR", str(_TEST_DATA))

import core.security as _sec  # noqa: E402
from core.config import get_settings  # noqa: E402
from core.security import generate_fernet_key_if_missing  # noqa: E402

# Force settings to use test data dir
_settings = get_settings()
_settings.data_dir = _TEST_DATA

# Init token and fernet for tests
_TEST_TOKEN = "test-token-abc123"
_sec._api_token = _TEST_TOKEN

generate_fernet_key_if_missing(_TEST_DATA / ".fernet-key")


@pytest.fixture(scope="session")
def test_token() -> str:
    return _TEST_TOKEN


@pytest_asyncio.fixture(scope="function")
async def db_session():
    """Per-test in-memory SQLite session."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    from models.orm import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db_session, test_token):
    """Test AsyncClient with auth header, using the in-memory DB session."""
    from core.db import get_session
    from main import app

    async def override_session():
        yield db_session

    app.dependency_overrides[get_session] = override_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": f"Bearer {test_token}"},
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
