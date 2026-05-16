"""Fundamental factor: P/E percentile, profit margin, D/E, insider holdings."""
from __future__ import annotations

import asyncio
import logging
import time

from .base import FactorResult

logger = logging.getLogger("dashboard.scanner.factors.fundamental")

# In-memory 5-minute TTL cache: key="fundamental:{symbol}" → (timestamp, FactorResult)
_fundamental_cache: dict[str, tuple[float, FactorResult]] = {}
_CACHE_TTL = 300  # 5 minutes


def _fetch_info_sync(symbol: str) -> dict:
    """Synchronous yfinance .info fetch."""
    try:
        import yfinance as yf  # noqa: PLC0415
        ticker = yf.Ticker(symbol)
        return ticker.info or {}
    except Exception as exc:
        logger.debug("yfinance info fetch failed for %s: %s", symbol, exc)
        return {}


def _score_fundamental(info: dict) -> FactorResult:
    """Compute fundamental score from yfinance .info dict."""
    signals: list[str] = []
    total = 0.0

    # ── P/E percentile within sector (0-50) ─────────────────────────────
    pe = info.get("trailingPE") or info.get("forwardPE")
    sector_pe_median = 25.0  # rough S&P 500 median
    pe_score = 0.0
    if pe is not None and pe > 0:
        # Score: below median is good (value), above is penalized
        if pe < sector_pe_median * 0.5:
            pe_score = 50.0
            signals.append(f"P/E {pe:.0f} (deep value)")
        elif pe < sector_pe_median:
            pe_score = 35.0
            signals.append(f"P/E {pe:.0f} (below sector avg {sector_pe_median:.0f})")
        elif pe < sector_pe_median * 2.0:
            pe_score = 20.0
            signals.append(f"P/E {pe:.0f} (sector avg {sector_pe_median:.0f})")
        else:
            pe_score = 5.0
            signals.append(f"P/E {pe:.0f} (extended valuation)")
    else:
        pe_score = 10.0  # no P/E data (e.g., unprofitable — partial credit)
    total += pe_score

    # ── Profit margin (0-20) ─────────────────────────────────────────────
    margin = info.get("profitMargins")
    margin_score = 0.0
    if margin is not None:
        if margin > 0.20:
            margin_score = 20.0
            signals.append(f"Profit margin {margin*100:.0f}% (high)")
        elif margin > 0.10:
            margin_score = 12.0
            signals.append(f"Profit margin {margin*100:.0f}%")
        elif margin > 0:
            margin_score = 5.0
        else:
            margin_score = 0.0
    total += margin_score

    # ── Debt/equity ratio (0-20) ─────────────────────────────────────────
    de = info.get("debtToEquity")
    de_score = 0.0
    if de is not None:
        # Healthy band: 30-150 (0.3-1.5 as decimal in some APIs, or 30-150 in percent form)
        # yfinance returns debtToEquity in percent (e.g., 45.2 means 45.2%)
        de_decimal = de / 100.0 if de > 5 else de  # normalize
        if 0.3 <= de_decimal <= 1.5:
            de_score = 20.0
            signals.append(f"D/E {de_decimal:.2f} (healthy)")
        elif de_decimal < 0.3:
            de_score = 15.0
            signals.append(f"D/E {de_decimal:.2f} (low leverage)")
        elif de_decimal < 3.0:
            de_score = 8.0
        else:
            de_score = 0.0
            signals.append(f"D/E {de_decimal:.2f} (high leverage)")
    total += de_score

    # ── Insider holdings quality (0-10) ──────────────────────────────────
    insider = info.get("heldPercentInsiders")
    insider_score = 0.0
    if insider is not None:
        if 0.0 < insider <= 0.30:
            insider_score = 10.0
            signals.append(f"Insider {insider*100:.0f}% (aligned)")
        elif insider > 0.30:
            insider_score = 5.0
        else:
            insider_score = 3.0
    total += insider_score

    score = min(100.0, max(0.0, total))
    return FactorResult(score=round(score, 1), signals=signals[:4])


class FundamentalFactor:
    """Fundamental factor scorer — stocks only, crypto returns None."""

    async def score(self, symbol: str, asset_class: str) -> FactorResult:
        # Crypto has no fundamentals
        if asset_class == "crypto":
            return FactorResult(score=None, signals=["N/A for crypto"])

        cache_key = f"fundamental:{symbol}"
        entry = _fundamental_cache.get(cache_key)
        if entry is not None:
            ts, result = entry
            if time.time() - ts < _CACHE_TTL:
                return result

        loop = asyncio.get_event_loop()
        try:
            info = await asyncio.wait_for(
                loop.run_in_executor(None, _fetch_info_sync, symbol),
                timeout=8.0,
            )
        except TimeoutError:
            result = FactorResult(score=None, signals=["Fundamental fetch timeout"])
            _fundamental_cache[cache_key] = (time.time(), result)
            return result
        except Exception as exc:
            logger.warning("Fundamental factor error for %s: %s", symbol, exc)
            result = FactorResult(score=None, signals=["Fundamental error"])
            _fundamental_cache[cache_key] = (time.time(), result)
            return result

        if not info:
            result = FactorResult(score=None, signals=["No fundamental data"])
        else:
            try:
                result = _score_fundamental(info)
            except Exception as exc:
                logger.warning("Fundamental scoring failed for %s: %s", symbol, exc)
                result = FactorResult(score=None, signals=["Scoring error"])

        _fundamental_cache[cache_key] = (time.time(), result)
        return result
