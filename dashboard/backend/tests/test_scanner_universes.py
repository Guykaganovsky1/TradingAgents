"""Tests for universe providers — all network calls mocked."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from services.scanner.universes.crypto import CryptoUniverse
from services.scanner.universes.nasdaq100 import Nasdaq100Universe
from services.scanner.universes.sp500 import SP500Universe
from services.scanner.universes.watchlist import WatchlistUniverse

# ---------------------------------------------------------------------------
# SP500 Universe
# ---------------------------------------------------------------------------

SP500_HTML = """
<html><body>
<table id="constituents" class="wikitable">
<tr><th>Symbol</th><th>Security</th><th>Sector</th></tr>
<tr><td>AAPL</td><td>Apple Inc.</td><td>Technology</td></tr>
<tr><td>MSFT</td><td>Microsoft Corporation</td><td>Technology</td></tr>
<tr><td>NVDA</td><td>NVIDIA Corporation</td><td>Technology</td></tr>
</table>
</body></html>
"""


class FakeResponse:
    def __init__(self, text: str, status_code: int = 200):
        self.text = text
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


class FakeAsyncClient:
    def __init__(self, text: str, status_code: int = 200):
        self._text = text
        self._status = status_code

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def get(self, url, **kwargs):
        return FakeResponse(self._text, self._status)


@pytest.mark.asyncio
async def test_sp500_scrape_success(tmp_path):
    """SP500 universe scrapes Wikipedia and returns correct tickers."""
    with patch("services.scanner.universes.sp500._cache_path", return_value=tmp_path / "sp500.json"), \
         patch("httpx.AsyncClient", return_value=FakeAsyncClient(SP500_HTML)):
        provider = SP500Universe()
        candidates = await provider.fetch()

    assert len(candidates) == 3
    symbols = {c.symbol for c in candidates}
    assert "AAPL" in symbols
    assert "MSFT" in symbols
    assert all(c.asset_class == "stock" for c in candidates)


@pytest.mark.asyncio
async def test_sp500_uses_cache(tmp_path):
    """SP500 returns cached result when cache is fresh."""
    from datetime import UTC, datetime
    cache_data = {
        "cached_at": datetime.now(tz=UTC).isoformat(),
        "tickers": [
            {"symbol": "AAPL", "name": "Apple Inc."},
            {"symbol": "GOOGL", "name": "Alphabet"},
        ],
    }
    cache_file = tmp_path / "sp500.json"
    cache_file.write_text(json.dumps(cache_data))

    with patch("services.scanner.universes.sp500._cache_path", return_value=cache_file):
        provider = SP500Universe()
        candidates = await provider.fetch()

    assert len(candidates) == 2
    assert candidates[0].symbol == "AAPL"


@pytest.mark.asyncio
async def test_sp500_fallback_on_network_error(tmp_path):
    """SP500 returns fallback list when network fails."""
    with patch("services.scanner.universes.sp500._cache_path", return_value=tmp_path / "sp500.json"), \
         patch("httpx.AsyncClient", side_effect=Exception("network error")):
        provider = SP500Universe()
        candidates = await provider.fetch()

    assert len(candidates) >= 1
    assert all(c.asset_class == "stock" for c in candidates)


# ---------------------------------------------------------------------------
# Nasdaq100 Universe
# ---------------------------------------------------------------------------

NASDAQ_HTML = """
<html><body>
<table id="constituents" class="wikitable">
<tr><th>Ticker</th><th>Company</th></tr>
<tr><td>AAPL</td><td>Apple Inc.</td></tr>
<tr><td>MSFT</td><td>Microsoft Corporation</td></tr>
</table>
</body></html>
"""


@pytest.mark.asyncio
async def test_nasdaq100_scrape_success(tmp_path):
    with patch("services.scanner.universes.nasdaq100._cache_path", return_value=tmp_path / "nasdaq100.json"), \
         patch("httpx.AsyncClient", return_value=FakeAsyncClient(NASDAQ_HTML)):
        provider = Nasdaq100Universe()
        candidates = await provider.fetch()

    assert len(candidates) == 2
    assert candidates[0].symbol == "AAPL"
    assert all(c.asset_class == "stock" for c in candidates)


@pytest.mark.asyncio
async def test_nasdaq100_fallback_on_error(tmp_path):
    with patch("services.scanner.universes.nasdaq100._cache_path", return_value=tmp_path / "nd.json"), \
         patch("httpx.AsyncClient", side_effect=Exception("fail")):
        provider = Nasdaq100Universe()
        candidates = await provider.fetch()

    assert len(candidates) >= 1


# ---------------------------------------------------------------------------
# Crypto Universe
# ---------------------------------------------------------------------------

COINGECKO_RESPONSE = [
    {
        "id": "bitcoin",
        "symbol": "btc",
        "name": "Bitcoin",
        "current_price": 65000.0,
        "price_change_percentage_24h": 2.5,
        "total_volume": 40_000_000_000,
    },
    {
        "id": "ethereum",
        "symbol": "eth",
        "name": "Ethereum",
        "current_price": 3500.0,
        "price_change_percentage_24h": -1.2,
        "total_volume": 20_000_000_000,
    },
]


class FakeCoinGeckoClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def get(self, url, **kwargs):
        r = MagicMock()
        r.raise_for_status = MagicMock()
        r.json.return_value = COINGECKO_RESPONSE
        r.status_code = 200
        return r


@pytest.mark.asyncio
async def test_crypto_fetch_success(tmp_path):
    with patch("services.scanner.universes.crypto._cache_path", return_value=tmp_path / "crypto.json"), \
         patch("httpx.AsyncClient", return_value=FakeCoinGeckoClient()):
        provider = CryptoUniverse()
        candidates = await provider.fetch()

    assert len(candidates) == 2
    assert candidates[0].symbol == "BTC-USD"
    assert candidates[0].price == 65000.0
    assert candidates[0].asset_class == "crypto"


@pytest.mark.asyncio
async def test_crypto_fallback_on_error(tmp_path):
    with patch("services.scanner.universes.crypto._cache_path", return_value=tmp_path / "c.json"), \
         patch("httpx.AsyncClient", side_effect=Exception("fail")):
        provider = CryptoUniverse()
        candidates = await provider.fetch()

    assert len(candidates) >= 1
    assert all(c.asset_class == "crypto" for c in candidates)


# ---------------------------------------------------------------------------
# Watchlist Universe
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_watchlist_universe_returns_candidates(db_session):
    """Watchlist universe reads from the DB session."""
    from models.orm import Watchlist

    # Add a watchlist entry
    item = Watchlist(ticker="TSLA", display_name="Tesla")
    db_session.add(item)
    await db_session.commit()

    provider = WatchlistUniverse(db_session)
    candidates = await provider.fetch()

    assert len(candidates) == 1
    assert candidates[0].symbol == "TSLA"
    assert candidates[0].asset_class == "stock"


@pytest.mark.asyncio
async def test_watchlist_universe_empty(db_session):
    provider = WatchlistUniverse(db_session)
    candidates = await provider.fetch()
    assert candidates == []
