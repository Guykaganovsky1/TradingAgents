"""Coding Planner — adversarial critique agent powered by the Codex CLI.

Sits at the very end of the LangGraph pipeline, AFTER the Portfolio Manager
delivers its final_trade_decision. Reads every section of the assembled
analysis (analyst reports, bull/bear debate, trader plan, risk debate, PM
verdict) and produces a code-reviewer-style critique that highlights:

  - Reasoning gaps and unstated assumptions
  - Where the bull and bear cases talked past each other
  - Quant claims that lack supporting data
  - Risk-management blind spots the team missed
  - The strongest counter-argument the PM did NOT address

Why a separate agent (not just another risk node)?
    The risk team debates BEFORE the PM commits. By the time the PM picks
    a side, the system has lost its adversarial signal. This agent runs
    AFTER the decision is locked in and provides a final "what could this
    be wrong about?" review that the user reads alongside the recommendation.

Why Codex CLI as the substrate?
    The user explicitly chose codex-cli over codex-api: it bills against
    their ChatGPT Plus subscription (free at the margin per run) rather
    than burning API credits every analysis. The wrapper runs the CLI as
    a one-shot subprocess so the LangGraph node stays simple.
"""
from __future__ import annotations

import logging

from tradingagents.llm_clients.codex_cli import CodexCliError, run_codex

logger = logging.getLogger(__name__)


# Hard cap so a misbehaving Codex invocation can't stall the whole pipeline.
# Empirically the planner completes in 60-180s on typical analyst output.
_DEFAULT_TIMEOUT_SECONDS = 600.0


def create_coding_planner():
    """Return a LangGraph node fn that runs the Codex critique step.

    No `llm` arg — this agent uses the Codex CLI directly, bypassing the
    standard ChatOpenAI/ChatAnthropic plumbing. This is intentional: the
    user's chosen Codex CLI uses ChatGPT subscription auth, not API auth,
    so it can't be wrapped in a LangChain client.
    """

    def coding_planner_node(state) -> dict:
        ticker = state.get("company_of_interest", "the asset")
        trade_date = state.get("trade_date", "the analysis date")

        # Pull every available section. Missing sections become "(not produced)"
        # so the prompt explicitly tells Codex what was/wasn't available rather
        # than silently hiding the gap.
        def _section(key: str, label: str) -> str:
            value = state.get(key) or ""
            return f"## {label}\n\n{value.strip() if value else '(not produced)'}"

        # Researcher debate is a nested dict; flatten its history for the prompt.
        debate = state.get("investment_debate_state") or {}
        debate_text = (debate.get("history") or "").strip() or "(no debate captured)"
        risk_debate = state.get("risk_debate_state") or {}
        risk_text = (risk_debate.get("history") or "").strip() or "(no risk debate captured)"

        prompt = f"""You are the Coding Planner — an adversarial reviewer of trading analyses.

Another team has just produced a full multi-agent analysis for **{ticker}**
on **{trade_date}**. Your job is NOT to write code or restate their work.
Your job is to read every section below and produce a sharp, structured
critique that surfaces the weaknesses they missed.

# What you are reviewing

{_section("market_report", "Market Analyst Report")}

---

{_section("news_report", "News Analyst Report")}

---

{_section("sentiment_report", "Social/Sentiment Analyst Report")}

---

{_section("fundamentals_report", "Fundamentals Analyst Report")}

---

## Bull-vs-Bear Debate (Researchers)

{debate_text}

---

{_section("investment_plan", "Research Manager Investment Plan")}

---

{_section("trader_investment_plan", "Trader Plan")}

---

## Risk Team Debate

{risk_text}

---

{_section("final_trade_decision", "Portfolio Manager — Final Decision")}

# Your critique — write in this exact structure

## ⚠️ Reasoning Gaps
The 2-3 most important unstated assumptions or logical jumps the team made.
Be specific — quote the exact phrasing where possible.

## 🎯 Bull–Bear Mismatch
Where the bull and bear cases failed to engage with each other directly.
Each side's strongest argument that the other side did not refute.

## 📊 Quant Claims Lacking Support
Numerical claims (e.g. "trading at 25x P/E", "drawdown 15%") that were
stated without sourcing or methodology. Flag exactly which claims.

## 🛡️ Risk Blind Spots
Risks the team did not consider: macro regime shifts, factor correlations,
liquidity, sector rotation, regulatory, earnings calendar, etc.

## 💥 Strongest Counter-Argument Against the Final Decision
If you had to bet against the Portfolio Manager's verdict, what would your
one-paragraph short-thesis (or long-thesis if they said Sell) be?

Keep the entire critique under 600 words. Be specific, cite the team's own
phrasing when calling out weaknesses. Do not be polite — your value is in
finding what they got wrong.
"""

        try:
            logger.info(
                "Coding Planner invoking codex CLI (prompt_chars=%d)", len(prompt)
            )
            critique = run_codex(prompt, timeout_seconds=_DEFAULT_TIMEOUT_SECONDS)
        except CodexCliError as exc:
            # Graceful degradation: if Codex is unavailable (no auth, no
            # binary, timeout), the pipeline must still complete. Surface
            # the error in the report rather than crashing the whole run.
            logger.warning("Coding Planner skipped: %s", exc)
            critique = (
                "_The Coding Planner step was skipped because the Codex CLI "
                f"was unavailable: {exc}_\n\nTo enable this section: ensure "
                "`codex` is on PATH and you've authenticated with "
                "`codex login` against a ChatGPT Plus/Pro account."
            )

        return {"coding_plan_report": critique}

    return coding_planner_node
