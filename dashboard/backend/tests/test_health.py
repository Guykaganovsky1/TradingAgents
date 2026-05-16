"""Health check tests."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_health_ok(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "uptime_seconds" in data


@pytest.mark.asyncio
async def test_health_unauthenticated(client):
    """Health endpoint must work WITHOUT auth header."""
    from httpx import ASGITransport, AsyncClient

    from main import app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        # No auth header
    ) as ac:
        resp = await ac.get("/healthz")
    assert resp.status_code == 200
