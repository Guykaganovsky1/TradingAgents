"""Composite weighted scorer: aggregates all factors into a final 0-100 score."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from .factors.base import FactorResult

logger = logging.getLogger("dashboard.scanner.scorer")

# Default factor weights (must sum to 1.0)
DEFAULT_WEIGHTS: dict[str, float] = {
    "technical": 0.40,
    "news": 0.30,
    "sentiment": 0.20,
    "fundamental": 0.10,
}


@dataclass
class ScoredCandidate:
    symbol: str
    name: str
    asset_class: str
    composite_score: float
    rank: int
    factor_results: dict[str, FactorResult]
    price: float | None = None
    price_change_24h_pct: float | None = None
    volume_usd_24h: float | None = None


def compute_composite(
    factor_results: dict[str, FactorResult],
    asset_class: str,
    weights: dict[str, float] | None = None,
) -> float | None:
    """
    Compute re-normalized composite score.

    Rules:
    - Crypto: fundamental is always None → weights re-normalize over tech/news/sentiment
    - Any factor with score=None is excluded; remaining weights re-normalize
    - If ALL factors are None → return None (ticker excluded from ranking)
    """
    w = dict(weights or DEFAULT_WEIGHTS)

    # Collect only factors with valid scores
    present: dict[str, float] = {}
    for name, result in factor_results.items():
        if result.score is not None and name in w:
            present[name] = result.score

    if not present:
        return None

    total_weight = sum(w[n] for n in present)
    if total_weight <= 0:
        return None

    composite = sum(present[n] * w[n] for n in present) / total_weight
    return round(min(100.0, max(0.0, composite)), 2)


def build_suggested_analysts(
    factor_results: dict[str, FactorResult],
    asset_class: str,
) -> list[str]:
    """
    Determine which TradingAgents analysts to suggest based on which signals fired.
    """
    analysts: list[str] = ["market"]  # always included

    tech = factor_results.get("technical")
    if tech and tech.score is not None:
        # "market" is already included; strong technical → reinforced
        pass

    news = factor_results.get("news")
    if news and news.score is not None:
        # Count signals — if any news fired (article count mentions >=3 articles)
        for sig in (news.signals or []):
            if "article" in sig.lower():
                try:
                    n = int(sig.split()[0])
                    if n >= 3:
                        if "news" not in analysts:
                            analysts.append("news")
                        break
                except (ValueError, IndexError):
                    pass
        if "news" not in analysts and news.score >= 30:
            analysts.append("news")

    sentiment = factor_results.get("sentiment")
    if sentiment and sentiment.score is not None:
        # Check if z-score signals fired
        for sig in (sentiment.signals or []):
            if "z=" in sig:
                try:
                    z_str = sig.split("z=")[1].split(")")[0].strip()
                    z = float(z_str)
                    if z >= 1.0:
                        if "social" not in analysts:
                            analysts.append("social")
                        break
                except (ValueError, IndexError):
                    pass
        if "social" not in analysts and sentiment.score >= 50:
            analysts.append("social")

    if asset_class == "stock" and "fundamentals" not in analysts:
        analysts.append("fundamentals")

    return analysts


def rank_candidates(scored: list[ScoredCandidate], top_n: int) -> list[ScoredCandidate]:
    """Sort by composite score desc, assign ranks, return top_n."""
    # Filter out None scores
    valid = [s for s in scored if s.composite_score is not None]
    valid.sort(key=lambda s: s.composite_score, reverse=True)
    for i, s in enumerate(valid[:top_n]):
        s.rank = i + 1
    return valid[:top_n]
