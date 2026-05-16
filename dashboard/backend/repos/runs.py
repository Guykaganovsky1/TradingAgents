"""Run index repository."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.orm import RunIndex


async def create_run(
    session: AsyncSession,
    ticker: str,
    analysis_date: str,
    analysts: list[str],
    llm_provider: str | None = None,
    deep_model: str | None = None,
    quick_model: str | None = None,
) -> RunIndex:
    run = RunIndex(
        id=str(uuid.uuid4()),
        ticker=ticker,
        analysis_date=analysis_date,
        analysts=analysts,
        status="queued",
        llm_provider=llm_provider,
        deep_model=deep_model,
        quick_model=quick_model,
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


async def get_run(session: AsyncSession, run_id: str) -> RunIndex | None:
    result = await session.execute(select(RunIndex).where(RunIndex.id == run_id))
    return result.scalar_one_or_none()


async def list_runs(
    session: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    ticker: str | None = None,
    status: str | None = None,
) -> tuple[list[RunIndex], int]:
    query = select(RunIndex)
    count_query = select(func.count()).select_from(RunIndex)

    if ticker:
        query = query.where(RunIndex.ticker == ticker)
        count_query = count_query.where(RunIndex.ticker == ticker)
    if status:
        query = query.where(RunIndex.status == status)
        count_query = count_query.where(RunIndex.status == status)

    total_result = await session.execute(count_query)
    total = total_result.scalar_one()

    query = query.order_by(RunIndex.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(query)
    return list(result.scalars().all()), total


async def update_run_status(
    session: AsyncSession,
    run_id: str,
    status: str,
    **kwargs,
) -> RunIndex | None:
    run = await get_run(session, run_id)
    if run is None:
        return None
    run.status = status
    if status == "running" and run.started_at is None:
        run.started_at = datetime.now(tz=UTC)
    if status in ("done", "error"):
        run.finished_at = datetime.now(tz=UTC)
    for k, v in kwargs.items():
        setattr(run, k, v)
    await session.commit()
    await session.refresh(run)
    return run


async def get_stats_overview(session: AsyncSession) -> dict:
    from datetime import timedelta


    now = datetime.now(tz=UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())

    total = (await session.execute(select(func.count()).select_from(RunIndex))).scalar_one()
    today = (
        await session.execute(
            select(func.count())
            .select_from(RunIndex)
            .where(RunIndex.created_at >= today_start)
        )
    ).scalar_one()
    week = (
        await session.execute(
            select(func.count())
            .select_from(RunIndex)
            .where(RunIndex.created_at >= week_start)
        )
    ).scalar_one()

    done_count = (
        await session.execute(
            select(func.count()).select_from(RunIndex).where(RunIndex.status == "done")
        )
    ).scalar_one()
    success_rate = done_count / total if total > 0 else 0.0

    # Decision counts. TradingAgents stores decisions as title-case strings
    # ("Buy" / "Sell" / "Hold") from the SignalProcessor. We compare on the
    # uppercased value so any future variation (e.g. "BUY", "buy") still
    # aggregates correctly and the Top Signal card stops showing 0/0/0.
    decisions: dict[str, int] = {}
    buy_count = 0
    sell_count = 0
    hold_count = 0
    for decision in ("BUY", "SELL", "HOLD"):
        cnt = (
            await session.execute(
                select(func.count())
                .select_from(RunIndex)
                .where(func.upper(RunIndex.decision) == decision)
            )
        ).scalar_one()
        decisions[decision] = cnt
        if decision == "BUY":
            buy_count = cnt
        elif decision == "SELL":
            sell_count = cnt
        elif decision == "HOLD":
            hold_count = cnt

    # Avg tokens
    avg_tokens = (
        await session.execute(
            select(func.avg(RunIndex.tokens_in + RunIndex.tokens_out)).select_from(RunIndex)
        )
    ).scalar_one()

    # Tokens today
    tokens_today_row = (
        await session.execute(
            select(
                func.sum(RunIndex.tokens_in + RunIndex.tokens_out)
            )
            .select_from(RunIndex)
            .where(RunIndex.created_at >= today_start)
        )
    ).scalar_one()
    tokens_today = int(tokens_today_row or 0)

    # Tokens total
    tokens_total_row = (
        await session.execute(
            select(func.sum(RunIndex.tokens_in + RunIndex.tokens_out)).select_from(RunIndex)
        )
    ).scalar_one()
    tokens_total = int(tokens_total_row or 0)

    # Active signals: watchlist tickers with a completed run (BUY/SELL/HOLD decision)
    active_signals_row = (
        await session.execute(
            select(func.count(func.distinct(RunIndex.ticker)))
            .select_from(RunIndex)
            .where(RunIndex.decision.isnot(None))
            .where(RunIndex.status == "done")
        )
    ).scalar_one()
    active_signals = int(active_signals_row or 0)

    # Top signal: most recent done run with a decision
    top_signal_row = (
        await session.execute(
            select(RunIndex)
            .where(RunIndex.status == "done")
            .where(RunIndex.decision.isnot(None))
            .order_by(RunIndex.finished_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    top_signal = None
    if top_signal_row is not None:
        # Upper-case the decision for the frontend's SignalBadge, which
        # discriminates on "BUY"/"SELL"/"HOLD" and would render a neutral
        # placeholder for the raw "Hold" / "Buy" stored by the agents.
        raw_decision = top_signal_row.decision or ""
        top_signal = {
            "ticker": top_signal_row.ticker,
            "decision": raw_decision.upper(),
            "confidence": 0.0,  # confidence not yet stored in run_index
        }

    return {
        "total_runs": total,
        "runs_today": today,
        "runs_this_week": week,
        "success_rate": success_rate,
        "decisions": decisions,
        "avg_tokens_per_run": float(avg_tokens or 0.0),
        # Spec-required fields
        "active_signals": active_signals,
        "buy_count": buy_count,
        "hold_count": hold_count,
        "sell_count": sell_count,
        "analyses_today": today,
        "tokens_today": tokens_today,
        "tokens_total": tokens_total,
        "top_signal": top_signal,
    }


async def get_token_stats(session: AsyncSession, days: int = 30) -> list[dict]:
    from datetime import timedelta

    now = datetime.now(tz=UTC)
    since = now - timedelta(days=days)

    result = await session.execute(
        select(
            func.date(RunIndex.created_at).label("date"),
            func.sum(RunIndex.tokens_in).label("tokens_in"),
            func.sum(RunIndex.tokens_out).label("tokens_out"),
            func.count().label("runs"),
        )
        .where(RunIndex.created_at >= since)
        .group_by(func.date(RunIndex.created_at))
        .order_by(func.date(RunIndex.created_at))
    )
    return [
        {
            "date": str(row.date),
            "tokens_in": int(row.tokens_in or 0),
            "tokens_out": int(row.tokens_out or 0),
            "runs": int(row.runs),
        }
        for row in result.all()
    ]
