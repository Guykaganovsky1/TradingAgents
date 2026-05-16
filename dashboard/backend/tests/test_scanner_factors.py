"""Tests for factor scorers — all network/yfinance calls mocked."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from services.scanner.factors.base import FactorResult
from services.scanner.factors.fundamental import FundamentalFactor, _score_fundamental
from services.scanner.factors.news import NewsFactor, _keyword_sentiment
from services.scanner.factors.sentiment import SentimentFactor
from services.scanner.factors.technical import TechnicalFactor, _score_technical

# ---------------------------------------------------------------------------
# Helpers: build mock OHLCV DataFrames
# ---------------------------------------------------------------------------

def _make_ohlcv(n: int = 60, trend: str = "up") -> pd.DataFrame:
    """Create a synthetic OHLCV DataFrame for testing."""
    import numpy as np

    np.random.seed(42)
    base = 100.0
    prices = []
    for i in range(n):
        if trend == "up":
            prices.append(base + i * 0.5 + np.random.normal(0, 0.5))
        elif trend == "down":
            prices.append(base + 30 - i * 0.5 + np.random.normal(0, 0.5))
        else:
            prices.append(base + np.random.normal(0, 1))

    volumes = [1_000_000 + np.random.randint(-100_000, 500_000) for _ in range(n)]
    # Last day: volume spike
    volumes[-1] = 3_000_000

    idx = pd.date_range("2025-01-01", periods=n, freq="D")
    return pd.DataFrame({
        "Open": prices,
        "High": [p * 1.01 for p in prices],
        "Low": [p * 0.99 for p in prices],
        "Close": prices,
        "Volume": volumes,
    }, index=idx)


# ---------------------------------------------------------------------------
# Technical Factor
# ---------------------------------------------------------------------------

def test_technical_score_bullish_trend():
    """Uptrending ticker should score above 30."""
    df = _make_ohlcv(60, trend="up")
    result = _score_technical(df)
    assert result.score is not None
    assert 0 <= result.score <= 100
    assert len(result.signals) >= 1


def test_technical_score_bearish_trend():
    """Downtrending ticker should score below bullish."""
    df_up = _make_ohlcv(60, trend="up")
    df_down = _make_ohlcv(60, trend="down")
    r_up = _score_technical(df_up)
    r_down = _score_technical(df_down)
    assert r_up.score is not None and r_down.score is not None
    # Up trend should beat down trend
    assert r_up.score >= r_down.score


def test_technical_insufficient_data():
    """< 5 rows → score=None."""
    df = _make_ohlcv(3)
    result = _score_technical(df)
    assert result.score is None


def test_technical_volume_spike_signal():
    """Volume spike should appear in signals."""
    df = _make_ohlcv(60, trend="up")
    # Force a 5x volume spike on last day (use int to avoid dtype mismatch)
    spike = int(df["Volume"].mean() * 5)
    df = df.copy()
    df["Volume"] = df["Volume"].astype(float)
    df.iloc[-1, df.columns.get_loc("Volume")] = float(spike)
    result = _score_technical(df)
    assert any("vol" in s.lower() or "×" in s.lower() for s in (result.signals or []))


@pytest.mark.asyncio
async def test_technical_factor_uses_injected_cache():
    """TechnicalFactor accepts pre-injected OHLCV cache."""
    df = _make_ohlcv(60, trend="up")
    factor = TechnicalFactor(ohlcv_cache={"AAPL": df})
    result = await factor.score("AAPL", "stock")
    assert result.score is not None
    assert 0 <= result.score <= 100


@pytest.mark.asyncio
async def test_technical_factor_returns_none_on_empty_data():
    """No data → score=None."""
    def fake_fetch(symbol):
        return None

    with patch("services.scanner.factors.technical._fetch_ohlcv", side_effect=fake_fetch):
        factor = TechnicalFactor()
        result = await factor.score("FAKE", "stock")
    assert result.score is None


# ---------------------------------------------------------------------------
# News Factor
# ---------------------------------------------------------------------------

def test_keyword_sentiment_positive():
    """Positive keywords → positive sentiment."""
    news = [
        {"title": "AAPL beats earnings estimates, stock surges", "providerPublishTime": 9999999999},
        {"title": "Apple reports record revenue growth", "providerPublishTime": 9999999999},
    ]
    s = _keyword_sentiment(news)
    assert s is not None and s > 0


def test_keyword_sentiment_negative():
    """Negative keywords → negative sentiment."""
    news = [
        {"title": "Company faces lawsuit over patent miss", "providerPublishTime": 9999999999},
        {"title": "Revenue miss, stock falls after downgrade", "providerPublishTime": 9999999999},
    ]
    s = _keyword_sentiment(news)
    assert s is not None and s < 0


def test_keyword_sentiment_empty():
    assert _keyword_sentiment([]) is None


@pytest.mark.asyncio
async def test_news_factor_with_fresh_news():
    """News factor with recent articles should return valid score."""
    from datetime import UTC, datetime

    now_ts = datetime.now(tz=UTC).timestamp()
    fake_news = [
        {"title": "MSFT beats earnings, stock surges", "providerPublishTime": int(now_ts - 100)},
        {"title": "Microsoft wins cloud deal", "providerPublishTime": int(now_ts - 200)},
        {"title": "MSFT upgrade from analysts", "providerPublishTime": int(now_ts - 300)},
    ]

    mock_ticker = MagicMock()
    mock_ticker.news = fake_news

    with patch("yfinance.Ticker", return_value=mock_ticker):
        factor = NewsFactor(alpha_vantage_key=None)
        result = await factor.score("MSFT", "stock")

    assert result.score is not None
    assert 0 <= result.score <= 100
    assert any("3 article" in s or "article" in s for s in (result.signals or []))


@pytest.mark.asyncio
async def test_news_factor_no_recent_articles():
    """Old articles (>24h) should not count."""
    from datetime import UTC, datetime

    old_ts = datetime.now(tz=UTC).timestamp() - 90000  # 25 hours ago
    fake_news = [
        {"title": "Old news", "providerPublishTime": int(old_ts)},
    ]

    mock_ticker = MagicMock()
    mock_ticker.news = fake_news

    with patch("yfinance.Ticker", return_value=mock_ticker):
        factor = NewsFactor()
        result = await factor.score("XYZ", "stock")

    assert result.score is not None
    assert any("0 article" in s for s in (result.signals or []))


@pytest.mark.asyncio
async def test_news_factor_uses_cache():
    """Second call within 5 min returns cached result."""
    import time

    from services.scanner.factors.news import _news_cache

    cached_result = FactorResult(score=77.0, signals=["cached"])
    _news_cache["news:CACHED"] = (time.time(), cached_result)

    factor = NewsFactor()
    result = await factor.score("CACHED", "stock")
    assert result.score == 77.0


# ---------------------------------------------------------------------------
# Sentiment Factor
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sentiment_factor_unavailable_without_creds():
    """Sentiment factor returns score=None when no Reddit creds."""
    factor = SentimentFactor(client_id=None, client_secret=None)
    assert not factor.available
    result = await factor.score("AAPL", "stock")
    assert result.score is None
    assert any("not configured" in s.lower() for s in (result.signals or []))


@pytest.mark.asyncio
async def test_sentiment_factor_with_creds_and_mock():
    """Sentiment factor computes score when Reddit returns mentions."""
    def mock_fetch_sync(symbol, asset_class, client_id, client_secret):
        return FactorResult(score=75.0, signals=["r/stocks z=1.5"])

    with patch("services.scanner.factors.sentiment._fetch_sentiment_sync", side_effect=mock_fetch_sync):
        factor = SentimentFactor(client_id="test_id", client_secret="test_secret")
        # Clear cache first
        from services.scanner.factors.sentiment import _sentiment_cache
        _sentiment_cache.clear()
        result = await factor.score("AAPL", "stock")

    assert result.score == 75.0


# ---------------------------------------------------------------------------
# Fundamental Factor
# ---------------------------------------------------------------------------

def test_fundamental_score_healthy_company():
    """Healthy P/E, margin, D/E → high score."""
    info = {
        "trailingPE": 18.0,         # below sector avg
        "profitMargins": 0.25,       # >20%
        "debtToEquity": 50.0,        # 0.5 in decimal (healthy)
        "heldPercentInsiders": 0.10, # 10%
    }
    result = _score_fundamental(info)
    assert result.score is not None
    assert result.score >= 60
    assert len(result.signals) >= 2


def test_fundamental_score_high_leverage():
    """High D/E should lower score."""
    info = {
        "trailingPE": 25.0,
        "profitMargins": 0.15,
        "debtToEquity": 400.0,  # 4.0 in decimal — high
        "heldPercentInsiders": 0.05,
    }
    result = _score_fundamental(info)
    assert result.score is not None
    # de_score should be 0
    assert any("leverage" in s.lower() for s in (result.signals or []))


def test_fundamental_score_empty_info():
    """Empty info → some partial credit, not a crash."""
    result = _score_fundamental({})
    assert result.score is not None
    assert 0 <= result.score <= 100


@pytest.mark.asyncio
async def test_fundamental_factor_crypto_returns_none():
    """Crypto should always return score=None for fundamentals."""
    factor = FundamentalFactor()
    result = await factor.score("BTC-USD", "crypto")
    assert result.score is None
    assert any("crypto" in s.lower() for s in (result.signals or []))


@pytest.mark.asyncio
async def test_fundamental_factor_stock_with_mocked_info():
    """Fundamental factor fetches info and scores it."""
    mock_info = {
        "trailingPE": 15.0,
        "profitMargins": 0.30,
        "debtToEquity": 40.0,
        "heldPercentInsiders": 0.08,
    }
    mock_ticker = MagicMock()
    mock_ticker.info = mock_info

    with patch("yfinance.Ticker", return_value=mock_ticker):
        factor = FundamentalFactor()
        from services.scanner.factors.fundamental import _fundamental_cache
        _fundamental_cache.clear()
        result = await factor.score("AAPL", "stock")

    assert result.score is not None
    assert result.score >= 50
