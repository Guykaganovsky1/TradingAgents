"""Tests for composite scorer math and re-normalization."""
from __future__ import annotations

from services.scanner.factors.base import FactorResult
from services.scanner.scorer import (
    build_suggested_analysts,
    compute_composite,
    rank_candidates,
)

# ---------------------------------------------------------------------------
# compute_composite
# ---------------------------------------------------------------------------

def test_composite_all_factors_present():
    """All 4 factors present → weighted average with correct weights."""
    fr = {
        "technical":   FactorResult(score=80.0, signals=[]),
        "news":        FactorResult(score=60.0, signals=[]),
        "sentiment":   FactorResult(score=40.0, signals=[]),
        "fundamental": FactorResult(score=90.0, signals=[]),
    }
    # Expected: 80*0.4 + 60*0.3 + 40*0.2 + 90*0.1 = 32+18+8+9 = 67.0
    c = compute_composite(fr, "stock")
    assert c is not None
    assert abs(c - 67.0) < 0.5


def test_composite_crypto_no_fundamental():
    """Crypto: fundamental=None, weights re-normalize to 0.4/0.3/0.2 → sum to 0.9 → renorm."""
    fr = {
        "technical":   FactorResult(score=100.0, signals=[]),
        "news":        FactorResult(score=100.0, signals=[]),
        "sentiment":   FactorResult(score=100.0, signals=[]),
        "fundamental": FactorResult(score=None, signals=[]),
    }
    c = compute_composite(fr, "crypto")
    assert c == 100.0


def test_composite_sentiment_missing():
    """Sentiment missing: re-normalize across tech/news/fundamental."""
    fr = {
        "technical":   FactorResult(score=50.0, signals=[]),
        "news":        FactorResult(score=50.0, signals=[]),
        "sentiment":   FactorResult(score=None, signals=[]),
        "fundamental": FactorResult(score=50.0, signals=[]),
    }
    c = compute_composite(fr, "stock")
    # All present factors score 50 → composite should be 50
    assert c is not None
    assert abs(c - 50.0) < 0.5


def test_composite_all_none_returns_none():
    """If all factor scores are None, composite is None."""
    fr = {
        "technical":   FactorResult(score=None, signals=[]),
        "news":        FactorResult(score=None, signals=[]),
        "sentiment":   FactorResult(score=None, signals=[]),
        "fundamental": FactorResult(score=None, signals=[]),
    }
    c = compute_composite(fr, "stock")
    assert c is None


def test_composite_only_technical():
    """Only technical available → composite equals technical score."""
    fr = {
        "technical":   FactorResult(score=75.0, signals=[]),
        "news":        FactorResult(score=None, signals=[]),
        "sentiment":   FactorResult(score=None, signals=[]),
        "fundamental": FactorResult(score=None, signals=[]),
    }
    c = compute_composite(fr, "stock")
    assert c is not None
    assert abs(c - 75.0) < 0.5


def test_composite_clamped_to_100():
    """Score never exceeds 100."""
    fr = {
        "technical":   FactorResult(score=100.0, signals=[]),
        "news":        FactorResult(score=100.0, signals=[]),
        "sentiment":   FactorResult(score=100.0, signals=[]),
        "fundamental": FactorResult(score=100.0, signals=[]),
    }
    c = compute_composite(fr, "stock")
    assert c is not None
    assert c <= 100.0


def test_composite_clamped_to_zero():
    """Score never below 0."""
    fr = {
        "technical":   FactorResult(score=0.0, signals=[]),
        "news":        FactorResult(score=0.0, signals=[]),
        "sentiment":   FactorResult(score=0.0, signals=[]),
        "fundamental": FactorResult(score=0.0, signals=[]),
    }
    c = compute_composite(fr, "stock")
    assert c is not None
    assert c >= 0.0


def test_composite_renormalization_is_correct():
    """Verify exact re-normalized math when 2 factors are missing."""
    # technical=60, news=80, others None
    # weights: tech=0.4, news=0.3 → sum=0.7
    # composite = (60*0.4 + 80*0.3) / 0.7 = (24+24)/0.7 = 48/0.7 ≈ 68.57
    fr = {
        "technical":   FactorResult(score=60.0, signals=[]),
        "news":        FactorResult(score=80.0, signals=[]),
        "sentiment":   FactorResult(score=None, signals=[]),
        "fundamental": FactorResult(score=None, signals=[]),
    }
    c = compute_composite(fr, "stock")
    expected = (60 * 0.4 + 80 * 0.3) / 0.7
    assert c is not None
    assert abs(c - expected) < 0.5


# ---------------------------------------------------------------------------
# build_suggested_analysts
# ---------------------------------------------------------------------------

def test_suggested_analysts_always_includes_market():
    fr = {
        "technical":   FactorResult(score=50.0, signals=[]),
        "news":        FactorResult(score=None, signals=[]),
        "sentiment":   FactorResult(score=None, signals=[]),
        "fundamental": FactorResult(score=None, signals=[]),
    }
    analysts = build_suggested_analysts(fr, "stock")
    assert "market" in analysts


def test_suggested_analysts_includes_news_when_high_articles():
    fr = {
        "technical":   FactorResult(score=60.0, signals=[]),
        "news":        FactorResult(score=75.0, signals=["5 articles last 24h", "sentiment +0.4"]),
        "sentiment":   FactorResult(score=None, signals=[]),
        "fundamental": FactorResult(score=50.0, signals=[]),
    }
    analysts = build_suggested_analysts(fr, "stock")
    assert "news" in analysts


def test_suggested_analysts_includes_fundamentals_for_stocks():
    fr = {
        "technical":   FactorResult(score=60.0, signals=[]),
        "news":        FactorResult(score=50.0, signals=[]),
        "sentiment":   FactorResult(score=None, signals=[]),
        "fundamental": FactorResult(score=70.0, signals=["P/E 18"]),
    }
    analysts = build_suggested_analysts(fr, "stock")
    assert "fundamentals" in analysts


def test_suggested_analysts_no_fundamentals_for_crypto():
    fr = {
        "technical":   FactorResult(score=60.0, signals=[]),
        "news":        FactorResult(score=50.0, signals=[]),
        "sentiment":   FactorResult(score=None, signals=[]),
        "fundamental": FactorResult(score=None, signals=[]),
    }
    analysts = build_suggested_analysts(fr, "crypto")
    assert "fundamentals" not in analysts
    assert "market" in analysts


def test_suggested_analysts_includes_social_on_high_z():
    fr = {
        "technical":   FactorResult(score=60.0, signals=[]),
        "news":        FactorResult(score=50.0, signals=[]),
        "sentiment":   FactorResult(score=80.0, signals=["r/stocks z=2.1 (very high)"]),
        "fundamental": FactorResult(score=50.0, signals=[]),
    }
    analysts = build_suggested_analysts(fr, "stock")
    assert "social" in analysts


# ---------------------------------------------------------------------------
# rank_candidates
# ---------------------------------------------------------------------------

def test_rank_candidates_order():
    """Candidates sorted by composite_score descending."""
    from services.scanner.scorer import ScoredCandidate

    candidates = [
        ScoredCandidate("AAPL", "Apple", "stock", composite_score=70.0, rank=0, factor_results={}),
        ScoredCandidate("NVDA", "NVIDIA", "stock", composite_score=90.0, rank=0, factor_results={}),
        ScoredCandidate("MSFT", "Microsoft", "stock", composite_score=80.0, rank=0, factor_results={}),
    ]
    ranked = rank_candidates(candidates, top_n=3)
    assert ranked[0].symbol == "NVDA"
    assert ranked[1].symbol == "MSFT"
    assert ranked[2].symbol == "AAPL"
    assert ranked[0].rank == 1
    assert ranked[2].rank == 3


def test_rank_candidates_top_n_limits():
    """Only top_n results returned."""
    from services.scanner.scorer import ScoredCandidate

    candidates = [
        ScoredCandidate(f"SYM{i}", f"Company{i}", "stock", composite_score=float(i), rank=0, factor_results={})
        for i in range(20)
    ]
    ranked = rank_candidates(candidates, top_n=5)
    assert len(ranked) == 5
    assert ranked[0].composite_score == 19.0  # highest


def test_rank_candidates_excludes_none_scores():
    """Candidates with composite_score=None are excluded (already filtered by compute_composite)."""
    from services.scanner.scorer import ScoredCandidate

    # rank_candidates itself doesn't filter None — it's compute_composite that returns None
    # but ScoredCandidate has float composite_score so None wouldn't be set normally
    # Test that valid candidates still rank correctly
    candidates = [
        ScoredCandidate("A", "A", "stock", composite_score=50.0, rank=0, factor_results={}),
        ScoredCandidate("B", "B", "stock", composite_score=75.0, rank=0, factor_results={}),
    ]
    ranked = rank_candidates(candidates, top_n=5)
    assert ranked[0].symbol == "B"
