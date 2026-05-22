/**
 * RunProgress — inline progress bar + finish-state caption.
 *
 * Shared between the Run page (above the AgentPipeline list) and the
 * History detail page (inside the "still running" card).
 *
 * Counts agents in {done, error} status against the total to derive a
 * 0-100% bar. Caption adapts conclusion-first:
 *   - running             → '3 of 7 agents complete · Trader running' (indigo)
 *   - complete            → '✓ Analysis complete (BUY) — opening report…' (emerald)
 *   - error               → 'Analysis failed — see details below'      (red)
 *   - no agents seen yet  → indeterminate animated stripe + connecting hint
 *
 * aria-live=polite so screen readers announce updates without spamming.
 */

import { useEffect, useState } from "react";

import type { WsStatus } from "@/lib/ws";

/**
 * Intra-agent progress is asymptotic: each agent owns 1/N of the bar, and
 * while it's running we fill that slice via `1 - e^(-t/τ)`. τ=90s is tuned
 * to the qwen2.5:3b reality where most agents finish in 30–120s — at 90s
 * we'd be at ~63% of the slice, telegraphing "alive, making progress".
 * Capped at 95% of the slice so we NEVER claim completion that hasn't
 * actually happened; the jump from 95 → 100% of the slice happens when
 * the `agent_completed` event arrives and `finished` increments.
 */
const AGENT_HALF_LIFE_MS = 90_000;
const INTRA_AGENT_CAP = 0.95;

interface RunProgressProps {
  agents: {
    name: string;
    status: "pending" | "running" | "done" | "error";
    started_at?: string;
  }[];
  isComplete: boolean;
  wsStatus: WsStatus;
  decision: string | null;
  hasError: boolean;
  /** Optional class on the outer container for spacing tweaks per call site. */
  className?: string;
}

export function RunProgress({
  agents,
  isComplete,
  wsStatus,
  decision,
  hasError,
  className,
}: RunProgressProps) {
  const total = agents.length;
  const finished = agents.filter(
    (a) => a.status === "done" || a.status === "error",
  ).length;
  const running = agents.find((a) => a.status === "running");

  // While no agents reported yet, animate a slow stripe rather than render a
  // static 0% bar — telegraphs "the system is working, just hasn't fanned out".
  const indeterminate = total === 0 && !isComplete && !hasError;

  // Tick state — re-renders every 500ms only while there's a running agent.
  // We need this so the asymptotic intra-step fill actually animates between
  // `agent_started` and `agent_completed` events (which can be 60-180s apart
  // when an analyst is making multiple LLM calls).
  const [now, setNow] = useState(() => Date.now());
  const runningStartedAt = running?.started_at;
  useEffect(() => {
    if (!runningStartedAt || isComplete || hasError) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
    // Re-bind when the running agent changes so the curve restarts from t=0
    // for the new agent, not from when the previous one started.
  }, [runningStartedAt, isComplete, hasError]);

  // Asymptotic intra-step progress for the currently-running agent.
  // Falls back to 0 if no agent is running or started_at is missing.
  let intraFraction = 0;
  if (running && runningStartedAt) {
    const startMs = new Date(runningStartedAt).getTime();
    if (Number.isFinite(startMs)) {
      const elapsed = Math.max(0, now - startMs);
      intraFraction = Math.min(
        INTRA_AGENT_CAP,
        1 - Math.exp(-elapsed / AGENT_HALF_LIFE_MS),
      );
    }
  }

  // When complete we show 100 regardless of agent tracking, since some runs
  // short-circuit and never enter the per-agent loop. Otherwise blend the
  // discrete `finished` count with the asymptotic `intraFraction` so the bar
  // visibly creeps forward between agent boundaries.
  const pct = isComplete
    ? 100
    : total > 0
      ? Math.round(((finished + intraFraction) / total) * 100)
      : 0;

  let barClass = "bg-indigo-500";
  let captionClass = "text-slate-400";
  let caption: string;
  if (hasError) {
    barClass = "bg-red-500";
    captionClass = "text-red-400";
    caption = "Analysis failed — see details below";
  } else if (isComplete) {
    barClass = "bg-emerald-500";
    captionClass = "text-emerald-300";
    caption = decision
      ? `✓ Analysis complete (${decision.toUpperCase()}) — opening report…`
      : "✓ Analysis complete — opening report…";
  } else if (indeterminate) {
    caption =
      wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "Connecting to the run…"
        : "Waiting for the first agent to finish…";
  } else if (running) {
    // Name the current agent first — that's the bit the user actually
    // wants to know ('which one of you is working right now?'). Then
    // the count for context. Bullet → arrow makes the agent name read
    // as the "primary" while the progress is metadata.
    caption = `▶ ${running.name} is working… (${finished}/${total} agents complete)`;
  } else if (finished === total && total > 0) {
    caption = "Finalising decision — Portfolio Manager is synthesising…";
  } else {
    caption = `${finished} of ${total} agents complete · waiting for next agent to start…`;
  }

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="h-1.5 w-full rounded-full overflow-hidden bg-white/[0.06]">
        {indeterminate ? (
          <div
            className="h-full w-1/3 rounded-full bg-indigo-500/60 animate-pulse"
            aria-label="Connecting…"
          />
        ) : (
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out ${barClass}`}
            style={{ width: `${pct}%` }}
            aria-label={`Progress ${pct}%`}
          />
        )}
      </div>
      <p className={`mt-1.5 text-[11px] ${captionClass}`}>{caption}</p>
    </div>
  );
}
