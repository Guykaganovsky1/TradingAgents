"""Nasdaq-100 universe: Wikipedia scrape with 24h file cache."""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

from .base import ScanCandidate

logger = logging.getLogger("dashboard.scanner.universes.nasdaq100")

_WIKI_URL = "https://en.wikipedia.org/wiki/Nasdaq-100"
_USER_AGENT = "TradingAgents-Dashboard-Scanner/0.1 (+https://github.com/Guykaganovsky1/TradingAgents)"
_CACHE_TTL_SECONDS = 24 * 3600

_FALLBACK = [
    ("AAPL", "Apple Inc."), ("MSFT", "Microsoft Corporation"), ("NVDA", "NVIDIA Corporation"),
    ("GOOGL", "Alphabet Inc."), ("META", "Meta Platforms Inc."), ("AMZN", "Amazon.com Inc."),
    ("TSLA", "Tesla Inc."), ("AVGO", "Broadcom Inc."), ("COST", "Costco Wholesale"),
    ("ASML", "ASML Holding"),
]


def _cache_path() -> Path:
    from core.config import get_settings  # noqa: PLC0415
    p = get_settings().data_dir / "scanner_cache" / "nasdaq100.json"
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


class Nasdaq100Universe:
    """Nasdaq-100 tickers from Wikipedia, cached 24h."""

    async def fetch(self) -> list[ScanCandidate]:
        path = _cache_path()
        if _is_cache_valid(path):
            try:
                candidates = _load_cache(path)
                logger.info("Nasdaq100 universe: %d tickers (cache)", len(candidates))
                return candidates
            except Exception:
                pass

        try:
            candidates = await self._scrape()
            _save_cache(path, candidates)
            logger.info("Nasdaq100 universe: %d tickers (scraped)", len(candidates))
            return candidates
        except Exception as exc:
            logger.warning("Nasdaq100 scrape failed (%s), using fallback", exc)
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

        # Try the "constituents" table first, then any wikitable with Ticker column
        table = soup.find("table", {"id": "constituents"})
        if table is None:
            # Find a table that has a "Ticker" or "Symbol" header
            for t in soup.find_all("table", class_="wikitable"):
                headers = [th.get_text(strip=True).lower() for th in t.find_all("th")]
                if any(h in ("ticker", "symbol") for h in headers):
                    table = t
                    break

        if table is None:
            raise ValueError("Could not find Nasdaq-100 table on Wikipedia")

        # Determine which column is ticker and which is name
        header_row = table.find("tr")
        headers = [th.get_text(strip=True).lower() for th in header_row.find_all("th")] if header_row else []
        ticker_col = 0
        name_col = 1
        for i, h in enumerate(headers):
            if h in ("ticker", "symbol"):
                ticker_col = i
            elif h in ("company", "security", "name"):
                name_col = i

        candidates: list[ScanCandidate] = []
        for row in table.find_all("tr")[1:]:
            cols = row.find_all("td")
            if len(cols) <= max(ticker_col, name_col):
                continue
            symbol = cols[ticker_col].get_text(strip=True).replace(".", "-")
            name = cols[name_col].get_text(strip=True)
            if symbol and name:
                candidates.append(ScanCandidate(symbol=symbol, name=name, asset_class="stock"))

        if not candidates:
            raise ValueError("Nasdaq100 parse returned 0 rows")
        return candidates
