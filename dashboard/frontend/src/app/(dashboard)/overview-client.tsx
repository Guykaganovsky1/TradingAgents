"use client";
import { useTokenStats } from "@/hooks/use-overview-stats";
import { TokenChart } from "@/components/token-chart";
import { Skeleton } from "@/components/ui/skeleton";

export function OverviewClientSection() {
  const { days, isLoading } = useTokenStats(7);

  if (isLoading) {
    return <Skeleton className="h-16 w-full bg-white/[0.04]" />;
  }

  if (days.length === 0) {
    return (
      <p className="text-xs text-slate-600 py-4 text-center">
        No token data yet.
      </p>
    );
  }

  return <TokenChart data={days} />;
}
