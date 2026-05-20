"use client";
import { useState, useCallback, Suspense, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { GlassCard } from "@/components/glass-card";
import { TickerInput } from "@/components/ticker-input";
import { AnalystToggleGroup } from "@/components/analyst-toggle-group";
import { AgentPipeline } from "@/components/agent-pipeline";
import { RunProgress } from "@/components/run-progress";
import { StreamOutput } from "@/components/stream-output";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { DecisionCard } from "@/components/decision-card";
import { useRunStream } from "@/hooks/use-run-stream";
import { useSettings } from "@/hooks/use-settings";
import { startRun, cancelRun } from "@/lib/api";
import { t } from "@/lib/i18n/en";
import { mutateHistory } from "@/hooks/use-history";
import { formatTokens } from "@/lib/format";
import { Play, Loader2, FileText, ArrowRight, Settings as SettingsIcon, Square } from "lucide-react";
import Link from "next/link";
import type { AnalystKey } from "@/lib/types";

function RunPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Form state
  const [ticker, setTicker] = useState(searchParams.get("ticker") ?? "");
  const [tickerValid, setTickerValid] = useState(false);
  const [analysts, setAnalysts] = useState<AnalystKey[]>(["market", "news", "social"]);
  const [analysisDate, setAnalysisDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  // Provider/model are always read from saved Settings — the Run page no longer
  // exposes a per-run override (user explicitly asked to lock this so the LLM
  // they configured globally is always the LLM that gets used).
  const { settings } = useSettings();
  const llmProvider = settings?.llm_provider ?? "ollama";
  const llmModel = settings?.deep_think_llm ?? "qwen2.5:3b";

  // Run state
  const [runId, setRunId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // WS stream
  const stream = useRunStream(runId);

  // Ask for browser-notification permission once, the first time the user
  // navigates here. Browsers require a user gesture so we don't auto-ask on
  // mount — we ask on the first Start Analysis click instead (see handleStart).
  // Track whether we've already fired the completion notification so a hot
  // reload / re-render of stream.isComplete doesn't double-fire.
  const completionHandled = useRef<string | null>(null);

  // Auto-navigate to the report page once the run completes. Wait a beat
  // so the user sees the green "Complete" state on the pipeline before the
  // route changes — feels more like the analysis "finished and is now
  // showing you the report" rather than an abrupt jump.
  useEffect(() => {
    if (!runId || !stream.isComplete) return;
    if (completionHandled.current === runId) return;
    completionHandled.current = runId;

    // Fire OS notification (already-granted permissions only; the prompt
    // happens on Start click, not here, to keep behavior predictable).
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        try {
          const n = new Notification("TradingAgents — analysis complete", {
            body: `${ticker || "Run"}: ${stream.decision ?? "see report"}`,
            tag: `run-${runId}`,
            icon: "/apple-touch-icon.png",
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch {
          // Silently ignore — notification failures shouldn't break the flow.
        }
      }
    }

    // Toast as a fallback / extra confirmation when the tab is focused.
    toast.success(`${ticker}: analysis complete — opening report…`);

    // Brief delay so the pipeline's "complete" state is visible before nav.
    const timer = window.setTimeout(() => {
      mutateHistory();
      router.push(`/history/${runId}`);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [runId, stream.isComplete, stream.decision, ticker, router]);

  const handleValidated = useCallback(
    (valid: boolean) => {
      setTickerValid(valid);
    },
    []
  );

  async function handleStart() {
    if (!ticker || !tickerValid || isStarting) return;
    setIsStarting(true);

    // Request notification permission lazily on the first Start click —
    // browsers require a user gesture, and we want the permission to be
    // available by the time the run completes (minutes from now).
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      try {
        await Notification.requestPermission();
      } catch {
        /* user dismissed — non-fatal */
      }
    }

    try {
      // No llm_provider/llm_model in the request: the backend resolves these
      // from the saved Settings via _build_run_config. This keeps the
      // "always use the configured LLM" guarantee — there's no way for the
      // Run page to drift from what's in Settings.
      const result = await startRun({
        ticker,
        analysts,
        analysis_date: analysisDate,
      });
      setRunId(result.run_id);
      setHasStarted(true);
      toast.success(t.run.runStarted, {
        action: {
          label: t.run.viewRun,
          onClick: () => router.push(`/history/${result.run_id}`),
        },
      });
      // Invalidate history cache
      mutateHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.unknownError);
    } finally {
      setIsStarting(false);
    }
  }

  const canStart =
    ticker.length >= 1 &&
    tickerValid &&
    analysts.length > 0 &&
    !isStarting &&
    (!hasStarted || stream.isComplete);

  // A run is "in flight" once we have an id and the stream hasn't reported
  // completion or an error. That's when Stop is meaningful — finished runs
  // can be deleted from the History page instead.
  const isInFlight =
    Boolean(runId) && hasStarted && !stream.isComplete && !stream.errorMessage;

  async function handleStop() {
    if (!runId || isStopping) return;
    setIsStopping(true);
    try {
      const result = await cancelRun(runId);
      if (result.cancelled) {
        toast.success("Analysis stopped");
      } else {
        toast.info("Run already finished — nothing to stop");
      }
      // Don't reset runId — let the WebSocket stream report the cancelled
      // state and let the user navigate to /history if they want to see
      // what the agents managed to produce before the cancel signal.
      mutateHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop run");
    } finally {
      setIsStopping(false);
    }
  }

  return (
    <div className="page-enter space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">{t.run.title}</h1>
        <p className="mt-1 text-xs text-slate-500">{t.run.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Configuration panel */}
        <GlassCard>
          <p className="text-[10px] uppercase tracking-[1px] text-white/30 mb-4">
            {t.run.configuration}
          </p>

          <div className="space-y-4">
            {/* Ticker + Date row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="ticker-input"
                  className="block mb-1.5 text-[10px] uppercase tracking-[1px] text-white/35"
                >
                  {t.run.tickerSymbol}
                </label>
                <TickerInput
                  id="ticker-input"
                  value={ticker}
                  onChange={setTicker}
                  onValidated={handleValidated}
                  disabled={hasStarted && !stream.isComplete}
                />
              </div>
              <div>
                <label
                  htmlFor="analysis-date"
                  className="block mb-1.5 text-[10px] uppercase tracking-[1px] text-white/35"
                >
                  {t.run.analysisDate}
                </label>
                <input
                  id="analysis-date"
                  type="date"
                  value={analysisDate}
                  onChange={(e) => setAnalysisDate(e.target.value)}
                  disabled={hasStarted && !stream.isComplete}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-base md:text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Analyst toggles */}
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[1px] text-white/35">
                {t.run.analystsToInclude}
              </p>
              <AnalystToggleGroup
                value={analysts}
                onChange={setAnalysts}
                disabled={hasStarted && !stream.isComplete}
              />
            </div>

            {/* LLM is always read from Settings (user-requested lock).
                Show what will be used + a link to change it globally. */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[1px] text-white/35 mb-0.5">
                  Using LLM (from Settings)
                </p>
                <p className="text-xs text-slate-200 truncate">
                  <span className="font-semibold">{llmProvider}</span>
                  <span className="text-slate-500"> · </span>
                  <span className="font-mono text-[11px] text-slate-300">{llmModel || "(default)"}</span>
                </p>
              </div>
              <Link
                href="/settings"
                className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded px-1.5 py-0.5"
                aria-label="Change LLM provider in Settings"
              >
                <SettingsIcon size={11} aria-hidden="true" />
                Change
              </Link>
            </div>

            {/* Three-state button:
                 • running       → red 'Stop Analysis'
                 • just finished → green 'View Results →' (auto-redirect runs
                                   in parallel; this is the explicit CTA)
                 • idle          → indigo 'Start Analysis'
                We never show two at once so the primary action is always
                unambiguous. Order: in-flight check first, then completion,
                then default. */}
            {isInFlight ? (
              <button
                type="button"
                onClick={handleStop}
                disabled={isStopping}
                className="w-full flex items-center justify-center gap-2 rounded-[10px] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 border border-red-400/30 bg-red-500/[0.12] text-red-200 hover:bg-red-500/[0.20]"
                aria-label="Stop the running analysis"
              >
                {isStopping ? (
                  <><Loader2 size={16} className="animate-spin" /> Stopping…</>
                ) : (
                  <><Square size={14} fill="currentColor" /> Stop Analysis</>
                )}
              </button>
            ) : runId && stream.isComplete && !stream.errorMessage ? (
              <button
                type="button"
                onClick={() => router.push(`/history/${runId}`)}
                className="w-full flex items-center justify-center gap-2 rounded-[10px] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{
                  background:
                    "linear-gradient(135deg, #10b981, #059669)",
                }}
                aria-label="View the full analyst briefing for this completed run"
              >
                <FileText size={16} aria-hidden="true" />
                ✓ Analysis Finished — View Results
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                disabled={!canStart}
                className="w-full flex items-center justify-center gap-2 rounded-[10px] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                {isStarting ? (
                  <><Loader2 size={16} className="animate-spin" /> Starting…</>
                ) : (
                  <><Play size={16} /> {t.run.startAnalysis}</>
                )}
              </button>
            )}

            {/* Run result — decision card */}
            {stream.isComplete && stream.decision && (
              <DecisionCard
                decision={stream.decision}
                confidence={stream.confidence ?? 0}
                ticker={ticker}
                date={analysisDate}
                llmModel={llmModel}
                llmProvider={llmProvider}
              />
            )}

            {/* Token summary */}
            {(stream.tokensIn > 0 || stream.tokensOut > 0) && (
              <p className="text-[11px] text-slate-500 text-right tabular-nums">
                Tokens: {formatTokens(stream.tokensIn)} in /{" "}
                {formatTokens(stream.tokensOut)} out
              </p>
            )}
          </div>
        </GlassCard>

        {/* Right: pipeline + stream */}
        <div className="flex flex-col gap-4">
          {/* Agent pipeline */}
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-[1px] text-white/30">
                {t.run.agentPipeline}
              </p>
              {runId && <ConnectionIndicator status={stream.status} />}
            </div>

            {/* Progress bar — only meaningful once a run is in flight.
                Counts agents in {done, error} as "finished" against the total.
                Shows a finish-state message when complete (matches the 1.5s
                pause the auto-nav effect uses before pushing to the report). */}
            {runId && <RunProgress
              agents={stream.agents}
              isComplete={stream.isComplete}
              wsStatus={stream.status}
              decision={stream.decision}
              hasError={Boolean(stream.errorMessage)}
              className="mb-3"
            />}

            <AgentPipeline agents={stream.agents} />
          </GlassCard>

          {/* Stream output */}
          <GlassCard className="flex-1">
            <p className="text-[10px] uppercase tracking-[1px] text-white/30 mb-2">
              {t.run.liveOutput}
            </p>
            <StreamOutput events={stream.log} />
            {stream.errorMessage && (
              <p className="mt-2 text-xs text-red-400">
                Error: {stream.errorMessage}
              </p>
            )}
          </GlassCard>

          {/* Completion CTA — appears once the run finishes */}
          {runId && stream.isComplete && (
            <Link
              href={`/history/${runId}`}
              className="group flex items-center justify-between gap-3 rounded-[14px] border border-emerald-400/30 bg-emerald-500/[0.06] px-5 py-4 transition-all hover:bg-emerald-500/[0.10] hover:border-emerald-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              aria-label="View full report for completed analysis"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={18} className="text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-300">
                    Analysis complete
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {stream.decision ?? "Decision"} ·{" "}
                    {formatTokens(stream.tokensIn + stream.tokensOut)} tokens · Read all analyst reports
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/[0.15] px-3 py-2 text-xs font-semibold text-emerald-300 group-hover:bg-emerald-500/[0.25] transition-colors">
                View Full Report
                <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RunPage() {
  return (
    <Suspense fallback={<div className="text-xs text-slate-500 py-8 text-center">{t.loading}</div>}>
      <RunPageInner />
    </Suspense>
  );
}

// Inline RunProgress moved to @/components/run-progress — also reused by the
// History detail page so an in-flight run shows live progress when revisited.
