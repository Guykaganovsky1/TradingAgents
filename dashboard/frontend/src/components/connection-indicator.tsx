"use client";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/en";
import type { WsStatus } from "@/lib/ws";

interface ConnectionIndicatorProps {
  status: WsStatus;
  className?: string;
}

const statusConfig: Record<
  WsStatus,
  { label: string; classes: string; icon: typeof Wifi }
> = {
  connecting: {
    label: t.connection.connecting,
    classes: "bg-indigo-500/10 border-indigo-400/20 text-indigo-400",
    icon: Loader2,
  },
  connected: {
    label: t.connection.connected,
    classes: "bg-emerald-500/10 border-emerald-400/20 text-emerald-400",
    icon: Wifi,
  },
  reconnecting: {
    label: t.connection.reconnecting,
    classes: "bg-amber-500/10 border-amber-400/20 text-amber-400",
    icon: Loader2,
  },
  disconnected: {
    label: t.connection.disconnected,
    classes: "bg-red-500/10 border-red-400/20 text-red-400",
    icon: WifiOff,
  },
};

export function ConnectionIndicator({
  status,
  className,
}: ConnectionIndicatorProps) {
  const { label, classes, icon: Icon } = statusConfig[status];
  const isSpinning = status === "connecting" || status === "reconnecting";

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Connection: ${label}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium",
        classes,
        className
      )}
    >
      <Icon
        size={11}
        aria-hidden="true"
        className={isSpinning ? "animate-spin" : undefined}
      />
      {label}
    </span>
  );
}
