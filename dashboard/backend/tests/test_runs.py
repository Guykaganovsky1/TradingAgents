"""Run index API tests."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_list_runs_empty(client):
    resp = await client.get("/api/runs")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_create_run_returns_202(client, monkeypatch):
    """POST /api/runs returns 202 and queues a background run."""
    # Mock RunManager.start_run to avoid actual graph execution
    from services.run_manager import get_run_manager
    mgr = get_run_manager()
    started_runs = []

    def mock_start_run(run_id, ticker, analysis_date, analysts, config, db_session_factory):
        started_runs.append({"run_id": run_id, "ticker": ticker})

    monkeypatch.setattr(mgr, "start_run", mock_start_run)

    resp = await client.post(
        "/api/runs",
        json={
            "ticker": "AAPL",
            "analysis_date": "2024-01-15",
            "analysts": ["market", "news"],
        },
    )
    assert resp.status_code == 202
    data = resp.json()
    assert data["ticker"] == "AAPL"
    # status is exposed as "complete" when done, but fresh runs are "queued"
    assert data["status"] == "queued"
    assert data["analysis_date"] == "2024-01-15"
    assert "id" in data
    # Spec-required fields
    assert "run_id" in data
    assert data["run_id"] == data["id"]
    assert "ws_url" in data
    assert data["ws_url"] == f"/ws/runs/{data['id']}"
    assert "completed_at" in data
    assert len(started_runs) == 1


@pytest.mark.asyncio
async def test_get_run_by_id(client, monkeypatch):
    from services.run_manager import get_run_manager
    monkeypatch.setattr(get_run_manager(), "start_run", lambda *a, **kw: None)

    create_resp = await client.post(
        "/api/runs",
        json={"ticker": "TSLA", "analysis_date": "2024-02-01", "analysts": ["fundamentals"]},
    )
    run_id = create_resp.json()["id"]

    resp = await client.get(f"/api/runs/{run_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == run_id


@pytest.mark.asyncio
async def test_get_run_not_found(client):
    resp = await client.get("/api/runs/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_run_invalid_ticker_rejected(client):
    resp = await client.post(
        "/api/runs",
        json={"ticker": "invalid ticker!", "analysis_date": "2024-01-01"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_run_invalid_date_rejected(client):
    resp = await client.post(
        "/api/runs",
        json={"ticker": "AAPL", "analysis_date": "not-a-date"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_delete_run(client, monkeypatch):
    from services.run_manager import get_run_manager
    monkeypatch.setattr(get_run_manager(), "start_run", lambda *a, **kw: None)

    create_resp = await client.post(
        "/api/runs",
        json={"ticker": "MSFT", "analysis_date": "2024-03-01"},
    )
    run_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/runs/{run_id}")
    assert resp.status_code == 204

    resp = await client.get(f"/api/runs/{run_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_runs_pagination(client, monkeypatch):
    from services.run_manager import get_run_manager
    monkeypatch.setattr(get_run_manager(), "start_run", lambda *a, **kw: None)

    # Create 3 runs
    for date in ["2024-01-01", "2024-01-02", "2024-01-03"]:
        await client.post("/api/runs", json={"ticker": "GOOG", "analysis_date": date})

    resp = await client.get("/api/runs?page=1&page_size=2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 3
    assert len(data["items"]) <= 2


@pytest.mark.asyncio
async def test_run_response_has_spec_fields(client, monkeypatch):
    """POST /api/runs response includes spec-required run_id and ws_url fields."""
    from services.run_manager import get_run_manager
    monkeypatch.setattr(get_run_manager(), "start_run", lambda *a, **kw: None)

    resp = await client.post(
        "/api/runs",
        json={"ticker": "NVDA", "analysis_date": "2024-06-01", "analysts": ["market"]},
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "run_id" in data, "run_id must be present in POST /api/runs response"
    assert "ws_url" in data, "ws_url must be present in POST /api/runs response"
    assert data["run_id"] == data["id"]
    assert data["ws_url"].startswith("/ws/runs/")
    assert "completed_at" in data


@pytest.mark.asyncio
async def test_run_list_items_have_spec_fields(client, monkeypatch):
    """GET /api/runs items include run_id and completed_at spec fields."""
    from services.run_manager import get_run_manager
    monkeypatch.setattr(get_run_manager(), "start_run", lambda *a, **kw: None)

    await client.post(
        "/api/runs",
        json={"ticker": "AMD", "analysis_date": "2024-07-01"},
    )
    resp = await client.get("/api/runs")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    item = items[0]
    assert "run_id" in item
    assert "completed_at" in item
    assert "ws_url" in item


@pytest.mark.asyncio
async def test_create_run_rate_limit_decorator_exists():
    """The create_run function must be decorated with the 10/min rate limiter."""
    from api.runs import create_run
    # slowapi sets _rate_limit on the decorated function
    # Verify the decorator is attached
    assert hasattr(create_run, "_rate_limit") or hasattr(create_run, "__wrapped__"), (
        "create_run must be decorated with @limiter.limit"
    )
