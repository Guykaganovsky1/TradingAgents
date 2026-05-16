"""Schedule API tests."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_create_schedule_for_ticker(client):
    # First add to watchlist
    await client.post("/api/watchlist", json={"ticker": "AAPL"})

    resp = await client.post(
        "/api/watchlist/AAPL/schedules",
        json={"cron_expr": "0 9 * * 1-5", "analysts": ["market", "news"], "enabled": True},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["cron_expr"] == "0 9 * * 1-5"
    assert set(data["analysts"]) == {"market", "news"}
    assert data["enabled"] is True
    assert data["ticker"] == "AAPL"


@pytest.mark.asyncio
async def test_invalid_cron_rejected(client):
    await client.post("/api/watchlist", json={"ticker": "TSLA"})
    resp = await client.post(
        "/api/watchlist/TSLA/schedules",
        json={"cron_expr": "not-a-cron"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_schedule_ticker_not_in_watchlist(client):
    resp = await client.post(
        "/api/watchlist/NOTREAL/schedules",
        json={"cron_expr": "0 9 * * *"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_schedule(client):
    await client.post("/api/watchlist", json={"ticker": "MSFT"})
    create_resp = await client.post(
        "/api/watchlist/MSFT/schedules",
        json={"cron_expr": "0 8 * * MON"},
    )
    sched_id = create_resp.json()["id"]

    resp = await client.get(f"/api/schedules/{sched_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == sched_id


@pytest.mark.asyncio
async def test_update_schedule(client):
    await client.post("/api/watchlist", json={"ticker": "AMZN"})
    create_resp = await client.post(
        "/api/watchlist/AMZN/schedules",
        json={"cron_expr": "0 9 * * *", "enabled": True},
    )
    sched_id = create_resp.json()["id"]

    resp = await client.patch(f"/api/schedules/{sched_id}", json={"enabled": False})
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False


@pytest.mark.asyncio
async def test_delete_schedule(client):
    await client.post("/api/watchlist", json={"ticker": "GOOG"})
    create_resp = await client.post(
        "/api/watchlist/GOOG/schedules",
        json={"cron_expr": "30 16 * * *"},
    )
    sched_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/schedules/{sched_id}")
    assert resp.status_code == 204

    resp = await client.get(f"/api/schedules/{sched_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_ticker_schedules(client):
    await client.post("/api/watchlist", json={"ticker": "META"})
    await client.post("/api/watchlist/META/schedules", json={"cron_expr": "0 9 * * *"})
    await client.post("/api/watchlist/META/schedules", json={"cron_expr": "0 16 * * *"})

    resp = await client.get("/api/watchlist/META/schedules")
    assert resp.status_code == 200
    assert len(resp.json()) == 2
