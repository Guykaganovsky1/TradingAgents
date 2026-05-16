"""S&P 500 universe: Wikipedia scrape with 24h file cache."""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

from .base import ScanCandidate

logger = logging.getLogger("dashboard.scanner.universes.sp500")

_WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
_USER_AGENT = "TradingAgents-Dashboard-Scanner/0.1 (+https://github.com/Guykaganovsky1/TradingAgents)"
_CACHE_TTL_SECONDS = 24 * 3600

# Bundled minimal fallback (top 10 by market cap as of 2025)
_FALLBACK = [
    ("AAPL", "Apple Inc."), ("MSFT", "Microsoft Corporation"), ("NVDA", "NVIDIA Corporation"),
    ("GOOGL", "Alphabet Inc."), ("AMZN", "Amazon.com Inc."), ("META", "Meta Platforms Inc."),
    ("TSLA", "Tesla Inc."), ("BRK.B", "Berkshire Hathaway"), ("JPM", "JPMorgan Chase"),
    ("UNH", "UnitedHealth Group"),
]


def _cache_path() -> Path:
    from core.config import get_settings  # noqa: PLC0415
    p = get_settings().data_dir / "scanner_cache" / "sp500.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _is_cache_valid(path: Path) -> bool:
    if not path.exists():
        return False
    try:
        data = json.loads(path.read_text())
        ts = datetime.fromisoformat(data["cached_at"])
        age = (datetime.now(tz=UTC) - ts).total_seconds()
        return age < _CACHE_TTL_SECONDS
    except Exception:
        return False


def _load_cache(path: Path) -> list[ScanCandidate]:
    data = json.loads(path.read_text())
    return [ScanCandidate(symbol=r["symbol"], name=r["name"], asset_class="stock") for r in data["tickers"]]


def _save_cache(path: Path, candidates: list[ScanCandidate]) -> None:
    payload = {
        "cached_at": datetime.now(tz=UTC).isoformat(),
        "tickers": [{"symbol": c.symbol, "name": c.name} for c in candidates],
    }
    path.write_text(json.dumps(payload))


class SP500Universe:
    """S&P 500 tickers from Wikipedia, cached 24h."""

    async def fetch(self) -> list[ScanCandidate]:
        path = _cache_path()
        if _is_cache_valid(path):
            try:
                candidates = _load_cache(path)
                logger.info("SP500 universe: %d tickers (cache)", len(candidates))
                return candidates
            except Exception:
                pass

        try:
            candidates = await self._scrape()
            _save_cache(path, candidates)
            logger.info("SP500 universe: %d tickers (scraped)", len(candidates))
            return candidates
        except Exception as exc:
            logger.warning("SP500 scrape failed (%s), using fallback", exc)
            return [ScanCandidate(symbol=s, name=n, asset_class="stock") for s, n in _FALLBACK]

    async def _scrape(self) -> list[ScanCandidate]:
        async with httpx.AsyncClient(
            headers={"User-Agent": _USER_AGENT},
            follow_redirects=True,
            timeout=30,
        ) as client:
            resp = await client.get(_WIKI_URL)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")
        # The main S&P 500 table has id="constituents"
        table = soup.find("table", {"id": "constituents"})
        if table is None:
            # Fallback: first wikitable
            table = soup.find("table", class_="wikitable")
        if table is None:
            raise ValueError("Could not find S&P 500 table on Wikipedia")

        candidates: list[ScanCandidate] = []
        for row in table.find_all("tr")[1:]:  # skip header
            cols = row.find_all("td")
            if len(cols) < 2:
                continue
            symbol = cols[0].get_text(strip=True).replace(".", "-")  # BRK.B → BRK-B for yfinance compat
            name = cols[1].get_text(strip=True)
            if symbol and name:
                candidates.append(ScanCandidate(symbol=symbol, name=name, asset_class="stock"))

        if not candidates:
            raise ValueError("SP500 parse returned 0 rows")
        return candidates
