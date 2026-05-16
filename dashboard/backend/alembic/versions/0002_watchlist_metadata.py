"""Watchlist metadata: display_name, analysts, notes, added_at, last_run_id.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-16

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("watchlist") as batch_op:
        batch_op.add_column(
            sa.Column("display_name", sa.String(200), nullable=True)
        )
        batch_op.add_column(
            sa.Column("analysts", sa.JSON(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("notes", sa.Text(), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "added_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("last_run_id", sa.String(36), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("watchlist") as batch_op:
        batch_op.drop_column("last_run_id")
        batch_op.drop_column("added_at")
        batch_op.drop_column("notes")
        batch_op.drop_column("analysts")
        batch_op.drop_column("display_name")
