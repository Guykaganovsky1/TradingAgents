"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { getRuns } from "@/lib/api";
import type { PaginatedRuns } from "@/lib/types";

const PAGE_SIZE = 20;

export function useHistory(ticker?: string, page = 0) {
  const key = `/api/runs?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${ticker ? `&ticker=${ticker}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<PaginatedRuns>(
    key,
    () =>
      getRuns({
        ticker,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    { refreshInterval: 30_000 }
  );

  return {
    runs: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error as Error | undefined,
    mutate,
  };
}

export function mutateHistory() {
  return globalMutate(
    (key) => typeof key === "string" && key.startsWith("/api/runs"),
    undefined,
    { revalidate: true }
  );
}
