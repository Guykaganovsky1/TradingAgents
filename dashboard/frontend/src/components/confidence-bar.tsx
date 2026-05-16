import { cn } from "@/lib/utils";
import { formatConfidence } from "@/lib/format";
import type { Signal } from "@/lib/types";

interface ConfidenceBarProps {
  confidence: number; // 0..1
  signal?: Signal | null;
  showLabel?: boolean;
  className?: string;
}

const signalColors: Record<Signal, string> = {
  BUY: "bg-emerald-400",
  HOLD: "bg-amber-400",
  SELL: "bg-red-400",
};

export function ConfidenceBar({
  confidence,
  signal,
  showLabel = true,
  className,
}: ConfidenceBarProps) {
  const pct = Math.round(confidence * 100);
  const fillColor = signal
    ? signalColors[signal]
    : "bg-indigo-400";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confidence: ${pct}%`}
        className="w-20 h-1 bg-white/[0.06] rounded-full overflow-hidden"
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500", fillColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-[11px] text-slate-500 tabular-nums">
          {formatConfidence(confidence)}
        </span>
      )}
    </div>
  );
}
