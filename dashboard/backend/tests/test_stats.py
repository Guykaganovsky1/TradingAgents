"""Stats API tests."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_stats_overview_empty(client):
    resp = await client.get("/api/stats/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_runs"] == 0
    assert data["success_rate"] == 0.0
    assert "decisions" in data
    assert "avg_tokens_per_run" in data
    # Spec-required fields
    assert "active_signals" in data
    assert "buy_count" in data
    assert "hold_count" in data
    assert "sell_count" in data
    assert "analyses_today" in data
    assert "tokens_today" in data
    assert "tokens_total" in data
    assert "top_signal" in data
    assert data["top_signal"] is None


@pytest.mark.asyncio
async def test_token_stats_empty(client):
    resp = await client.get("/api/stats/tokens")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_stats_overview_with_data(client, monkeypatch):
    from services.run_manager import get_run_manager
    monkeypatch.setattr(get_run_manager(), "start_run", lambda *a, **kw: None)

    await client.post(
        "/api/runs",
        json={"ticker": "AAPL", "analysis_date": "2024-01-15"},
    )

    resp = await client.get("/api/stats/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_runs"] >= 1
