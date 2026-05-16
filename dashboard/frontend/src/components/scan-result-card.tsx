"use client";
/**
 * ScanResultCard — renders one ranked scanner result.
 * Design language mirrors DecisionCard: GlassCard + emerald/indigo accent.
 */
import Link from "next/link";
import { GlassCard } from "@/components/glass-card";
import { FactorScoreBar } from "@/components/factor-score-bar";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/en";
import type { ScanResult, FactorKey } from "@/lib/types";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";

interface ScanResultCardProps {
  rank: number;
  result: ScanResult;
}

const FACTOR_ORDER: FactorKey[] = ["technical", "news", "sentiment", "fundamental"];

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function formatVolume(vol: number | null): string {
  if (vol == null) return "—";
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(0)}M`;
  return `$${vol.toLocaleString()}`;
}

export function ScanResultCard({ rank, result }: ScanResultCardProps) {
  const isHighScore = result.composite_score >= 80;
  const isPositive = result.price_change_24h_pct >= 0;

  return (
    <GlassCard
      variant={isHighScore ? "green" : "accent"}
      as="article"
      className="space-y-4"
      aria-label={`Rank ${rank}: ${result.symbol} — composite score ${Math.round(result.composite_score)}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Rank pill */}
        <div
          className={cn(
            "shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold",
            isHighScore
              ? "bg-emerald-500/[0.18] text-emerald-300 border border-emerald-400/30"
              : "bg-indigo-500/[0.18] text-indigo-300 border border-indigo-400/30"
          )}
          aria-hidden="true"
        >
          {rank}
        </div>

        {/* Symbol + name + asset class */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-extrabold text-slate-100 tracking-tight">
              {result.symbol}
            </h2>
            {/* Asset class badge */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                result.asset_class === "crypto"
                  ? "bg-amber-500/[0.12] border-amber-400/30 text-amber-400"
                  : "bg-indigo-500/[0.12] border-indigo-400/30 text-indigo-300"
              )}
            >
              {t.scan.assetClass[result.asset_class]}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">{result.name}</p>
        </div>

        {/* Composite score — big number */}
        <div className="shrink-0 text-right">
          <div
            className={cn(
              "text-3xl font-extrabold tabular-nums leading-none",
              isHighScore ? "text-emerald-400" : "text-indigo-300"
            )}
            aria-label={`Composite score: ${Math.round(result.composite_score)}`}
          >
            {Math.round(result.composite_score)}
          </div>
          <div className="text-[9px] uppercase tracking-[1px] text-white/25 mt-0.5">
            {t.scan.compositeScore}
          </div>
        </div>
      </div>

      {/* Price + change */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-200 tabular-nums">
          {formatPrice(result.price)}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
            isPositive ? "text-emerald-400" : "text-red-400"
          )}
          aria-label={`24h change: ${result.price_change_24h_pct >= 0 ? "+" : ""}${result.price_change_24h_pct.toFixed(2)}%`}
        >
          {isPositive ? (
            <TrendingUp size={12} aria-hidden="true" />
          ) : (
            <TrendingDown size={12} aria-hidden="true" />
          )}
          {result.price_change_24h_pct >= 0 ? "+" : ""}
          {result.price_change_24h_pct.toFixed(2)}%
        </span>
        {result.volume_usd_24h != null && (
          <span className="text-[11px] text-slate-500">
            Vol {formatVolume(result.volume_usd_24h)}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.05]" />

      {/* Factor breakdown */}
      <div className="space-y-3">
        {FACTOR_ORDER.map((key) => {
          const factor = result.factors[key];
          if (!factor) return null;
          return (
            <FactorScoreBar
              key={key}
              name={t.scan.factor[key]}
              score={factor.score}
              weight={factor.weight}
              signals={factor.signals}
              animate
            />
          );
        })}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.05]" />

      {/* CTA */}
      <Link
        href={result.run_url}
        className={cn(
          "group flex items-center justify-between gap-3 rounded-[10px] px-4 py-3 text-sm font-semibold transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          isHighScore
            ? "bg-emerald-500/[0.12] text-emerald-300 hover:bg-emerald-500/[0.20] border border-emerald-400/20 hover:border-emerald-400/40"
            : "bg-indigo-500/[0.12] text-indigo-300 hover:bg-indigo-500/[0.20] border border-indigo-400/20 hover:border-indigo-400/40"
        )}
        aria-label={`Run TradingAgents analysis for ${result.symbol}`}
      >
        <span>{t.scan.runCta}</span>
        <ArrowRight
          size={16}
          aria-hidden="true"
          className="group-hover:translate-x-0.5 transition-transform"
        />
      </Link>
    </GlassCard>
  );
}
