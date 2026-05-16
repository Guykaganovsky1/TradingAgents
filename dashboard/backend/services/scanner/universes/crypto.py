"""Crypto universe: CoinGecko free API, top 100 by volume, 1h cache."""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path

import httpx

from .base import ScanCandidate

logger = logging.getLogger("dashboard.scanner.universes.crypto")

_COINGECKO_URL = (
    "https://api.coingecko.com/api/v3/coins/markets"
    "?vs_currency=usd&order=volume_desc&per_page=100&page=1"
    "&sparkline=false&price_change_percentage=24h"
)
_USER_AGENT = "TradingAgents-Dashboard-Scanner/0.1 (+https://github.com/Guykaganovsky1/TradingAgents)"
_CACHE_TTL_SECONDS = 3600  # 1 hour

_FALLBACK = [
    ("BTC-USD", "Bitcoin"), ("ETH-USD", "Ethereum"), ("BNB-USD", "BNB"),
    ("SOL-USD", "Solana"), ("XRP-USD", "XRP"), ("DOGE-USD", "Dogecoin"),
    ("ADA-USD", "Cardano"), ("AVAX-USD", "Avalanche"), ("DOT-USD", "Polkadot"),
    ("MATIC-USD", "Polygon"),
]


def _cache_path() -> Path:
    from core.config import get_settings  # noqa: PLC0415
    p = get_settings().data_dir / "scanner_cache" / "crypto.json"
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
    return [
        ScanCandidate(
            symbol=r["symbol"],
            name=r["name"],
            asset_class="crypto",
            price=r.get("price"),
            price_change_24h_pct=r.get("price_change_24h_pct"),
            volume_usd_24h=r.get("volume_usd_24h"),
        )
        for r in data["tickers"]
    ]


def _save_cache(path: Path, candidates: list[ScanCandidate]) -> None:
    payload = {
        "cached_at": datetime.now(tz=UTC).isoformat(),
        "tickers": [
            {
                "symbol": c.symbol,
                "name": c.name,
                "price": c.price,
                "price_change_24h_pct": c.price_change_24h_pct,
                "volume_usd_24h": c.volume_usd_24h,
            }
            for c in candidates
        ],
    }
    path.write_text(json.dumps(payload))


def _coingecko_to_yfinance_symbol(symbol: str) -> str:
    """Convert coin symbol (e.g., 'btc') to yfinance format (e.g., 'BTC-USD')."""
    return f"{symbol.upper()}-USD"


class CryptoUniverse:
    """Top 100 cryptos by 24h volume from CoinGecko, cached 1h."""

    async def fetch(self) -> list[ScanCandidate]:
        path = _cache_path()
        if _is_cache_valid(path):
            try:
                candidates = _load_cache(path)
                logger.info("Crypto universe: %d tickers (cache)", len(candidates))
                return candidates
            except Exception:
                pass

        try:
            candidates = await self._fetch_coingecko()
            _save_cache(path, candidates)
            logger.info("Crypto universe: %d tickers (CoinGecko)", len(candidates))
            return candidates
        except Exception as exc:
            logger.warning("CoinGecko fetch failed (%s), using fallback", exc)
            return [
                ScanCandidate(symbol=s, name=n, asset_class="crypto")
                for s, n in _FALLBACK
            ]

    async def _fetch_coingecko(self) -> list[ScanCandidate]:
        async with httpx.AsyncClient(
            headers={"User-Agent": _USER_AGENT},
            follow_redirects=True,
            timeout=30,
        ) as client:
            resp = await client.get(_COINGECKO_URL)
            resp.raise_for_status()

        data = resp.json()
        candidates: list[ScanCandidate] = []
        for coin in data:
            sym_raw = coin.get("symbol", "")
            yf_symbol = _coingecko_to_yfinance_symbol(sym_raw)
            name = coin.get("name", sym_raw.upper())
            price = coin.get("current_price")
            change_24h = coin.get("price_change_percentage_24h")
            volume = coin.get("total_volume")
            candidates.append(
                ScanCandidate(
                    symbol=yf_symbol,
                    name=name,
                    asset_class="crypto",
                    price=float(price) if price is not None else None,
                    price_change_24h_pct=float(change_24h) if change_24h is not None else None,
                    volume_usd_24h=float(volume) if volume is not None else None,
                )
            )
        if not candidates:
            raise ValueError("CoinGecko returned empty list")
        return candidates
