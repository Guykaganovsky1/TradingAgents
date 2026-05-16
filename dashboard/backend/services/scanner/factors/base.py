"""Base types for factor scorers."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class FactorResult:
    """Output from a single factor scorer. score is None if the factor could not run."""
    score: float | None  # 0-100 or None (factor unavailable)
    signals: list[str] = field(default_factory=list)


class FactorScorer(Protocol):
    """Protocol every factor scorer must implement."""

    async def score(self, symbol: str, asset_class: str) -> FactorResult:
        """Compute factor score for a single symbol. Returns FactorResult with score=None on failure."""
        ...
