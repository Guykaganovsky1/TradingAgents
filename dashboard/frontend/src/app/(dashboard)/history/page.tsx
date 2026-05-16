"use client";
import { useState } from "react";
import Link from "next/link";
import { History, ChevronRight, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/glass-card";
import { SignalBadge } from "@/components/signal-badge";
import { EmptyState } from "@/components/empty-state";
import { useHistory, mutateHistory } from "@/hooks/use-history";
import { deleteRun } from "@/lib/api";
import { t } from "@/lib/i18n/en";
import { formatDate, formatTokens } from "@/lib/format";
import type { RunIndex, Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function HistoryPage() {
  const [page, setPage] = useState(0);
  const { runs, total, isLoading, error } = useHistory(undefined, page);
  const PAGE_SIZE = 20;

  return (
    <div className="page-enter space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">{t.history.title}</h1>
        <p className="mt-1 text-xs text-slate-500">{t.history.subtitle}</p>
      </div>

      {error && (
        <div className="rounded-[10px] border border-red-400/20 bg-red-500/[0.05] px-4 py-3 text-xs text-red-400">
          {t.backendError}
        </div>
      )}

      {/* Count */}
      {!isLoading && total > 0 && (
        <p className="text-[11px] uppercase tracking-[1px] text-slate-500">
          {t.history.nAnalyses(total)}
        </p>
      )}

      {/* Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[14px] bg-white/[0.03]" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && runs.length === 0 && (
        <GlassCard>
          <EmptyState
            icon={History}
            title={t.history.emptyTitle}
            body={t.history.emptyBody}
            cta={
              <Link
                href="/run"
                className="rounded-[10px] px-4 py-2 text-xs font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                {t.history.runFirst}
              </Link>
            }
          />
        </GlassCard>
      )}

      {/* Run list */}
      {!isLoading && runs.length > 0 && (
        <>
          <div className="space-y-2">
            {runs.map((run) => (
              <HistoryRunCard key={run.run_id} run={run} />
            ))}
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs text-slate-400 disabled:opacity-40 hover:text-slate-200 transition-colors"
              >
                ← Previous
              </button>
              <span className="text-xs text-slate-500">
                {page + 1} / {Math.ceil(total / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= total}
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs text-slate-400 disabled:opacity-40 hover:text-slate-200 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HistoryRunCard({ run }: { run: RunIndex }) {
  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete this run?\n\n${t.history.deleteConfirm}`)) return;
    try {
      await deleteRun(run.run_id);
      mutateHistory();
      toast.success("Run deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.unknownError);
    }
  }

  const statusColor =
    run.status === "complete"
      ? ""
      : run.status === "error"
      ? "border-red-400/20"
      : run.status === "running"
      ? "border-indigo-400/20"
      : "";

  return (
    <Link
      href={`/history/${run.run_id}`}
      className={cn(
        "group flex items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.03] px-4 py-3.5",
        "hover:border-indigo-400/25 hover:bg-white/[0.04] transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
        statusColor
      )}
    >
      {/* Signal */}
      <div className="shrink-0">
        {run.decision ? (
          <SignalBadge signal={run.decision as Signal} size="sm" />
        ) : (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border",
              run.status === "running"
                ? "text-indigo-400 border-indigo-400/30 bg-indigo-500/10"
                : run.status === "error"
                ? "text-red-400 border-red-400/20 bg-red-500/10"
                : "text-slate-500 border-white/[0.08]"
            )}
          >
            {run.status === "running" ? "Running…" : run.status === "error" ? "Error" : "Pending"}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-slate-100">{run.ticker}</span>
          <span className="text-[11px] text-slate-500">{formatDate(run.analysis_date)}</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
          {run.analysts.map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(", ")} ·{" "}
          {run.deep_model ?? run.llm_provider ?? "—"}{" "}
          · {formatTokens(run.tokens_in + run.tokens_out)} tokens
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Explicit "View Full Report" CTA — only shows for runs that have
            something to show. Errored/running rows show no button (whole row
            still navigates on click via the outer <Link>). */}
        {(run.status === "complete" || run.status === "done") && (
          <span
            className="hidden sm:inline-flex items-center gap-1 rounded-md border border-indigo-400/30 bg-indigo-500/[0.08] px-2 py-1 text-[11px] font-medium text-indigo-300 transition-all group-hover:bg-indigo-500/[0.15] group-hover:border-indigo-400/50"
            aria-hidden="true"
          >
            <FileText size={11} />
            View Full Report
          </span>
        )}
        <button
          onClick={handleDelete}
          aria-label={`Delete run for ${run.ticker}`}
          className="opacity-0 group-hover:opacity-100 rounded p-1.5 text-slate-600 hover:text-red-400 transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
        >
          <Trash2 size={13} />
        </button>
        <ChevronRight
          size={14}
          className="text-slate-600 group-hover:text-slate-400 transition-colors"
        />
      </div>
    </Link>
  );
}
