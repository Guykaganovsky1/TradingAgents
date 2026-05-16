"""Initial schema: watchlist, schedules, run_index, app_settings.

Revision ID: 0001
Revises:
Create Date: 2026-05-16

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "watchlist",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("ticker", sa.String(10), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticker"),
    )
    op.create_index("ix_watchlist_ticker", "watchlist", ["ticker"])

    op.create_table(
        "schedules",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("watchlist_id", sa.Integer(), nullable=False),
        sa.Column("cron_expr", sa.String(100), nullable=False),
        sa.Column("analysts", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, default=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["watchlist_id"], ["watchlist.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_schedules_watchlist_id", "schedules", ["watchlist_id"])

    op.create_table(
        "run_index",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("ticker", sa.String(10), nullable=False),
        sa.Column("analysis_date", sa.String(10), nullable=False),
        sa.Column("analysts", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, default="queued"),
        sa.Column("decision", sa.String(10), nullable=True),
        sa.Column("llm_provider", sa.String(50), nullable=True),
        sa.Column("deep_model", sa.String(100), nullable=True),
        sa.Column("quick_model", sa.String(100), nullable=True),
        sa.Column("tokens_in", sa.Integer(), nullable=False, default=0),
        sa.Column("tokens_out", sa.Integer(), nullable=False, default=0),
        sa.Column("llm_calls", sa.Integer(), nullable=False, default=0),
        sa.Column("tool_calls", sa.Integer(), nullable=False, default=0),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_run_index_ticker", "run_index", ["ticker"])

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value_encrypted", sa.Text(), nullable=True),
        sa.Column("value_plain", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_table("run_index")
    op.drop_table("schedules")
    op.drop_table("watchlist")
