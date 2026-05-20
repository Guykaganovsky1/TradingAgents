import { TrendingUp, Minus, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import type { Signal } from "@/lib/types";
import { normalizeSignal } from "@/lib/signals";

interface SignalBadgeProps {
  /**
   * Decision string from any source. May be:
   *  - A canonical signal: 'BUY' | 'HOLD' | 'SELL'
   *  - A title-case agent output: 'Buy' | 'Hold' | 'Sell'
   *  - A 5-tier rating: 'Overweight' | 'Underweight'
   *  - An analyst stance: 'bullish' | 'bearish' | 'positive' …
   *  - null/undefined for runs that errored or are still in progress
   * normalizeSignal() maps all known variants to the 3 canonical values;
   * unknown strings render as the neutral '—' chip.
   */
  signal: Signal | string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const fallback = {
  label: "—",
  classes: "bg-white/[0.04] border border-white/[0.08] text-slate-500",
  Icon: HelpCircle,
};

const config: Record<
  Signal,
  { label: string; classes: string; Icon: typeof TrendingUp }
> = {
  BUY: {
    label: "BUY",
    classes:
      "bg-emerald-500/[0.12] border border-emerald-400/30 text-emerald-400",
    Icon: TrendingUp,
  },
  HOLD: {
    label: "HOLD",
    classes:
      "bg-amber-500/[0.12] border border-amber-400/30 text-amber-400",
    Icon: Minus,
  },
  SELL: {
    label: "SELL",
    classes:
      "bg-red-500/[0.12] border border-red-400/30 text-red-400",
    Icon: TrendingDown,
  },
};

const sizes = {
  sm: "text-[10px] px-2 py-0.5 gap-1",
  md: "text-[11px] px-2.5 py-1 gap-1.5",
  lg: "text-sm px-3 py-1.5 gap-2",
};

const iconSizes = {
  sm: 10,
  md: 12,
  lg: 14,
};

export function SignalBadge({
  signal,
  size = "md",
  className,
}: SignalBadgeProps) {
  // Normalize first — agents emit 5-tier ratings ('Hold', 'Overweight'),
  // 3-tier strings in mixed case ('Buy', 'sell'), and other phrasings.
  // Map them all to BUY / HOLD / SELL or null. Then fall back to the
  // neutral chip when the input was unparseable.
  const canonical = normalizeSignal(signal ?? null);
  const entry = canonical ? config[canonical] : fallback;
  const { label, classes, Icon } = entry;
  return (
    <span
      role="status"
      aria-label={`Signal: ${label}`}
      className={cn(
        "inline-flex items-center rounded-full font-semibold",
        classes,
        sizes[size],
        className
      )}
    >
      <Icon size={iconSizes[size]} aria-hidden="true" />
      {label}
    </span>
  );
}
