"""Market scanner: create scans table.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-16

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "scans",
        sa.Column("scan_id", sa.String(36), nullable=False),
        sa.Column("universes", sa.Text(), nullable=False),
        sa.Column("top_n", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("progress_pct", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("factor_progress", sa.Text(), nullable=True),
        sa.Column("results", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("universe_size", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("scan_id"),
    )
    op.create_index("idx_scans_started_at", "scans", ["started_at"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_scans_started_at", table_name="scans")
    op.drop_table("scans")
