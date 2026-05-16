"""Bearer auth dependency and Fernet helpers."""
from __future__ import annotations

import logging
import os
import secrets
import stat
from pathlib import Path

from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger("dashboard.security")

_bearer = HTTPBearer(auto_error=False)

# Module-level cache for loaded key and token
_fernet_instance: Fernet | None = None
_api_token: str | None = None


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def generate_token_if_missing(token_path: Path) -> str:
    """Return existing token or generate+persist a new one (mode 0o600)."""
    global _api_token
    if token_path.exists():
        _api_token = token_path.read_text().strip()
        return _api_token
    token = secrets.token_urlsafe(32)
    token_path.write_text(token)
    os.chmod(token_path, stat.S_IRUSR | stat.S_IWUSR)
    # Log ONCE so user can copy it
    print(f"\n{'='*60}")  # noqa: T201  — intentional one-time startup print
    print(f"  DASHBOARD_API_TOKEN: {token}")  # noqa: T201
    print(f"  (saved to {token_path})")  # noqa: T201
    print(f"{'='*60}\n")  # noqa: T201
    _api_token = token
    return token


def get_api_token() -> str:
    """Return the cached API token (must call generate_token_if_missing first)."""
    if _api_token is None:
        raise RuntimeError("Token not initialised — call generate_token_if_missing first")
    return _api_token


# ---------------------------------------------------------------------------
# Fernet helpers
# ---------------------------------------------------------------------------

def generate_fernet_key_if_missing(key_path: Path) -> Fernet:
    """Return Fernet instance, generating+persisting key if needed."""
    global _fernet_instance
    if _fernet_instance is not None:
        return _fernet_instance
    if key_path.exists():
        raw = key_path.read_bytes().strip()
    else:
        raw = Fernet.generate_key()
        key_path.write_bytes(raw)
        os.chmod(key_path, stat.S_IRUSR | stat.S_IWUSR)
        logger.info("Generated new Fernet key at %s", key_path)
    _fernet_instance = Fernet(raw)
    return _fernet_instance


def get_fernet() -> Fernet:
    if _fernet_instance is None:
        raise RuntimeError("Fernet not initialised — call generate_fernet_key_if_missing first")
    return _fernet_instance


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a secret string; returns URL-safe base64 ciphertext."""
    return get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt a Fernet ciphertext; raises ValueError on bad token."""
    try:
        return get_fernet().decrypt(ciphertext.encode()).decode()
    except Exception as exc:
        raise ValueError("Failed to decrypt secret") from exc


# ---------------------------------------------------------------------------
# FastAPI auth dependency
# ---------------------------------------------------------------------------

async def require_auth(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Verify Bearer token. Also accepts ?token= query param for WebSocket."""
    token = None
    if credentials is not None:
        token = credentials.credentials
    else:
        # WebSocket / query-param fallback
        token = request.query_params.get("token")

    if not token or token != get_api_token():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
