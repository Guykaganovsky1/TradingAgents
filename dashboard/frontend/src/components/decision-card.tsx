import { TrendingUp, Minus, TrendingDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatConfidence, formatDate } from "@/lib/format";
import { colors } from "@/lib/theme";
import type { Signal } from "@/lib/types";

interface DecisionCardProps {
  /** May be null for runs that errored or are still in progress. */
  decision: Signal | null | undefined;
  confidence: number;
  ticker: string;
  date: string;
  llmModel: string;
  llmProvider: string;
  className?: string;
}

const config: Record<
  Signal,
  {
    gradient: string;
    bg: string;
    border: string;
    text: string;
    Icon: typeof TrendingUp;
  }
> = {
  BUY: {
    gradient: `linear-gradient(135deg, ${colors.accentEmerald}, ${colors.accentEmeraldDark})`,
    bg: "bg-emerald-500/[0.06]",
    border: "border-emerald-400/20",
    text: colors.accentEmerald,
    Icon: TrendingUp,
  },
  HOLD: {
    gradient: `linear-gradient(135deg, ${colors.accentAmber}, ${colors.accentAmberDark})`,
    bg: "bg-amber-500/[0.06]",
    border: "border-amber-400/20",
    text: colors.accentAmber,
    Icon: Minus,
  },
  SELL: {
    gradient: `linear-gradient(135deg, ${colors.accentRed}, ${colors.accentRedDark})`,
    bg: "bg-red-500/[0.06]",
    border: "border-red-400/20",
    text: colors.accentRed,
    Icon: TrendingDown,
  },
};

export function DecisionCard({
  decision,
  confidence,
  ticker,
  date,
  llmModel,
  llmProvider,
  className,
}: DecisionCardProps) {
  // Same guard as SignalBadge — runs without a decision render a neutral
  // "Pending / Unknown" card instead of crashing the History page.
  const entry =
    decision && decision in config
      ? config[decision as Signal]
      : {
          gradient: `linear-gradient(135deg, ${colors.textMuted ?? "#64748b"}, ${colors.textFaint ?? "#475569"})`,
          bg: "bg-white/[0.03]",
          border: "border-white/[0.08]",
          text: colors.textMuted ?? "#64748b",
          Icon: HelpCircle,
        };
  const { gradient, bg, border, text, Icon } = entry;
  const pct = Math.round((confidence ?? 0) * 100);

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-[14px] border px-5 py-5",
        bg,
        border,
        className
      )}
      role="region"
      aria-label={`Decision: ${decision} for ${ticker}`}
    >
      <div>
        {/* Decision */}
        <div className="flex items-center gap-2 mb-1">
          <Icon
            size={20}
            aria-hidden="true"
            style={{ color: text }}
          />
          <span
            className="text-4xl font-black"
            style={{
              background: gradient,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {decision}
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-200">
          {ticker} — {formatDate(date)}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Portfolio Manager decision · {formatConfidence(confidence)} confidence
        </p>
        <p className="text-[11px] text-slate-600 mt-0.5">
          {llmModel} via {llmProvider}
        </p>
      </div>

      {/* Confidence ring */}
      <div
        className="relative flex h-16 w-16 items-center justify-center rounded-full shrink-0"
        aria-label={`${pct}% confidence`}
        style={{
          background: `conic-gradient(${text} 0% ${pct}%, ${colors.glassBg} ${pct}%)`,
        }}
      >
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center"
          style={{ background: colors.bgGradientEnd }}
        >
          <span className="text-xs font-bold" style={{ color: text }}>
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}
