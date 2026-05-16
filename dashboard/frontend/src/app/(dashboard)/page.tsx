/**
 * Overview page — server component.
 * Fetches overview stats + watchlist server-side from backend.
 * Falls back gracefully if backend is unreachable.
 */
import { Suspense } from "react";
import Link from "next/link";
import { Activity, TrendingUp, Zap, BarChart2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { SignalBadge } from "@/components/signal-badge";
import { OverviewClientSection } from "./overview-client";
import { QuickRunForm } from "./quick-run-form";
import { t } from "@/lib/i18n/en";
import type { OverviewStats, WatchlistItem, Signal } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";

async function fetchOverview(): Promise<OverviewStats | null> {
  try {
    const url = `${process.env.BACKEND_URL ?? "http://localhost:8787"}/api/stats/overview`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.DASHBOARD_API_TOKEN ?? ""}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<OverviewStats>;
  } catch {
    return null;
  }
}

async function fetchWatchlist(): Promise<WatchlistItem[]> {
  try {
    const url = `${process.env.BACKEND_URL ?? "http://localhost:8787"}/api/watchlist`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.DASHBOARD_API_TOKEN ?? ""}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return res.json() as Promise<WatchlistItem[]>;
  } catch {
    return [];
  }
}

/** Derive buy/hold/sell counts from the decisions dict */
function decisionCount(overview: OverviewStats, key: string): number {
  return overview.decisions[key] ?? 0;
}

/** Total active signals = sum of all decision counts */
function activeSignals(overview: OverviewStats): number {
  return Object.values(overview.decisions).reduce((s, n) => s + n, 0);
}

export default async function OverviewPage() {
  const [overview, watchlist] = await Promise.all([
    fetchOverview(),
    fetchWatchlist(),
  ]);

  const backendDown = overview === null;

  const buyCount = overview ? decisionCount(overview, "BUY") : 0;
  const holdCount = overview ? decisionCount(overview, "HOLD") : 0;
  const sellCount = overview ? decisionCount(overview, "SELL") : 0;

  return (
    <div className="page-enter space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">
          {t.overview.greeting()}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {watchlist.length} ticker{watchlist.length !== 1 ? "s" : ""} tracked
        </p>
      </div>

      {/* Backend error banner */}
      {backendDown && (
        <div className="rounded-[10px] border border-red-400/20 bg-red-500/[0.05] px-4 py-3 text-xs text-red-400">
          {t.backendError}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={t.overview.activeSignals}
          value={overview ? String(activeSignals(overview)) : "—"}
          sub={
            overview
              ? t.overview.nBuyNHold(buyCount, holdCount, sellCount)
              : undefined
          }
          icon={<Activity size={16} className="text-indigo-400" />}
          variant="accent"
        />
        <StatCard
          label={t.overview.analysesToday}
          value={overview ? String(overview.runs_today) : "—"}
          sub={watchlist.length > 0 ? t.overview.acrossNTickers(watchlist.length) : undefined}
          icon={<TrendingUp size={16} className="text-slate-400" />}
        />
        <StatCard
          label={t.overview.tokensUsed}
          value={overview ? `~${(overview.avg_tokens_per_run * overview.total_runs).toFixed(0)}` : "—"}
          sub={overview ? `${overview.total_runs} total runs` : undefined}
          icon={<Zap size={16} className="text-indigo-300" />}
          valueSmall
        />
        <StatCard
          label={t.overview.topSignal}
          value={
            buyCount > holdCount && buyCount > sellCount
              ? "BUY"
              : sellCount > holdCount && sellCount > buyCount
              ? "SELL"
              : overview && (buyCount > 0 || holdCount > 0 || sellCount > 0)
              ? "HOLD"
              : "—"
          }
          sub={
            overview
              ? `${buyCount} buy · ${holdCount} hold · ${sellCount} sell`
              : undefined
          }
          icon={<BarChart2 size={16} className="text-emerald-400" />}
          variant={
            buyCount > holdCount && buyCount > sellCount
              ? "green"
              : sellCount > holdCount && sellCount > buyCount
              ? "red"
              : "default"
          }
          signalValue={
            buyCount > holdCount && buyCount > sellCount
              ? "BUY"
              : sellCount > holdCount && sellCount > buyCount
              ? "SELL"
              : buyCount > 0 || holdCount > 0 || sellCount > 0
              ? "HOLD"
              : undefined
          }
        />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Watchlist */}
        <GlassCard>
          <p className="text-[10px] uppercase tracking-[1px] text-white/30 mb-3">
            {t.overview.watchlistSignals}
          </p>
          {watchlist.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-slate-500 mb-3">No tickers tracked yet.</p>
              <Link
                href="/watchlist"
                className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
              >
                {t.watchlist.addTickerCta}
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {["Ticker", "Schedules", "Last Run"].map((h) => (
                      <th
                        key={h}
                        className="pb-2 text-left text-[10px] uppercase tracking-[1px] text-white/25 border-b border-white/[0.05] px-2 first:pl-0"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {watchlist.slice(0, 6).map((item) => (
                    <tr
                      key={item.ticker}
                      className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-2.5 px-2 first:pl-0">
                        <p className="font-bold text-slate-100">{item.ticker}</p>
                        <p className="text-[11px] text-slate-500">
                          Added {formatRelativeTime(item.created_at)}
                        </p>
                      </td>
                      <td className="py-2.5 px-2 text-slate-500">
                        {item.schedules.length > 0
                          ? `${item.schedules.length} schedule${item.schedules.length !== 1 ? "s" : ""}`
                          : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-slate-500">
                        {item.schedules.length > 0 ? "Scheduled" : "Manual"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {watchlist.length > 6 && (
                <p className="pt-2 text-center text-[11px] text-slate-500">
                  <Link href="/watchlist" className="text-indigo-400 hover:text-indigo-300">
                    View all {watchlist.length} tickers →
                  </Link>
                </p>
              )}
            </div>
          )}
        </GlassCard>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <GlassCard>
            <p className="text-[10px] uppercase tracking-[1px] text-white/30 mb-3">
              {t.overview.tokenUsage7d}
            </p>
            <Suspense fallback={<div className="h-16 animate-pulse rounded bg-white/[0.03]" />}>
              <OverviewClientSection />
            </Suspense>
          </GlassCard>

          <GlassCard className="flex-1">
            <p className="text-[10px] uppercase tracking-[1px] text-white/30 mb-3">
              {t.overview.quickRun}
            </p>
            <QuickRunForm />
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  variant = "default",
  valueSmall,
  signalValue,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  variant?: "default" | "accent" | "green" | "red" | "amber";
  valueSmall?: boolean;
  signalValue?: Signal;
}) {
  return (
    <GlassCard variant={variant}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] uppercase tracking-[1px] text-white/30">{label}</p>
        {icon}
      </div>
      {signalValue ? (
        <SignalBadge signal={signalValue} size="lg" />
      ) : (
        <p className={`font-extrabold text-slate-100 tabular-nums leading-none ${valueSmall ? "text-xl" : "text-3xl"}`}>
          {value}
        </p>
      )}
      {sub && <p className="mt-1.5 text-[11px] text-slate-500">{sub}</p>}
    </GlassCard>
  );
}
