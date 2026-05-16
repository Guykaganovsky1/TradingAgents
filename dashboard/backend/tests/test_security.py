"""Security tests: auth enforcement, Fernet round-trip, path traversal."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_missing_auth_returns_401(db_session):
    from core.db import get_session
    from main import app

    async def override():
        yield db_session

    app.dependency_overrides[get_session] = override

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp = await ac.get("/api/watchlist")
    app.dependency_overrides.clear()
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_wrong_token_returns_401(db_session):
    from core.db import get_session
    from main import app

    async def override():
        yield db_session

    app.dependency_overrides[get_session] = override

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": "Bearer wrong-token"},
    ) as ac:
        resp = await ac.get("/api/watchlist")
    app.dependency_overrides.clear()
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_secret_not_leaked_in_get(client):
    """GET /api/settings must never return raw secret values."""
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.json()
    # Should have boolean flags, not raw values
    assert "has_openai_key" in data
    assert "openai_api_key" not in data
    assert "anthropic_api_key" not in data
    assert "google_api_key" not in data


@pytest.mark.asyncio
async def test_ticker_regex_blocks_injection(client):
    """Ticker with special chars must be rejected."""
    bad_tickers = ["AAPL; rm -rf /", "../etc/passwd", "A B", "TOOLONGTICKERXXX"]
    for bad in bad_tickers:
        resp = await client.post("/api/watchlist", json={"ticker": bad})
        assert resp.status_code == 422, f"Expected 422 for {bad!r}, got {resp.status_code}"


@pytest.mark.asyncio
async def test_valid_ticker_accepted(client):
    """Valid tickers must pass regex."""
    for good in ["AAPL", "BRK.B", "SPY", "BTC-USD"]:
        resp = await client.post("/api/watchlist", json={"ticker": good})
        # Either 201 (created) or 409 (conflict if already in watchlist) - both mean regex passed
        assert resp.status_code in (201, 409), f"Unexpected {resp.status_code} for {good!r}"


def test_fernet_round_trip():
    """Fernet encrypt/decrypt must be reversible."""
    from core.security import decrypt_secret, encrypt_secret
    secret = "sk-test-super-secret-key-12345"
    encrypted = encrypt_secret(secret)
    assert encrypted != secret
    decrypted = decrypt_secret(encrypted)
    assert decrypted == secret


def test_path_traversal_blocked():
    """report_reader must block path traversal attempts."""
    from services.report_reader import read_report_section_by_date

    # Invalid ticker with path traversal
    try:
        result = read_report_section_by_date("../../etc/passwd", "2024-01-01", "market_report")
        # If it doesn't raise, it should return None (file not found)
        assert result is None
    except ValueError as e:
        assert "traversal" in str(e).lower() or "invalid" in str(e).lower()


def test_invalid_section_blocked():
    """report_reader must reject unknown section names."""
    from services.report_reader import read_report_section_by_date
    with pytest.raises(ValueError, match="Invalid section"):
        read_report_section_by_date("AAPL", "2024-01-01", "__import__('os').system('id')")
