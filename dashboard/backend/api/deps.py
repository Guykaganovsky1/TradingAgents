"""Shared FastAPI dependencies."""
from __future__ import annotations

from core.db import get_session  # re-export
from core.security import require_auth  # re-export

__all__ = ["get_session", "require_auth"]
