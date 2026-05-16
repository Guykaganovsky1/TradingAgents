"use client";
import useSWR from "swr";
import { getOverviewStats, getTokenStats } from "@/lib/api";
import type { OverviewStats, TokenDay } from "@/lib/types";

export function useOverviewStats() {
  const { data, error, isLoading, mutate } = useSWR<OverviewStats>(
    "/api/stats/overview",
    getOverviewStats,
    { refreshInterval: 60_000 }
  );

  return { stats: data, isLoading, error: error as Error | undefined, mutate };
}

export function useTokenStats(days = 7) {
  const { data, error, isLoading } = useSWR<TokenDay[]>(
    `/api/stats/tokens?days=${days}`,
    () => getTokenStats(days),
    { refreshInterval: 60_000 }
  );

  return { days: data ?? [], isLoading, error: error as Error | undefined };
}
