"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { DecisionCard } from "@/components/decision-card";
import { ReportTabs } from "@/components/report-tabs";
import { ReportSummary } from "@/components/report-summary";
import { getRun } from "@/lib/api";
import { t } from "@/lib/i18n/en";
import { formatDateTime, formatTokens } from "@/lib/format";
import type { RunDetail, Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; run: RunDetail };

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setState({ status: "loading" });
    });
    getRun(runId).then(
      (run) => {
        if (!cancelled) setState({ status: "ok", run });
      },
      (e: Error) => {
        if (!cancelled) setState({ status: "error", message: e.message });
      }
    );
    return () => { cancelled = true; };
  }, [runId]);

  return (
    <div className="page-enter space-y-5">
      {/* Back */}
      <Link
        href="/history"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        {t.history.title}
      </Link>

      {state.status === "loading" && (
        <div className="flex items-center justify-center py-16 gap-2 text-xs text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          {t.loading}
        </div>
      )}

      {state.status === "error" && (
        <GlassCard variant="red">
          <p className="text-xs text-red-400">{state.message}</p>
        </GlassCard>
      )}

      {state.status === "ok" && <RunDetail run={state.run} />}
    </div>
  );
}

function RunDetail({ run }: { run: RunDetail }) {
  return (
    <>
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">
          {run.ticker} — Analysis
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {run.started_at ? formatDateTime(run.started_at) : "—"} · {run.deep_model ?? run.llm_provider ?? "—"}
        </p>
      </div>

      {/* Decision card */}
      {run.decision && (
        <DecisionCard
          decision={run.decision as Signal}
          confidence={0.75} // Backend doesn't store confidence per-run; shown as default
          ticker={run.ticker}
          date={run.analysis_date}
          llmModel={run.deep_model ?? "—"}
          llmProvider={run.llm_provider ?? "—"}
        />
      )}

      {/* Run in progress */}
      {run.status === "running" && (
        <GlassCard variant="accent">
          <div className="flex items-center gap-2 text-xs text-indigo-300">
            <Loader2 size={13} className="animate-spin" />
            This analysis is still running. Results will appear when complete.
          </div>
        </GlassCard>
      )}

      {/* Error */}
      {run.status === "error" && run.error_message && (
        <GlassCard variant="red">
          <p className="text-xs font-semibold text-red-400 mb-1">Analysis Error</p>
          <p className="text-xs text-red-300">{run.error_message}</p>
        </GlassCard>
      )}

      {/* Token usage */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Tokens In", value: formatTokens(run.tokens_in) },
          { label: "Tokens Out", value: formatTokens(run.tokens_out) },
          { label: "Total Tokens", value: formatTokens(run.tokens_in + run.tokens_out) },
          {
            label: "Analysts",
            value: run.analysts
              .map((a) => a.charAt(0).toUpperCase() + a.slice(1))
              .join(", "),
          },
        ].map(({ label, value }) => (
          <GlassCard key={label}>
            <p className="text-[10px] uppercase tracking-[1px] text-white/25 mb-1">
              {label}
            </p>
            <p className="text-sm font-bold text-slate-200 tabular-nums">{value}</p>
          </GlassCard>
        ))}
      </div>

      {/* Full briefing — every analyst's report rendered inline as one
          easy-to-scan document. The Final Decision pins at top so the
          conclusion comes first. Each section is a markdown-rendered card.
          Backed by the same /api/runs/{id}/report/{section} endpoints
          the tabs use, but fetched in parallel and shown all at once. */}
      {run.status === "complete" && (
        <RunReportsView runId={run.run_id} />
      )}
    </>
  );
}

/**
 * Toggle between the new "Summary" (all sections inline) and the legacy
 * tabbed view. Summary is the default — that's what the user asked for.
 */
function RunReportsView({ runId }: { runId: string }) {
  const [view, setView] = useState<"summary" | "tabs">("summary");

  const tabClass = (active: boolean) =>
    cn(
      "rounded-md border px-3 py-1 text-[11px] font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
      active
        ? "border-indigo-400/30 bg-indigo-500/[0.12] text-indigo-200"
        : "border-transparent text-slate-500 hover:text-slate-300"
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[1px] text-white/30">
          Analyst Briefing
        </p>
        <div className="flex gap-1" role="tablist" aria-label="View mode">
          <button
            type="button"
            role="tab"
            aria-selected={view === "summary"}
            onClick={() => setView("summary")}
            className={tabClass(view === "summary")}
          >
            Summary
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "tabs"}
            onClick={() => setView("tabs")}
            className={tabClass(view === "tabs")}
          >
            Tabs
          </button>
        </div>
      </div>

      {view === "summary" ? (
        <ReportSummary runId={runId} />
      ) : (
        <GlassCard>
          <ReportTabs runId={runId} />
        </GlassCard>
      )}
    </div>
  );
}
