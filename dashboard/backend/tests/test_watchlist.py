"""Watchlist API tests."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_list_watchlist_empty(client):
    resp = await client.get("/api/watchlist")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_add_to_watchlist(client):
    resp = await client.post("/api/watchlist", json={"ticker": "AAPL"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["ticker"] == "AAPL"
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_add_duplicate_returns_409(client):
    await client.post("/api/watchlist", json={"ticker": "TSLA"})
    resp = await client.post("/api/watchlist", json={"ticker": "TSLA"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_from_watchlist(client):
    await client.post("/api/watchlist", json={"ticker": "MSFT"})
    resp = await client.delete("/api/watchlist/MSFT")
    assert resp.status_code == 204
    # Verify deleted
    resp = await client.get("/api/watchlist")
    tickers = [item["ticker"] for item in resp.json()]
    assert "MSFT" not in tickers


@pytest.mark.asyncio
async def test_delete_nonexistent_returns_404(client):
    resp = await client.delete("/api/watchlist/NOTREAL")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_watchlist_shows_items(client):
    await client.post("/api/watchlist", json={"ticker": "AMZN"})
    await client.post("/api/watchlist", json={"ticker": "GOOG"})
    resp = await client.get("/api/watchlist")
    assert resp.status_code == 200
    tickers = {item["ticker"] for item in resp.json()}
    assert "AMZN" in tickers
    assert "GOOG" in tickers


@pytest.mark.asyncio
async def test_ticker_normalized_to_uppercase(client):
    resp = await client.post("/api/watchlist", json={"ticker": "NVDA"})
    assert resp.status_code == 201
    assert resp.json()["ticker"] == "NVDA"
