"use client";
/**
 * SWR-backed hook for scan history.
 * Mirrors use-history.ts pattern exactly.
 */
import useSWR, { mutate as globalMutate } from "swr";
import { useCallback } from "react";
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
      // while SWR retries in the background.
      keepPreviousData: true,
      shouldRetryOnError: true,
      // Effectively unlimited — periodic polling will eventually recover.
      // Without this, after 5 fast failures (e.g. backend booting up) SWR
      // gives up and the user sees a permanent 'Failed to load' until
      // they manually click Retry. We'd rather it self-heal on the next
      // refreshInterval tick.
      errorRetryCount: 50,
      errorRetryInterval: 3_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  // Retry handler that bypasses SWR's error-cache state entirely. Calling
  // mutate(undefined, { revalidate: true }) wipes the cached error AND
  // forces a fresh fetch, so the UI swaps from 'Failed to load' to either
  // the new data or a fresh error — no stuck states.
  const retry = useCallback(async () => {
    await mutate(undefined, { revalidate: true, rollbackOnError: false });
  }, [mutate]);

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
    retry,
  };
}

export function mutateScans() {
  return globalMutate(
    (key) => typeof key === "string" && key.startsWith("/api/scans"),
    undefined,
    { revalidate: true }
  );
}
