"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { getWatchlist } from "@/lib/api";
import type { WatchlistItem } from "@/lib/types";

const KEY = "/api/watchlist";

export function useWatchlist() {
  const { data, error, isLoading, mutate } = useSWR<WatchlistItem[]>(
    KEY,
    getWatchlist,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
    }
  );

  return {
    watchlist: data ?? [],
    isLoading,
    error: error as Error | undefined,
    mutate,
  };
}

export function mutateWatchlist() {
  return globalMutate(KEY);
}
