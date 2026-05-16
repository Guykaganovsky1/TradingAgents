import { TrendingUp, Minus, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Signal } from "@/lib/types";

interface SignalBadgeProps {
  signal: Signal;
  size?: "sm" | "md" | "lg";
  className?: string;
}

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
  const { label, classes, Icon } = config[signal];
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
