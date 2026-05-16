"use client";
/**
 * FactorScoreBar — horizontal progress bar for a single scanner factor.
 * Color: emerald >75, amber 50-75, slate <50.
 * Animates from 0 → score on mount (respects prefers-reduced-motion).
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface FactorScoreBarProps {
  /** Display name for this factor */
  name: string;
  /** 0-100 score */
  score: number;
  /** 0-1 weight */
  weight: number;
  /** Top-2 signal strings */
  signals: string[];
  /** Whether to animate the bar on mount */
  animate?: boolean;
}

function scoreColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-400";
  return "bg-slate-500";
}

function scoreTextColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-slate-400";
}

export function FactorScoreBar({
  name,
  score,
  weight,
  signals,
  animate = true,
}: FactorScoreBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const prefersReduced =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    if (!animate || prefersReduced) {
      el.style.width = `${score}%`;
      return;
    }
    // Start at 0, animate to target
    el.style.width = "0%";
    el.style.transition = "width 0.6s cubic-bezier(0.16,1,0.3,1)";
    const raf = requestAnimationFrame(() => {
      el.style.width = `${score}%`;
    });
    return () => cancelAnimationFrame(raf);
  }, [score, animate, prefersReduced]);

  return (
    <div className="space-y-1.5">
      {/* Label row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-medium text-slate-300 truncate">{name}</span>
          <span className="text-[9px] text-white/25 tabular-nums">
            {Math.round(weight * 100)}%
          </span>
        </div>
        <span
          className={cn(
            "text-xs font-bold tabular-nums shrink-0",
            scoreTextColor(score)
          )}
          aria-label={`${name} score: ${score} out of 100`}
        >
          {Math.round(score)}
        </span>
      </div>

      {/* Bar track */}
      <div
        className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(score)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${name} factor score`}
      >
        <div
          ref={barRef}
          className={cn("h-full rounded-full", scoreColor(score))}
          style={{ width: prefersReduced ? `${score}%` : "0%" }}
        />
      </div>

      {/* Signals */}
      {signals.length > 0 && (
        <ul className="space-y-0.5">
          {signals.slice(0, 2).map((sig, i) => (
            <li
              key={i}
              className="text-[10px] text-slate-500 leading-tight pl-3 relative before:absolute before:left-0 before:top-[5px] before:h-[3px] before:w-[3px] before:rounded-full before:bg-slate-600"
            >
              {sig}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
