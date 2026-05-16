"use client";
/**
 * SWR-backed hook for scan history.
 * Mirrors use-history.ts pattern exactly.
 */
import useSWR, { mutate as globalMutate } from "swr";
import { listScans } from "@/lib/api";
import type { PaginatedScans } from "@/lib/types";

const PAGE_SIZE = 20;

export function useScans(page = 0) {
  const key = `/api/scans?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;

  const { data, error, isLoading, isValidating, mutate } = useSWR<PaginatedScans>(
    key,
    () => listScans(PAGE_SIZE, page * PAGE_SIZE),
    {
      refreshInterval: 15_000,
      // Don't blow away the last good list if a background refresh fails
      // (e.g. backend restart). The UI will keep showing the cached scans
      // and SWR will retry up to 5 times with exponential backoff.
      keepPreviousData: true,
      shouldRetryOnError: true,
      errorRetryCount: 5,
      errorRetryInterval: 2_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  return {
    scans: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isValidating,
    // Only surface as an "error" when we have NO data at all. If we have
    // cached items, keep showing them — a transient refresh failure
    // shouldn't black out the whole panel.
    error: data ? undefined : (error as Error | undefined),
    mutate,
  };
}

export function mutateScans() {
  return globalMutate(
    (key) => typeof key === "string" && key.startsWith("/api/scans"),
    undefined,
    { revalidate: true }
  );
}
