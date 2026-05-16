"""Technical factor: RSI, MACD, vol z-score, 52w position."""
from __future__ import annotations

import asyncio
import logging

import pandas as pd

from .base import FactorResult

logger = logging.getLogger("dashboard.scanner.factors.technical")

# Cache: symbol → (timestamp, DataFrame)
_ohlcv_cache: dict[str, tuple[float, pd.DataFrame]] = {}
_OHLCV_CACHE_TTL = 300  # 5 minutes


def _get_cached_ohlcv(symbol: str) -> pd.DataFrame | None:
    import time
    entry = _ohlcv_cache.get(symbol)
    if entry is None:
        return None
    ts, df = entry
    if time.time() - ts > _OHLCV_CACHE_TTL:
        return None
    return df


def _set_cached_ohlcv(symbol: str, df: pd.DataFrame) -> None:
    import time
    _ohlcv_cache[symbol] = (time.time(), df)


def _fetch_ohlcv(symbol: str) -> pd.DataFrame | None:
    """Synchronous yfinance fetch for use in executor."""
    try:
        import yfinance as yf  # noqa: PLC0415
        ticker = yf.Ticker(symbol)
        df = ticker.history(period="60d", interval="1d")
        if df.empty:
            return None
        df.index = pd.to_datetime(df.index)
        return df
    except Exception as exc:
        logger.debug("OHLCV fetch failed for %s: %s", symbol, exc)
        return None


def _compute_rsi(close: pd.Series, period: int = 14) -> float | None:
    """Return current RSI value."""
    if len(close) < period + 1:
        return None
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, float("inf"))
    rsi_series = 100 - (100 / (1 + rs))
    val = rsi_series.iloc[-1]
    if pd.isna(val):
        return None
    return float(val)


def _compute_macd(close: pd.Series) -> tuple[float | None, float | None, bool]:
    """Return (macd_line, signal_line, bull_cross_in_last_5d)."""
    if len(close) < 26:
        return None, None, False
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()

    macd_val = float(macd.iloc[-1]) if not pd.isna(macd.iloc[-1]) else None
    signal_val = float(signal.iloc[-1]) if not pd.isna(signal.iloc[-1]) else None

    # Detect bull cross in last 5 trading days
    bull_cross = False
    if len(macd) >= 6:
        for i in range(-5, 0):
            if (macd.iloc[i - 1] < signal.iloc[i - 1]) and (macd.iloc[i] >= signal.iloc[i]):
                bull_cross = True
                break

    return macd_val, signal_val, bull_cross


def _score_technical(df: pd.DataFrame) -> FactorResult:
    """Compute technical score from OHLCV DataFrame."""
    close = df["Close"].dropna()
    volume = df["Volume"].dropna()

    if len(close) < 5:
        return FactorResult(score=None, signals=["Insufficient price data"])

    signals: list[str] = []
    total_score = 0.0

    # ── RSI position score (0-40) ──────────────────────────────────────────
    rsi = _compute_rsi(close)
    rsi_score = 0.0
    if rsi is not None:
        if 50 <= rsi <= 70:
            rsi_score = 40.0 * ((70 - abs(rsi - 60)) / 10)
            rsi_score = max(20.0, min(40.0, rsi_score))
            signals.append(f"RSI {rsi:.0f} (momentum zone)")
        elif 40 <= rsi < 50:
            rsi_score = 20.0 * (rsi - 40) / 10
            signals.append(f"RSI {rsi:.0f} (building momentum)")
        elif rsi > 70 and rsi <= 85:
            rsi_score = 15.0
            signals.append(f"RSI {rsi:.0f} (overbought — caution)")
        elif rsi < 30:
            rsi_score = 5.0
            signals.append(f"RSI {rsi:.0f} (oversold)")
        else:
            rsi_score = 5.0
    total_score += rsi_score

    # ── MACD score (0-20) ──────────────────────────────────────────────────
    macd_val, signal_val, bull_cross = _compute_macd(close)
    macd_score = 0.0
    if macd_val is not None and signal_val is not None:
        if bull_cross:
            macd_score = 20.0
            signals.append("MACD bullish cross (last 5d)")
        elif macd_val > signal_val and macd_val > 0:
            macd_score = 12.0
            signals.append("MACD bullish (uptrend)")
        elif macd_val > signal_val:
            macd_score = 7.0
            signals.append("MACD above signal")
        else:
            macd_score = 0.0
    total_score += macd_score

    # ── Volume z-score (0-25) ─────────────────────────────────────────────
    vol_score = 0.0
    if len(volume) >= 20:
        vol_20d = volume.iloc[-20:]
        vol_mean = vol_20d.mean()
        vol_std = vol_20d.std()
        today_vol = float(volume.iloc[-1])
        if vol_std > 0 and vol_mean > 0:
            z = (today_vol - vol_mean) / vol_std
            vol_ratio = today_vol / vol_mean
            vol_score = min(25.0, max(0.0, z * 8.0))
            if vol_ratio >= 1.5:
                signals.append(f"Vol {vol_ratio:.1f}× 20d avg")
    total_score += vol_score

    # ── 52-week position score (0-15) ─────────────────────────────────────
    w52_score = 0.0
    if len(close) >= 20:
        period_close = close.iloc[-min(252, len(close)):]
        high_52w = float(period_close.max())
        low_52w = float(period_close.min())
        current = float(close.iloc[-1])
        range_52w = high_52w - low_52w
        if range_52w > 0:
            pct_from_high = (high_52w - current) / high_52w
            if pct_from_high <= 0.05:
                w52_score = 15.0
                signals.append(f"Near 52w high ({pct_from_high*100:.1f}% below)")
            elif pct_from_high <= 0.15:
                w52_score = 8.0
            elif pct_from_high >= 0.50:
                w52_score = 0.0
                signals.append("Far below 52w high")
            else:
                # Linear scale from 8 down to 0 between 15% and 50% from high
                w52_score = 8.0 * (1 - (pct_from_high - 0.15) / 0.35)
    total_score += w52_score

    score = min(100.0, max(0.0, total_score))
    return FactorResult(score=round(score, 1), signals=signals[:5])


class TechnicalFactor:
    """Technical factor scorer using yfinance OHLCV data."""

    def __init__(self, ohlcv_cache: dict[str, pd.DataFrame] | None = None) -> None:
        # ohlcv_cache allows injecting pre-fetched batch data
        self._ohlcv_cache = ohlcv_cache or {}

    async def score(self, symbol: str, asset_class: str) -> FactorResult:
        loop = asyncio.get_event_loop()

        # Check injected cache first
        df = self._ohlcv_cache.get(symbol)

        # Then check module-level TTL cache
        if df is None:
            df = _get_cached_ohlcv(symbol)

        if df is None:
            try:
                df = await asyncio.wait_for(
                    loop.run_in_executor(None, _fetch_ohlcv, symbol),
                    timeout=8.0,
                )
            except Exception as exc:
                logger.debug("Technical factor timeout/error for %s: %s", symbol, exc)
                return FactorResult(score=None, signals=["Data fetch timeout"])

            if df is not None:
                _set_cached_ohlcv(symbol, df)

        if df is None or df.empty:
            return FactorResult(score=None, signals=["No price data"])

        try:
            return _score_technical(df)
        except Exception as exc:
            logger.warning("Technical scoring failed for %s: %s", symbol, exc)
            return FactorResult(score=None, signals=["Scoring error"])
