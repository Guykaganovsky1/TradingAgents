"""Ticker validation via yfinance round-trip."""
from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger("dashboard.services.ticker_validator")


async def validate_ticker(ticker: str) -> tuple[bool, str]:
    """
    Returns (is_valid, message).
    Runs yfinance in a thread pool with 10-second timeout.
    """
    loop = asyncio.get_running_loop()

    def _check() -> tuple[bool, str]:
        try:
            import yfinance as yf  # noqa: PLC0415
            info = yf.Ticker(ticker).info
            # yfinance returns a dict; if ticker is invalid, it often has no 'symbol'
            # or minimal keys like just {'trailingPegRatio': None}
            symbol = info.get("symbol") or info.get("shortName") or info.get("longName")
            if symbol or len(info) > 5:
                name = info.get("shortName") or info.get("longName") or ticker
                return True, name
            return False, f"Ticker '{ticker}' not found"
        except Exception as exc:
            logger.warning("Ticker validation failed for %s: %s", ticker, exc)
            return False, str(exc)

    try:
        valid, msg = await asyncio.wait_for(
            loop.run_in_executor(None, _check),
            timeout=10.0,
        )
        return valid, msg
    except TimeoutError:
        return False, "Ticker validation timed out"
