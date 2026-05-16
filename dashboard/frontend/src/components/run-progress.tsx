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

import type { WsStatus } from "@/lib/ws";

interface RunProgressProps {
  agents: { name: string; status: "pending" | "running" | "done" | "error" }[];
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

  // When complete we show 100 regardless of agent tracking, since some runs
  // short-circuit and never enter the per-agent loop.
  const pct = isComplete
    ? 100
    : total > 0
      ? Math.round((finished / total) * 100)
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
        : "Waiting for the first agent to start…";
  } else if (running) {
    caption = `${finished} of ${total} agents complete · ${running.name} running`;
  } else if (finished === total && total > 0) {
    caption = "Finalising decision…";
  } else {
    caption = `${finished} of ${total} agents complete`;
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
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${barClass}`}
            style={{ width: `${pct}%` }}
            aria-label={`Progress ${pct}%`}
          />
        )}
      </div>
      <p className={`mt-1.5 text-[11px] ${captionClass}`}>{caption}</p>
    </div>
  );
}
