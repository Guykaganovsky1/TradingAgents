"""Read markdown report sections from results/ directory with path-traversal guard."""
from __future__ import annotations

import logging
import re
from pathlib import Path

from core.config import get_settings

logger = logging.getLogger("dashboard.services.report_reader")

# Valid run_id must be a UUID
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

# Sections correspond to keys in the JSON state log
VALID_SECTIONS = {
    "market_report",
    "fundamentals_report",
    "sentiment_report",
    "news_report",
    "investment_debate_state",
    "risk_debate_state",
    "trader_investment_decision",
    "final_trade_decision",
    # Coding Planner critique — only present when codex_planner_enabled
    # was set in settings for the run. Missing key returns None upstream.
    "coding_plan_report",
}


def _safe_results_dir() -> Path:
    return get_settings().results_dir.resolve()


def read_report_section(run_id: str, ticker: str, section: str) -> str | None:
    """
    Read a section from the run's JSON state log.

    Returns the section content as a string, or None if not found.
    Raises ValueError on invalid run_id (path traversal attempt).
    """
    # 1) Validate run_id is a UUID
    if not _UUID_RE.match(run_id):
        raise ValueError(f"Invalid run_id format: {run_id!r}")

    # 2) Validate section name
    if section not in VALID_SECTIONS:
        raise ValueError(f"Invalid section: {section!r}")

    # 3) Sanitize ticker — no slashes or dots at start
    safe_ticker = re.sub(r"[^\w.\-]", "_", ticker).lstrip("./\\")
    if not safe_ticker:
        raise ValueError(f"Invalid ticker: {ticker!r}")

    # 4) Build path and verify it stays under results_dir
    results_dir = _safe_results_dir()
    candidate_dir = (
        results_dir / safe_ticker / "TradingAgentsStrategy_logs"
    ).resolve()

    # Must be under results_dir
    try:
        candidate_dir.relative_to(results_dir)
    except ValueError as exc:
        logger.warning(
            "Path traversal attempt: results_dir=%s, candidate=%s",
            results_dir, candidate_dir,
        )
        raise ValueError("Path traversal detected") from exc

    # 5) Find the JSON state log (named by date, not run_id)
    # The run_id in our DB is an internal UUID; the file is full_states_log_<date>.json
    # We search all JSON files in the directory for this ticker
    if not candidate_dir.is_dir():
        return None

    import json  # noqa: PLC0415

    # Find most recent log file if multiple exist
    log_files = sorted(candidate_dir.glob("full_states_log_*.json"), reverse=True)
    if not log_files:
        return None

    # Try to find the one matching our run's date (stored in run DB)
    # For now, return from most recent file (caller can filter by date)
    for log_file in log_files:
        try:
            with log_file.open(encoding="utf-8") as f:
                data = json.load(f)
            value = data.get(section)
            if value is None:
                continue
            if isinstance(value, dict):
                return json.dumps(value, indent=2)
            return str(value)
        except Exception as exc:
            logger.warning("Failed to read log file %s: %s", log_file, exc)
            continue

    return None


def read_report_section_by_date(
    ticker: str, analysis_date: str, section: str
) -> str | None:
    """Read a section from the run's JSON state log for a specific date."""
    if section not in VALID_SECTIONS:
        raise ValueError(f"Invalid section: {section!r}")

    safe_ticker = re.sub(r"[^\w.\-]", "_", ticker).lstrip("./\\")
    if not safe_ticker:
        raise ValueError(f"Invalid ticker: {ticker!r}")

    results_dir = _safe_results_dir()
    candidate_dir = (results_dir / safe_ticker / "TradingAgentsStrategy_logs").resolve()

    try:
        candidate_dir.relative_to(results_dir)
    except ValueError as exc:
        raise ValueError("Path traversal detected") from exc

    log_file = candidate_dir / f"full_states_log_{analysis_date}.json"
    if not log_file.exists():
        return None

    import json  # noqa: PLC0415

    try:
        with log_file.open(encoding="utf-8") as f:
            data = json.load(f)
        value = data.get(section)
        if value is None:
            return None
        if isinstance(value, dict):
            return json.dumps(value, indent=2)
        return str(value)
    except Exception as exc:
        logger.warning("Failed to read log file %s: %s", log_file, exc)
        return None
