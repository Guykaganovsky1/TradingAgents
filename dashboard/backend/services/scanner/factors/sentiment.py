"""Sentiment factor: Reddit mention z-score from r/stocks + r/wallstreetbets."""
from __future__ import annotations

import asyncio
import logging
import time

from .base import FactorResult

logger = logging.getLogger("dashboard.scanner.factors.sentiment")

# In-memory 5-minute TTL cache: key="sentiment:{symbol}" → (timestamp, FactorResult)
_sentiment_cache: dict[str, tuple[float, FactorResult]] = {}
_CACHE_TTL = 300  # 5 minutes

_USER_AGENT = "TradingAgents-Dashboard-Scanner/0.1 (+https://github.com/Guykaganovsky1/TradingAgents)"


def _get_reddit_token(client_id: str, client_secret: str) -> str | None:
    """Obtain Reddit OAuth bearer token using client credentials flow."""
    try:
        import httpx  # noqa: PLC0415
        resp = httpx.post(
            "https://www.reddit.com/api/v1/access_token",
            data={"grant_type": "client_credentials"},
            auth=(client_id, client_secret),
            headers={"User-Agent": _USER_AGENT},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("access_token")
    except Exception as exc:
        logger.warning("Reddit token fetch failed: %s", exc)
        return None


# Reddit token cache (15 min TTL)
_reddit_token_cache: tuple[float, str] | None = None
_REDDIT_TOKEN_TTL = 900


def _get_cached_reddit_token(client_id: str, client_secret: str) -> str | None:
    global _reddit_token_cache
    if _reddit_token_cache is not None:
        ts, token = _reddit_token_cache
        if time.time() - ts < _REDDIT_TOKEN_TTL:
            return token
    token = _get_reddit_token(client_id, client_secret)
    if token:
        _reddit_token_cache = (time.time(), token)
    return token


def _count_reddit_mentions(symbol: str, token: str, subreddits: list[str]) -> int:
    """Count posts mentioning ticker in given subreddits (last 24h)."""
    try:
        import httpx  # noqa: PLC0415
        total = 0
        for sub in subreddits:
            url = (
                f"https://oauth.reddit.com/r/{sub}/search"
                f"?q={symbol}&restrict_sr=on&t=day&limit=100&type=link"
            )
            resp = httpx.get(
                url,
                headers={"Authorization": f"bearer {token}", "User-Agent": _USER_AGENT},
                timeout=8,
            )
            if resp.status_code == 200:
                data = resp.json()
                total += len(data.get("data", {}).get("children", []))
        return total
    except Exception as exc:
        logger.debug("Reddit mention count failed for %s: %s", symbol, exc)
        return 0


def _coingecko_trending_mentions(symbol: str) -> int:
    """Check CoinGecko trending for crypto. Returns 0 or elevated count."""
    try:
        import httpx  # noqa: PLC0415
        resp = httpx.get(
            "https://api.coingecko.com/api/v3/search/trending",
            headers={"User-Agent": _USER_AGENT},
            timeout=5,
        )
        if resp.status_code != 200:
            return 0
        data = resp.json()
        coins = data.get("coins", [])
        sym_upper = symbol.replace("-USD", "").upper()
        for coin in coins:
            item = coin.get("item", {})
            if item.get("symbol", "").upper() == sym_upper:
                # Treat trending position as rough mention count
                return max(1, 10 - coins.index(coin))
        return 0
    except Exception:
        return 0


def _compute_z_score(mentions: int, baseline_mean: float, baseline_std: float) -> float:
    """Z-score of mentions vs baseline. Returns 0 if std is 0."""
    if baseline_std <= 0:
        return 0.0
    return (mentions - baseline_mean) / baseline_std


def _z_to_score(z: float) -> float:
    """Map z-score to 0-100. z>=2 → 100, z=1 → 50, z<=0 → 0."""
    if z <= 0:
        return 0.0
    if z >= 2.0:
        return 100.0
    return z * 50.0


def _fetch_sentiment_sync(
    symbol: str,
    asset_class: str,
    client_id: str,
    client_secret: str,
) -> FactorResult:
    token = _get_cached_reddit_token(client_id, client_secret)
    if not token:
        return FactorResult(score=None, signals=["Reddit auth failed"])

    subreddits = ["stocks", "wallstreetbets"]
    if asset_class == "crypto":
        subreddits.append("cryptocurrency")

    mentions = _count_reddit_mentions(symbol, token, subreddits)
    signals: list[str] = []

    # For crypto: also check CoinGecko trending
    if asset_class == "crypto":
        trending_bonus = _coingecko_trending_mentions(symbol)
        if trending_bonus > 0:
            mentions = max(mentions, trending_bonus * 5)  # weight trending higher
            signals.append("CoinGecko trending")

    # We use a fixed baseline: typical small-cap gets ~2 mentions/day, large-cap ~10
    # In a production system this would be stored in the DB per ticker
    # Here we use a simple heuristic: baseline_mean=5, baseline_std=3
    baseline_mean = 5.0
    baseline_std = 3.0
    z = _compute_z_score(mentions, baseline_mean, baseline_std)
    s = _z_to_score(z)

    if z >= 2.0:
        signals.append(f"r/{'+r/'.join(subreddits)} z={z:.1f} (very high)")
    elif z >= 1.0:
        signals.append(f"r/{'+r/'.join(subreddits)} z={z:.1f} (elevated)")
    else:
        signals.append(f"{mentions} mentions (z={z:.1f})")

    return FactorResult(score=round(s, 1), signals=signals[:3])


class SentimentFactor:
    """Sentiment factor: Reddit mention z-score. Requires Reddit OAuth creds."""

    def __init__(self, client_id: str | None = None, client_secret: str | None = None) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._available = bool(client_id and client_secret)

    @property
    def available(self) -> bool:
        return self._available

    async def score(self, symbol: str, asset_class: str) -> FactorResult:
        if not self._available:
            return FactorResult(score=None, signals=["Reddit creds not configured"])

        cache_key = f"sentiment:{symbol}"
        entry = _sentiment_cache.get(cache_key)
        if entry is not None:
            ts, result = entry
            if time.time() - ts < _CACHE_TTL:
                return result

        loop = asyncio.get_event_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    _fetch_sentiment_sync,
                    symbol,
                    asset_class,
                    self._client_id,
                    self._client_secret,
                ),
                timeout=8.0,
            )
        except TimeoutError:
            result = FactorResult(score=None, signals=["Reddit fetch timeout"])
        except Exception as exc:
            logger.warning("Sentiment factor error for %s: %s", symbol, exc)
            result = FactorResult(score=None, signals=["Sentiment error"])

        _sentiment_cache[cache_key] = (time.time(), result)
        return result
