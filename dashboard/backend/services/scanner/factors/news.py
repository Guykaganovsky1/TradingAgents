"""News factor: yfinance news + headline sentiment (last 24h)."""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime

from .base import FactorResult

logger = logging.getLogger("dashboard.scanner.factors.news")

# Positive/negative sentiment keyword lists
_POSITIVE_KW = frozenset([
    "upgrade", "upgraded", "beat", "beats", "beat estimates", "surge", "surging",
    "rally", "rallying", "breakout", "record", "growth", "profit", "dividend",
    "buyback", "buy", "outperform", "strong", "exceeds", "tops", "raises",
    "positive", "bullish", "gains", "higher",
])
_NEGATIVE_KW = frozenset([
    "miss", "misses", "missed", "downgrade", "downgraded", "lawsuit", "probe",
    "recall", "decline", "falls", "drop", "lower", "cuts", "layoffs", "warning",
    "loss", "sell", "underperform", "weak", "concern", "investigation", "fine",
    "penalty", "fraud", "negative", "bearish",
])

# In-memory 5-minute TTL cache: key="news:{symbol}" → (timestamp, FactorResult)
_news_cache: dict[str, tuple[float, FactorResult]] = {}
_CACHE_TTL = 300  # 5 minutes


def _fetch_news_sync(symbol: str, alpha_key: str | None) -> FactorResult:
    """Synchronous fetch — runs in executor."""
    try:
        import yfinance as yf  # noqa: PLC0415
        ticker = yf.Ticker(symbol)
        news_items = ticker.news or []
    except Exception as exc:
        logger.debug("yfinance news fetch failed for %s: %s", symbol, exc)
        return FactorResult(score=None, signals=["News fetch failed"])

    now_ts = datetime.now(tz=UTC).timestamp()
    cutoff_ts = now_ts - 86400  # last 24 hours

    recent = [n for n in news_items if (n.get("providerPublishTime") or 0) >= cutoff_ts]

    count = len(recent)
    count_score = min(50.0, count * 10.0)

    signals: list[str] = [f"{count} article{'s' if count != 1 else ''} last 24h"]

    # Sentiment scoring
    if alpha_key:
        # Alpha Vantage NEWS_SENTIMENT — optional enhancement
        sentiment_score = _fetch_alpha_vantage_sentiment(symbol, alpha_key, recent)
    else:
        sentiment_score = _keyword_sentiment(recent)

    if sentiment_score is not None:
        signals.append(f"Sentiment {'+' if sentiment_score >= 0 else ''}{sentiment_score:.2f}")

    sentiment_factor = (max(0.0, min(1.0, (sentiment_score + 1.0) / 2.0)) * 50.0) if sentiment_score is not None else 25.0
    total = min(100.0, count_score + sentiment_factor)

    return FactorResult(score=round(total, 1), signals=signals[:4])


def _keyword_sentiment(news_items: list[dict]) -> float | None:
    """Simple keyword polarity on headlines. Returns -1 to +1."""
    if not news_items:
        return None

    total_polarity = 0.0
    for item in news_items:
        headline = (item.get("title") or "").lower()
        pos = sum(1 for kw in _POSITIVE_KW if kw in headline)
        neg = sum(1 for kw in _NEGATIVE_KW if kw in headline)
        if pos + neg > 0:
            total_polarity += (pos - neg) / (pos + neg)

    return total_polarity / len(news_items)


def _fetch_alpha_vantage_sentiment(symbol: str, api_key: str, recent_news: list[dict]) -> float | None:
    """Try Alpha Vantage NEWS_SENTIMENT endpoint. Falls back to keyword if API fails."""
    try:
        import httpx  # noqa: PLC0415
        url = (
            f"https://www.alphavantage.co/query?function=NEWS_SENTIMENT"
            f"&tickers={symbol}&apikey={api_key}&limit=20"
        )
        resp = httpx.get(url, timeout=5, headers={"User-Agent": "TradingAgents-Dashboard-Scanner/0.1"})
        data = resp.json()
        feed = data.get("feed", [])
        if not feed:
            return _keyword_sentiment(recent_news)
        # AV returns "overall_sentiment_score" per article (-1 to +1)
        scores = [
            float(a["overall_sentiment_score"])
            for a in feed
            if "overall_sentiment_score" in a
        ]
        return sum(scores) / len(scores) if scores else _keyword_sentiment(recent_news)
    except Exception:
        return _keyword_sentiment(recent_news)


class NewsFactor:
    """News factor scorer using yfinance news + optional Alpha Vantage."""

    def __init__(self, alpha_vantage_key: str | None = None) -> None:
        self._alpha_key = alpha_vantage_key

    async def score(self, symbol: str, asset_class: str) -> FactorResult:
        cache_key = f"news:{symbol}"
        entry = _news_cache.get(cache_key)
        if entry is not None:
            ts, result = entry
            if time.time() - ts < _CACHE_TTL:
                return result

        loop = asyncio.get_event_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(None, _fetch_news_sync, symbol, self._alpha_key),
                timeout=8.0,
            )
        except TimeoutError:
            result = FactorResult(score=None, signals=["News fetch timeout"])
        except Exception as exc:
            logger.warning("News factor error for %s: %s", symbol, exc)
            result = FactorResult(score=None, signals=["News error"])

        _news_cache[cache_key] = (time.time(), result)
        return result
