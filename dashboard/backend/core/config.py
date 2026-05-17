"""Application configuration via Pydantic Settings."""
from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    host: str = "127.0.0.1"
    port: int = 8787

    # CORS
    cors_origins: list[str] = [
        # 3000 is the Next.js default — kept for backwards compatibility
        # with any older deployment scripts / dev habits.
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        # 3232 is the new canonical port for this dashboard.
        "http://localhost:3232",
        "http://127.0.0.1:3232",
    ]

    # Data directory (holds DB, token, fernet key, audit log)
    data_dir: Path = Path(__file__).parent.parent / "data"

    # Database
    @property
    def database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.data_dir / 'dashboard.db'}"

    @property
    def sync_database_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'dashboard.db'}"

    # Token/key file paths
    @property
    def token_path(self) -> Path:
        return self.data_dir / ".token"

    @property
    def fernet_key_path(self) -> Path:
        return self.data_dir / ".fernet-key"

    @property
    def audit_log_path(self) -> Path:
        return self.data_dir / "audit.log"

    # Rate limiting
    rate_limit_global: str = "60/minute"
    rate_limit_runs: str = "10/minute"

    # Results directory (where TradingAgentsGraph writes outputs)
    results_dir: Path = Path(os.environ.get(
        "TRADINGAGENTS_RESULTS_DIR",
        Path.home() / ".tradingagents" / "logs"
    ))

    # WebSocket event buffer per run
    ws_event_buffer_size: int = 200


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
        _settings.data_dir.mkdir(parents=True, exist_ok=True)
    return _settings
