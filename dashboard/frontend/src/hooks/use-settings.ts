"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { getSettings } from "@/lib/api";
import type { AppSettings } from "@/lib/types";

const KEY = "/api/settings";

export function useSettings() {
  const { data, error, isLoading, mutate } = useSWR<AppSettings>(
    KEY,
    getSettings,
    { revalidateOnFocus: false }
  );

  return {
    settings: data,
    isLoading,
    error: error as Error | undefined,
    mutate,
  };
}

export function mutateSettings() {
  return globalMutate(KEY);
}
