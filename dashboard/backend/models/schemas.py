"""Pydantic v2 request/response schemas."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

TICKER_REGEX = re.compile(r"^[A-Z0-9.\-]{1,10}$")


def validate_ticker(v: str) -> str:
    v = v.strip().upper()
    if not TICKER_REGEX.match(v):
        raise ValueError(
            "Ticker must be 1-10 uppercase alphanumeric characters (dots and hyphens allowed)"
        )
    return v


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AnalystType(StrEnum):
    market = "market"
    social = "social"
    news = "news"
    fundamentals = "fundamentals"


class RunStatus(StrEnum):
    queued = "queued"
    running = "running"
    done = "done"
    complete = "complete"  # alias exposed to frontend (maps to done)
    error = "error"


class SettingsKey(StrEnum):
    llm_provider = "llm_provider"
    deep_think_llm = "deep_think_llm"
    quick_think_llm = "quick_think_llm"
    backend_url = "backend_url"
    openai_api_key = "openai_api_key"
    anthropic_api_key = "anthropic_api_key"
    google_api_key = "google_api_key"
    alpha_vantage_api_key = "alpha_vantage_api_key"
    output_language = "output_language"
    max_debate_rounds = "max_debate_rounds"
    max_risk_discuss_rounds = "max_risk_discuss_rounds"
    ollama_base_url = "ollama_base_url"
    auto_save = "auto_save"
    codex_planner_enabled = "codex_planner_enabled"


# Sensitive keys whose values are Fernet-encrypted
SENSITIVE_KEYS: set[str] = {
    SettingsKey.openai_api_key,
    SettingsKey.anthropic_api_key,
    SettingsKey.google_api_key,
    SettingsKey.alpha_vantage_api_key,
}

# ---------------------------------------------------------------------------
# Watchlist
# ---------------------------------------------------------------------------

class WatchlistCreate(BaseModel):
    ticker: str

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str) -> str:
        return validate_ticker(v)


class WatchlistItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticker: str
    display_name: str | None = None
    analysts: list[str] | None = None
    notes: str | None = None
    added_at: datetime | None = None
    last_run_id: str | None = None
    created_at: datetime

    @field_validator("analysts", mode="before")
    @classmethod
    def coerce_analysts(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return v
        return []

    @field_validator("display_name", mode="before")
    @classmethod
    def coerce_display_name(cls, v):
        return v  # will be filled in model_post_init from ticker if None

    def model_post_init(self, __context) -> None:  # type: ignore[override]
        # Fall back display_name to ticker if not set
        if not self.display_name:
            object.__setattr__(self, "display_name", self.ticker)


class WatchlistItemWithSchedules(WatchlistItem):
    schedules: list[ScheduleSummary] = []
    # These are populated by the repo layer via a JOIN with run_index
    latest_decision: str | None = None
    latest_confidence: float | None = None
    latest_run_at: datetime | None = None


# ---------------------------------------------------------------------------
# Schedules
# ---------------------------------------------------------------------------

class ScheduleCreate(BaseModel):
    cron_expr: str = Field(..., min_length=1, max_length=100)
    analysts: list[AnalystType] = Field(
        default_factory=lambda: list(AnalystType)
    )
    enabled: bool = True

    @field_validator("cron_expr")
    @classmethod
    def validate_cron(cls, v: str) -> str:
        from croniter import croniter  # noqa: PLC0415
        if not croniter.is_valid(v):
            raise ValueError(f"Invalid cron expression: {v!r}")
        return v


class ScheduleUpdate(BaseModel):
    cron_expr: str | None = Field(None, min_length=1, max_length=100)
    analysts: list[AnalystType] | None = None
    enabled: bool | None = None

    @field_validator("cron_expr")
    @classmethod
    def validate_cron(cls, v: str | None) -> str | None:
        if v is None:
            return v
        from croniter import croniter  # noqa: PLC0415
        if not croniter.is_valid(v):
            raise ValueError(f"Invalid cron expression: {v!r}")
        return v


class ScheduleSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cron_expr: str
    analysts: list[str]
    enabled: bool
    created_at: datetime
    updated_at: datetime


class ScheduleDetail(ScheduleSummary):
    watchlist_id: int
    ticker: str | None = None  # populated by repo


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------

class RunCreate(BaseModel):
    ticker: str
    analysis_date: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )
    analysts: list[AnalystType] = Field(
        default_factory=lambda: list(AnalystType)
    )

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str) -> str:
        return validate_ticker(v)


class RunSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    ticker: str
    analysis_date: str
    analysts: list[str]
    status: str
    decision: str | None
    llm_provider: str | None
    deep_model: str | None
    quick_model: str | None
    tokens_in: int
    tokens_out: int
    llm_calls: int
    tool_calls: int
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime

    # Spec-required computed alias fields
    @computed_field  # type: ignore[prop-decorator]
    @property
    def run_id(self) -> str:
        return self.id

    @computed_field  # type: ignore[prop-decorator]
    @property
    def ws_url(self) -> str:
        return f"/ws/runs/{self.id}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def completed_at(self) -> datetime | None:
        return self.finished_at


class RunListResponse(BaseModel):
    items: list[RunSummary]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class SettingsPatch(BaseModel):
    """Single key-value pair update."""
    key: SettingsKey
    value: str = Field(..., min_length=0, max_length=500)


class SettingsResponse(BaseModel):
    """Safe settings response — never leaks encrypted values."""
    # Original internal field names (kept for backward compat)
    llm_provider: str | None = None
    deep_think_llm: str | None = None
    quick_think_llm: str | None = None
    backend_url: str | None = None
    output_language: str | None = None
    max_debate_rounds: str | None = None
    max_risk_discuss_rounds: str | None = None
    has_openai_key: bool = False
    has_anthropic_key: bool = False
    has_google_key: bool = False
    # Spec-required field names (additive aliases)
    deep_think_provider: str | None = None
    deep_think_model: str | None = None
    quick_think_provider: str | None = None
    quick_think_model: str | None = None
    ollama_base_url: str | None = None
    auto_save: bool = True
    codex_planner_enabled: bool = False
    has_alpha_vantage_key: bool = False


class LLMTestRequest(BaseModel):
    provider: str = Field(..., min_length=1, max_length=50)
    model: str = Field(..., min_length=1, max_length=100)
    base_url: str | None = None


class LLMTestResponse(BaseModel):
    ok: bool
    message: str
    latency_ms: float | None = None


class LLMOptionsResponse(BaseModel):
    providers: list[str]
    models: dict[str, dict[str, list[dict[str, str]]]]


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

class TopSignal(BaseModel):
    ticker: str
    decision: str
    confidence: float


class StatsOverview(BaseModel):
    # Original fields (kept for backward compat)
    total_runs: int
    runs_today: int
    runs_this_week: int
    success_rate: float  # 0.0 - 1.0
    decisions: dict[str, int]  # BUY/SELL/HOLD counts
    avg_tokens_per_run: float
    # Spec-required fields
    active_signals: int = 0
    buy_count: int = 0
    hold_count: int = 0
    sell_count: int = 0
    analyses_today: int = 0
    tokens_today: int = 0
    tokens_total: int = 0
    top_signal: TopSignal | None = None


class TokenStats(BaseModel):
    date: str
    tokens_in: int
    tokens_out: int
    runs: int


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    version: str
    uptime_seconds: float


# Rebuild forward refs
WatchlistItemWithSchedules.model_rebuild()
