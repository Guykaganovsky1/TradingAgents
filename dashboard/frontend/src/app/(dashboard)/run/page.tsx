"use client";
import { useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { GlassCard } from "@/components/glass-card";
import { TickerInput } from "@/components/ticker-input";
import { AnalystToggleGroup } from "@/components/analyst-toggle-group";
import { ModelPicker } from "@/components/model-picker";
import { AgentPipeline } from "@/components/agent-pipeline";
import { StreamOutput } from "@/components/stream-output";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { DecisionCard } from "@/components/decision-card";
import { useRunStream } from "@/hooks/use-run-stream";
import { startRun } from "@/lib/api";
import { t } from "@/lib/i18n/en";
import { mutateHistory } from "@/hooks/use-history";
import { formatTokens } from "@/lib/format";
import { Play, Loader2 } from "lucide-react";
import type { AnalystKey } from "@/lib/types";

function RunPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Form state
  const [ticker, setTicker] = useState(searchParams.get("ticker") ?? "");
  const [tickerValid, setTickerValid] = useState(false);
  const [analysts, setAnalysts] = useState<AnalystKey[]>(["market", "news", "social"]);
  const [llmProvider, setLlmProvider] = useState("ollama");
  const [llmModel, setLlmModel] = useState("gemma4:latest");
  const [analysisDate, setAnalysisDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  // Run state
  const [runId, setRunId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  // WS stream
  const stream = useRunStream(runId);

  const handleValidated = useCallback(
    (valid: boolean) => {
      setTickerValid(valid);
    },
    []
  );

  async function handleStart() {
    if (!ticker || !tickerValid || isStarting) return;
    setIsStarting(true);

    try {
      const result = await startRun({
        ticker,
        analysts,
        llm_provider: llmProvider,
        llm_model: llmModel,
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

            {/* Model picker */}
            <ModelPicker
              provider={llmProvider}
              model={llmModel}
              onProviderChange={setLlmProvider}
              onModelChange={setLlmModel}
              disabled={hasStarted && !stream.isComplete}
            />

            {/* Start button */}
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
              {runId && (
                <ConnectionIndicator status={stream.status} />
              )}
            </div>
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
