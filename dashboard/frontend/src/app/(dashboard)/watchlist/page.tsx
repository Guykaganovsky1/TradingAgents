"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookMarked, Play, Trash2, Plus, X, Check, Loader2, Clock } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState } from "@/components/empty-state";
import { TickerInput } from "@/components/ticker-input";
import { useWatchlist, mutateWatchlist } from "@/hooks/use-watchlist";
import {
  addToWatchlist,
  deleteWatchlistItem,
  startRun,
} from "@/lib/api";
import { t } from "@/lib/i18n/en";
import { formatRelativeTime } from "@/lib/format";
import { mutateHistory } from "@/hooks/use-history";
import type { WatchlistItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function WatchlistPage() {
  const { watchlist, isLoading, error } = useWatchlist();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="page-enter space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{t.watchlist.title}</h1>
          <p className="mt-1 text-xs text-slate-500">{t.watchlist.subtitle}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
        >
          <Plus size={14} aria-hidden="true" />
          {t.watchlist.addTicker}
        </button>
      </div>

      {/* Add ticker modal */}
      {showAdd && <AddTickerModal onClose={() => setShowAdd(false)} />}

      {/* Error */}
      {error && (
        <div className="rounded-[10px] border border-red-400/20 bg-red-500/[0.05] px-4 py-3 text-xs text-red-400">
          {t.backendError}
        </div>
      )}

      {/* Skeleton */}
      {isLoading && (
        <GlassCard>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.03]" />
            ))}
          </div>
        </GlassCard>
      )}

      {/* Empty state */}
      {!isLoading && watchlist.length === 0 && (
        <GlassCard>
          <EmptyState
            icon={BookMarked}
            title={t.watchlist.addToWatchlist}
            body={t.watchlist.addToWatchlistBody}
            cta={
              <button
                onClick={() => setShowAdd(true)}
                className="rounded-[10px] px-4 py-2 text-xs font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                {t.watchlist.addTickerCta}
              </button>
            }
          />
        </GlassCard>
      )}

      {/* Desktop table */}
      {!isLoading && watchlist.length > 0 && (
        <>
          <div className="hidden md:block">
            <GlassCard className="p-0 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    {[
                      t.watchlist.ticker,
                      "Schedules",
                      t.watchlist.lastRun,
                      "",
                    ].map((h, i) => (
                      <th
                        key={i}
                        className="px-4 py-3 text-left text-[10px] uppercase tracking-[1px] text-white/25"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((item) => (
                    <WatchlistRow key={item.ticker} item={item} />
                  ))}
                </tbody>
              </table>
            </GlassCard>
          </div>

          {/* Mobile card stack */}
          <div className="md:hidden space-y-3">
            {watchlist.map((item) => (
              <WatchlistCard key={item.ticker} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function WatchlistRow({ item }: { item: WatchlistItem }) {
  const router = useRouter();

  async function handleRunNow() {
    try {
      const result = await startRun({ ticker: item.ticker });
      toast.success(`Analysis started for ${item.ticker}`, {
        action: {
          label: "View run",
          onClick: () => router.push(`/history/${result.run_id}`),
        },
      });
      mutateHistory();
      router.push(`/run`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.unknownError);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${item.ticker} from watchlist?\n\n${t.watchlist.deleteConfirm}`)) return;
    try {
      await deleteWatchlistItem(item.ticker);
      mutateWatchlist();
      toast.success(`${item.ticker} removed from watchlist`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.unknownError);
    }
  }

  return (
    <tr className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3">
        <p className="font-bold text-slate-100">{item.ticker}</p>
        <p className="text-[11px] text-slate-500">Added {formatRelativeTime(item.created_at)}</p>
      </td>
      <td className="px-4 py-3 text-slate-500">
        {item.schedules.length > 0 ? (
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {item.schedules.length} schedule{item.schedules.length !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-slate-500">
        {item.schedules.some((s) => s.enabled) ? "Scheduled" : "Manual"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={handleRunNow}
            aria-label={`Run analysis for ${item.ticker}`}
            className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors min-h-[44px] min-w-[44px] justify-center"
          >
            <Play size={11} /> Run
          </button>
          <button
            onClick={handleDelete}
            aria-label={`Delete ${item.ticker} from watchlist`}
            className="flex items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] p-1.5 text-slate-600 hover:text-red-400 transition-colors min-h-[44px] min-w-[44px]"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function WatchlistCard({ item }: { item: WatchlistItem }) {
  const router = useRouter();

  async function handleRunNow() {
    try {
      await startRun({ ticker: item.ticker });
      toast.success(`Analysis started for ${item.ticker}`);
      mutateHistory();
      router.push(`/run`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.unknownError);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${item.ticker}?`)) return;
    try {
      await deleteWatchlistItem(item.ticker);
      mutateWatchlist();
      toast.success(`${item.ticker} removed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.unknownError);
    }
  }

  return (
    <GlassCard>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-slate-100">{item.ticker}</p>
          <p className="text-[11px] text-slate-500">Added {formatRelativeTime(item.created_at)}</p>
        </div>
        {item.schedules.length > 0 && (
          <span className="text-[11px] text-indigo-400 flex items-center gap-1">
            <Clock size={11} />
            {item.schedules.length} schedule{item.schedules.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleRunNow}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] py-2.5 text-xs text-slate-300 hover:text-white transition-colors"
        >
          <Play size={12} /> Run
        </button>
        <button
          onClick={handleDelete}
          aria-label="Delete from watchlist"
          className="flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-slate-600 hover:text-red-400 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </GlassCard>
  );
}

function AddTickerModal({ onClose }: { onClose: () => void }) {
  const [ticker, setTicker] = useState("");
  const [tickerValid, setTickerValid] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!ticker || !tickerValid || saving) return;
    setSaving(true);
    try {
      await addToWatchlist({ ticker });
      mutateWatchlist();
      toast.success(`${ticker} added to watchlist`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.unknownError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.watchlist.editTicker}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Modal */}
      <div className="relative w-full max-w-md rounded-[14px] border border-white/[0.08] bg-[#0d0820] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">{t.watchlist.addTicker}</h2>
          <button
            onClick={onClose}
            aria-label={t.close}
            className="rounded-md p-1 text-slate-500 hover:text-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block mb-1.5 text-[10px] uppercase tracking-[1px] text-white/35">
              {t.watchlist.tickerLabel}
            </label>
            <TickerInput
              id="add-ticker"
              value={ticker}
              onChange={setTicker}
              onValidated={(valid) => setTickerValid(valid)}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/[0.08] py-2.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!tickerValid || saving}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity",
                (!tickerValid || saving) && "opacity-40"
              )}
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              {saving ? (
                <><Loader2 size={14} className="animate-spin" /> Saving…</>
              ) : (
                <><Check size={14} /> {t.save}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
