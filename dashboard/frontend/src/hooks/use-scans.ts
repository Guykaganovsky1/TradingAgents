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

  const { data, error, isLoading, mutate } = useSWR<PaginatedScans>(
    key,
    () => listScans(PAGE_SIZE, page * PAGE_SIZE),
    { refreshInterval: 15_000 }
  );

  return {
    scans: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error as Error | undefined,
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
