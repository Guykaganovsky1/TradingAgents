"use client";
/**
 * Market Scanner page — /scan
 *
 * - Universe chip toggles (Watchlist / S&P 500 / Nasdaq 100 / Crypto)
 * - Top-N selector (3 / 5 / 10)
 * - ⚡ Scan Now → POST /api/scans → WS progress
 * - Per-factor progress bars while running
 * - ScanResultCard grid when complete
 * - Scan history (collapsed by default)
 * - ?auto=1 → fires scan on mount with defaults
 */
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { GlassCard } from "@/components/glass-card";
import { ScanResultCard } from "@/components/scan-result-card";
import { useScanStream } from "@/hooks/use-scan-stream";
import { useScans, mutateScans } from "@/hooks/use-scans";
import { startScan, deleteScan } from "@/lib/api";
import { t } from "@/lib/i18n/en";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/theme";
import type { UniverseKey, FactorKey, Scan } from "@/lib/types";
import {
  Zap,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types / constants
// ---------------------------------------------------------------------------

const UNIVERSES: { key: UniverseKey; label: string }[] = [
  { key: "watchlist", label: t.scan.universe.watchlist },
  { key: "sp500", label: t.scan.universe.sp500 },
  { key: "nasdaq100", label: t.scan.universe.nasdaq100 },
  { key: "crypto", label: t.scan.universe.crypto },
];

const TOP_N_OPTIONS = [3, 5, 10];

const DEFAULT_UNIVERSES: UniverseKey[] = ["sp500", "nasdaq100", "crypto"];

const FACTOR_ORDER: FactorKey[] = ["technical", "news", "sentiment", "fundamental"];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UniverseToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold border transition-all",
        focusRing,
        active
          ? "bg-indigo-500/[0.18] border-indigo-400/40 text-indigo-200"
          : "bg-white/[0.03] border-white/[0.08] text-slate-500 hover:text-slate-400 hover:border-white/[0.12]"
      )}
    >
      {label}
    </button>
  );
}

function FactorProgressRow({
  label,
  factorKey,
  status,
}: {
  label: string;
  factorKey: FactorKey;
  status: "pending" | "running" | "done" | "error" | undefined;
}) {
  const pct =
    status === "done" ? 100 : status === "running" ? 50 : 0;
  const color =
    status === "done"
      ? "bg-emerald-500"
      : status === "error"
      ? "bg-red-500"
      : "bg-indigo-500";

  return (
    <div className="space-y-1" key={factorKey}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">{label}</span>
        <span
          className={cn(
            "text-[10px] font-medium",
            status === "done"
              ? "text-emerald-400"
              : status === "error"
              ? "text-red-400"
              : status === "running"
              ? "text-indigo-300"
              : "text-slate-600"
          )}
        >
          {status ? t.scan.factorStatus[status] : t.scan.factorStatus.pending}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            color,
            status === "running" && "animate-pulse"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ScanHistoryItem({ scan }: { scan: Scan }) {
  const statusColor: Record<string, string> = {
    complete: "text-emerald-400",
    running: "text-indigo-300",
    error: "text-red-400",
    queued: "text-slate-400",
  };
  const statusLabel: Record<string, string> = {
    complete: t.scan.historyStatusComplete,
    running: t.scan.historyStatusRunning,
    error: t.scan.historyStatusError,
    queued: t.scan.historyStatusQueued,
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-300 truncate">
          {scan.universes.map((u) => t.scan.universe[u]).join(", ")}
          {" · "}Top {scan.top_n}
        </p>
        <p className="text-[10px] text-slate-600">
          {formatRelativeTime(scan.started_at)}
          {scan.universe_size > 0 && ` · ${scan.universe_size} symbols`}
        </p>
      </div>
      <span className={cn("text-[10px] font-semibold shrink-0", statusColor[scan.status] ?? "text-slate-500")}>
        {statusLabel[scan.status] ?? scan.status}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page (inner — wrapped by Suspense for useSearchParams)
// ---------------------------------------------------------------------------

function ScanPageInner() {
  const searchParams = useSearchParams();
  const autoFire = searchParams.get("auto") === "1";

  // Form state
  const [universes, setUniverses] = useState<UniverseKey[]>(DEFAULT_UNIVERSES);
  const [topN, setTopN] = useState(5);

  // Scan state
  const [scanId, setScanId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // WS stream
  const stream = useScanStream(scanId);

  // History
  const {
    scans,
    isLoading: historyLoading,
    isValidating: historyValidating,
    error: historyError,
    mutate: refetchHistory,
    retry: retryHistory,
  } = useScans();

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleStart = useCallback(async () => {
    if (universes.length === 0 || isStarting) return;
    setIsStarting(true);
    setScanId(null); // reset previous stream

    try {
      const result = await startScan({ universes, top_n: topN });
      setScanId(result.scan_id);
      mutateScans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.scan.startError);
    } finally {
      setIsStarting(false);
    }
  }, [universes, topN, isStarting]);

  const handleCancel = useCallback(async () => {
    if (!scanId) return;
    try {
      await deleteScan(scanId);
      setScanId(null);
      mutateScans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.scan.cancelError);
    }
  }, [scanId]);

  const toggleUniverse = useCallback((key: UniverseKey) => {
    setUniverses((prev) =>
      prev.includes(key) ? prev.filter((u) => u !== key) : [...prev, key]
    );
  }, []);

  // Auto-fire on mount if ?auto=1
  // Use setTimeout(0) to defer the setState calls out of the effect body
  // and satisfy react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    if (!autoFire) return;
    const id = setTimeout(() => { void handleStart(); }, 0);
    return () => clearTimeout(id);
    // Only run once on mount — handleStart is stable (useCallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh history when scan completes
  useEffect(() => {
    if (stream.isComplete) {
      mutateScans();
      refetchHistory();
    }
  }, [stream.isComplete, refetchHistory]);

  const isScanning = !!scanId && !stream.isComplete;
  const canStart = universes.length > 0 && !isStarting && !isScanning;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="page-enter space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">{t.scan.title}</h1>
        <p className="mt-1 text-xs text-slate-500">{t.scan.subtitle}</p>
      </div>

      {/* Configuration card */}
      <GlassCard>
        <p className="text-[10px] uppercase tracking-[1px] text-white/30 mb-4">
          {t.scan.configure}
        </p>

        <div className="space-y-4">
          {/* Universe toggles */}
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[1px] text-white/35">
              {t.scan.universes}
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t.scan.universesDesc}>
              {UNIVERSES.map(({ key, label }) => (
                <UniverseToggle
                  key={key}
                  label={label}
                  active={universes.includes(key)}
                  onToggle={() => toggleUniverse(key)}
                />
              ))}
            </div>
            {universes.length === 0 && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                Select at least one universe to scan.
              </p>
            )}
          </div>

          {/* Top-N */}
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[1px] text-white/35">
              {t.scan.topN}
            </p>
            <div className="flex gap-2" role="group" aria-label={t.scan.topN}>
              {TOP_N_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTopN(n)}
                  aria-pressed={topN === n}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-xs font-semibold border transition-all",
                    focusRing,
                    topN === n
                      ? "bg-indigo-500/[0.18] border-indigo-400/40 text-indigo-200"
                      : "bg-white/[0.03] border-white/[0.08] text-slate-500 hover:text-slate-400"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Scan Now button */}
          <button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-[10px] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40",
              focusRing
            )}
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            aria-label={t.scan.scanNow}
          >
            {isStarting ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Starting…
              </>
            ) : (
              <>
                <Zap size={16} aria-hidden="true" />
                {t.scan.scanNow}
              </>
            )}
          </button>
        </div>
      </GlassCard>

      {/* Live progress card */}
      {isScanning && (
        <GlassCard variant="accent">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-[1px] text-white/30">
              {t.scan.progress}
            </p>
            <button
              type="button"
              onClick={handleCancel}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-400 hover:text-red-400 border border-white/[0.06] hover:border-red-400/20 transition-colors",
                focusRing
              )}
              aria-label={t.scan.cancel}
            >
              <X size={12} aria-hidden="true" />
              {t.scan.cancel}
            </button>
          </div>

          {/* Universe size */}
          <p className="text-sm text-indigo-200 mb-4">
            {stream.universeSize != null
              ? t.scan.scanning(stream.universeSize)
              : "Initializing…"}
          </p>

          {/* Per-factor bars */}
          <div className="space-y-3">
            {FACTOR_ORDER.map((key) => (
              <FactorProgressRow
                key={key}
                label={t.scan.factor[key]}
                factorKey={key}
                status={stream.factorProgress[key]}
              />
            ))}
          </div>

          {/* Overall progress */}
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-[10px] text-white/30">
              <span>Overall progress</span>
              <span className="tabular-nums">{Math.round(stream.progress)}%</span>
            </div>
            <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${stream.progress}%` }}
              />
            </div>
          </div>
        </GlassCard>
      )}

      {/* Scan error */}
      {scanId && stream.isComplete && stream.errorMessage && (
        <GlassCard variant="red">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-300">{t.scan.scanError}</p>
              <p className="text-xs text-red-400/80 mt-0.5">{stream.errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={handleStart}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 border border-white/[0.08] hover:border-white/[0.15] hover:text-slate-200 transition-colors",
                focusRing
              )}
              aria-label={t.scan.retryLabel}
            >
              <RefreshCw size={12} aria-hidden="true" />
              {t.scan.retryLabel}
            </button>
          </div>
        </GlassCard>
      )}

      {/* Results */}
      {stream.results && stream.results.length > 0 && (
        <section aria-label={t.scan.results}>
          <p className="text-[10px] uppercase tracking-[1px] text-white/30 mb-3">
            {t.scan.results}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {stream.results.map((result, i) => (
              <ScanResultCard key={result.symbol} rank={i + 1} result={result} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state — no scan started yet */}
      {!scanId && !isStarting && scans.length === 0 && !historyLoading && (
        <GlassCard className="py-10 text-center">
          <Zap size={32} className="mx-auto mb-3 text-indigo-400 opacity-50" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-300">{t.scan.emptyTitle}</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">{t.scan.emptyBody}</p>
        </GlassCard>
      )}

      {/* Scan history — collapsed by default */}
      <GlassCard>
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className={cn(
            "w-full flex items-center justify-between gap-2 text-left",
            focusRing,
            "rounded-lg"
          )}
          aria-expanded={historyOpen}
          aria-controls="scan-history-panel"
        >
          <p className="text-[10px] uppercase tracking-[1px] text-white/30">
            {t.scan.history}
          </p>
          {historyOpen ? (
            <ChevronUp size={14} className="text-slate-500" aria-hidden="true" />
          ) : (
            <ChevronDown size={14} className="text-slate-500" aria-hidden="true" />
          )}
        </button>

        <div
          id="scan-history-panel"
          hidden={!historyOpen}
        >
          {historyLoading ? (
            <div className="mt-3 space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          ) : historyError ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-400">
              <AlertTriangle size={14} aria-hidden="true" />
              {t.scan.loadError}
              <button
                type="button"
                onClick={() => retryHistory()}
                disabled={historyValidating}
                className={cn(
                  "underline hover:no-underline disabled:opacity-50 disabled:no-underline",
                  focusRing,
                  "rounded",
                )}
                aria-label="Retry loading scan history"
              >
                {historyValidating ? "Retrying…" : t.scan.retryLabel}
              </button>
            </div>
          ) : scans.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">{t.scan.historyEmpty}</p>
          ) : (
            <div className="mt-3">
              {scans.map((scan) => (
                <ScanHistoryItem key={scan.scan_id} scan={scan} />
              ))}
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export — wrap with Suspense for useSearchParams
// ---------------------------------------------------------------------------

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 page-enter">
          <div className="h-8 w-48 rounded-lg bg-white/[0.04] animate-pulse" />
          <div className="h-48 rounded-[14px] bg-white/[0.03] animate-pulse" />
        </div>
      }
    >
      <ScanPageInner />
    </Suspense>
  );
}
