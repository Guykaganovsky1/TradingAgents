"""SQLAlchemy 2.x ORM models."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _uuid() -> str:
    return str(uuid.uuid4())


class Watchlist(Base):
    __tablename__ = "watchlist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(10), unique=True, nullable=False, index=True)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    analysts: Mapped[list | None] = mapped_column(JSON, nullable=True)  # stored as JSON array
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    schedules: Mapped[list[Schedule]] = relationship(
        "Schedule", back_populates="watchlist_item", cascade="all, delete-orphan"
    )


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    watchlist_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("watchlist.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cron_expr: Mapped[str] = mapped_column(String(100), nullable=False)
    analysts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    watchlist_item: Mapped[Watchlist] = relationship("Watchlist", back_populates="schedules")


class RunIndex(Base):
    __tablename__ = "run_index"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    ticker: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    analysis_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    analysts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="queued"
    )  # queued | running | done | error
    decision: Mapped[str | None] = mapped_column(String(10), nullable=True)  # BUY | SELL | HOLD
    llm_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    deep_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    quick_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tokens_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    llm_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tool_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AppSettings(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)  # Fernet ciphertext
    value_plain: Mapped[str | None] = mapped_column(Text, nullable=True)      # for non-sensitive
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Scan(Base):
    __tablename__ = "scans"

    scan_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    universes: Mapped[str] = mapped_column(Text, nullable=False)         # JSON list
    top_n: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="queued"
    )  # queued | running | complete | error
    progress_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    factor_progress: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON dict
    results: Mapped[str | None] = mapped_column(Text, nullable=True)          # JSON list
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    universe_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
