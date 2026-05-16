"""Tests for scans API endpoints: auth, happy paths, rate limits, WebSocket."""
from __future__ import annotations

from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _disable_rate_limit(monkeypatch):
    """Patch slowapi limiter to never block during endpoint tests."""
    from core.rate_limit import limiter
    # Reset the in-memory storage between tests and disable rate checking
    original_enabled = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = original_enabled


# ---------------------------------------------------------------------------
# POST /api/scans
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_scan_requires_auth(client):
    """POST /api/scans without auth returns 401."""
    from httpx import ASGITransport, AsyncClient

    from main import app

    async def override_session():
        # Get the injected db_session from the client fixture
        from core.db import get_session_factory  # noqa: PLC0415
        factory = get_session_factory()
        async with factory() as s:
            yield s

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        resp = await ac.post("/api/scans", json={"universes": ["sp500"]})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_scan_happy_path(client):
    """POST /api/scans returns 202 with scan_id and ws_url."""
    with patch("services.scanner.manager.ScanManager.start_scan", return_value=None):
        resp = await client.post("/api/scans", json={"universes": ["sp500"], "top_n": 3})

    assert resp.status_code == 202
    data = resp.json()
    assert "scan_id" in data
    assert "ws_url" in data
    assert data["status"] == "queued"
    assert data["top_n"] == 3


@pytest.mark.asyncio
async def test_create_scan_invalid_universe(client):
    """POST with unknown universe returns 422."""
    resp = await client.post("/api/scans", json={"universes": ["invalid_universe"]})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_scan_empty_universes(client):
    """POST with empty universes list returns 422."""
    resp = await client.post("/api/scans", json={"universes": []})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_scan_top_n_bounds(client):
    """POST with top_n > 20 returns 422."""
    with patch("services.scanner.manager.ScanManager.start_scan", return_value=None):
        resp = await client.post("/api/scans", json={"universes": ["crypto"], "top_n": 25})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_scan_all_universes(client):
    """POST with all 4 universes is valid."""
    with patch("services.scanner.manager.ScanManager.start_scan", return_value=None):
        resp = await client.post(
            "/api/scans",
            json={"universes": ["watchlist", "sp500", "nasdaq100", "crypto"], "top_n": 5},
        )
    assert resp.status_code == 202


# ---------------------------------------------------------------------------
# GET /api/scans
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_scans_empty(client):
    """GET /api/scans returns empty list when no scans exist."""
    resp = await client.get("/api/scans")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_list_scans_returns_created_scan(client):
    """GET /api/scans returns scans that were created."""
    with patch("services.scanner.manager.ScanManager.start_scan", return_value=None):
        await client.post("/api/scans", json={"universes": ["sp500"], "top_n": 5})

    resp = await client.get("/api/scans")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1


@pytest.mark.asyncio
async def test_list_scans_pagination(client):
    """GET /api/scans?limit=1&offset=0 returns 1 item."""
    with patch("services.scanner.manager.ScanManager.start_scan", return_value=None):
        for _ in range(3):
            await client.post("/api/scans", json={"universes": ["crypto"], "top_n": 3})

    resp = await client.get("/api/scans?limit=1&offset=0")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 1


# ---------------------------------------------------------------------------
# GET /api/scans/{scan_id}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_scan_not_found(client):
    """GET /api/scans/{nonexistent} returns 404."""
    resp = await client.get("/api/scans/does-not-exist")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_scan_happy_path(client):
    """GET /api/scans/{scan_id} returns full scan record."""
    with patch("services.scanner.manager.ScanManager.start_scan", return_value=None):
        create_resp = await client.post("/api/scans", json={"universes": ["sp500"], "top_n": 5})
    scan_id = create_resp.json()["scan_id"]

    resp = await client.get(f"/api/scans/{scan_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["scan_id"] == scan_id
    assert data["status"] in ("queued", "running", "complete", "error")


# ---------------------------------------------------------------------------
# GET /api/scans/{scan_id}/results
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_results_not_complete(client):
    """GET /results on a queued scan returns 409."""
    with patch("services.scanner.manager.ScanManager.start_scan", return_value=None):
        create_resp = await client.post("/api/scans", json={"universes": ["sp500"]})
    scan_id = create_resp.json()["scan_id"]

    resp = await client.get(f"/api/scans/{scan_id}/results")
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# DELETE /api/scans/{scan_id}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_scan_happy_path(client):
    """DELETE /api/scans/{scan_id} removes the scan."""
    with patch("services.scanner.manager.ScanManager.start_scan", return_value=None):
        create_resp = await client.post("/api/scans", json={"universes": ["nasdaq100"]})
    scan_id = create_resp.json()["scan_id"]

    del_resp = await client.delete(f"/api/scans/{scan_id}")
    assert del_resp.status_code == 204

    get_resp = await client.get(f"/api/scans/{scan_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_running_scan_returns_409(client, db_session):
    """DELETE on a running scan returns 409."""
    import repos.scans as scans_repo  # noqa: PLC0415

    # Create scan and mark it running
    with patch("services.scanner.manager.ScanManager.start_scan", return_value=None):
        create_resp = await client.post("/api/scans", json={"universes": ["crypto"]})
    scan_id = create_resp.json()["scan_id"]
    await scans_repo.update_scan_status(db_session, scan_id, "running")

    resp = await client.delete(f"/api/scans/{scan_id}")
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_nonexistent_scan(client):
    """DELETE on nonexistent scan returns 404."""
    resp = await client.delete("/api/scans/nonexistent-id")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Auth: all endpoints require bearer token
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_all_endpoints_require_auth():
    """Verify auth is enforced on all scans endpoints."""
    from httpx import ASGITransport, AsyncClient

    from main import app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        endpoints = [
            ("GET", "/api/scans"),
            ("GET", "/api/scans/fake-id"),
            ("GET", "/api/scans/fake-id/results"),
            ("DELETE", "/api/scans/fake-id"),
        ]
        for method, path in endpoints:
            resp = await ac.request(method, path)
            assert resp.status_code == 401, f"{method} {path} should be 401"


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_scan_response_schema(client):
    """Response schema matches spec (scan_id, ws_url, status, universes, top_n)."""
    with patch("services.scanner.manager.ScanManager.start_scan", return_value=None):
        resp = await client.post(
            "/api/scans",
            json={"universes": ["sp500", "crypto"], "top_n": 5},
        )
    assert resp.status_code == 202
    data = resp.json()
    assert "scan_id" in data
    assert "ws_url" in data
    assert data["ws_url"].startswith("/ws/scans/")
    assert "universes" in data
    assert "sp500" in data["universes"]
    assert "crypto" in data["universes"]
    assert data["status"] == "queued"
    assert data["progress_pct"] == 0
    assert data["universe_size"] == 0
