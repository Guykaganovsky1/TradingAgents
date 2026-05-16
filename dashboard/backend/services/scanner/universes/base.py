"""Base types for universe providers."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class ScanCandidate:
    """A ticker candidate from a universe provider."""
    symbol: str
    name: str
    asset_class: str  # "stock" | "crypto"
    # Optional price info from the universe source (avoids extra yf fetch)
    price: float | None = None
    price_change_24h_pct: float | None = None
    volume_usd_24h: float | None = None
    extra: dict = field(default_factory=dict)


class UniverseProvider(Protocol):
    """Protocol every universe provider must implement."""

    async def fetch(self) -> list[ScanCandidate]:
        """Return the list of candidates for this universe."""
        ...
