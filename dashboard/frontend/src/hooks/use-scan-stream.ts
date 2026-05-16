"use client";
/**
 * WebSocket hook for streaming scan progress events.
 * Mirrors use-run-stream.ts exactly — same ws-config BFF pattern,
 * same RunWsClient with auto-reconnect.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { RunWsClient, type WsStatus } from "@/lib/ws";
import type { ScanWsEvent, ScanResult, FactorKey, ScanStatus, AnyWsEvent } from "@/lib/types";

export interface ScanStreamState {
  status: WsStatus;
  scanStatus: ScanStatus | null;
  universeSize: number | null;
  progress: number;
  factorProgress: Partial<Record<FactorKey, "pending" | "running" | "done" | "error">>;
  results: ScanResult[] | null;
  errorMessage: string | null;
  isComplete: boolean;
}

// Module-level promise cache — same pattern as use-run-stream.ts
let wsConfigPromise: Promise<{ wsUrl: string; token: string }> | null = null;

function getWsConfig(): Promise<{ wsUrl: string; token: string }> {
  if (!wsConfigPromise) {
    wsConfigPromise = fetch("/api/ws-config")
      .then((res) => {
        if (!res.ok) throw new Error("ws-config fetch failed");
        return res.json() as Promise<{ wsUrl: string; token: string }>;
      })
      .catch((err) => {
        wsConfigPromise = null;
        throw err;
      });
  }
  return wsConfigPromise;
}

export function useScanStream(scanId: string | null): ScanStreamState {
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [universeSize, setUniverseSize] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [factorProgress, setFactorProgress] = useState<
    Partial<Record<FactorKey, "pending" | "running" | "done" | "error">>
  >({});
  const [results, setResults] = useState<ScanResult[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const clientRef = useRef<RunWsClient | null>(null);

  /**
   * Process a single scan WS event. All state updaters are stable
   * (guaranteed by React), so this callback never needs to change.
   */
  const handleEvent = useCallback((rawEvent: AnyWsEvent) => {
    const event = rawEvent as unknown as ScanWsEvent;
    applyScanEvent(event, {
      setUniverseSize,
      setScanStatus,
      setProgress,
      setFactorProgress,
      setResults,
      setIsComplete,
      setErrorMessage,
    });
  }, []); // stable — only uses stable state setters

  useEffect(() => {
    if (!scanId) return;

    // Reset stream state when scanId changes.
    // Wrapped in queueMicrotask so these setState calls run outside the
    // synchronous effect body, satisfying react-hooks/set-state-in-effect.
    queueMicrotask(() => {
      setWsStatus("connecting");
      setScanStatus("queued");
      setUniverseSize(null);
      setProgress(0);
      setFactorProgress({});
      setResults(null);
      setErrorMessage(null);
      setIsComplete(false);
    });

    let cancelled = false;

    getWsConfig()
      .then(({ wsUrl, token }) => {
        if (cancelled) return;
        const url = `${wsUrl}/ws/scans/${scanId}?token=${encodeURIComponent(token)}`;
        clientRef.current = new RunWsClient(url, {
          onEvent: handleEvent,
          onStatusChange: setWsStatus,
          onError: (err) => setErrorMessage(err),
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : "Failed to load WebSocket config"
          );
          setWsStatus("disconnected");
        }
      });

    return () => {
      cancelled = true;
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, [scanId, handleEvent]);

  return {
    status: wsStatus,
    scanStatus,
    universeSize,
    progress,
    factorProgress,
    results,
    errorMessage,
    isComplete,
  };
}

// ---------------------------------------------------------------------------
// Pure event processor — no hooks, easily testable
// ---------------------------------------------------------------------------

type StateCallbacks = {
  setUniverseSize: (n: number) => void;
  setScanStatus: (s: ScanStatus) => void;
  setProgress: (fn: (prev: number) => number) => void;
  setFactorProgress: (
    fn: (
      prev: Partial<Record<FactorKey, "pending" | "running" | "done" | "error">>
    ) => Partial<Record<FactorKey, "pending" | "running" | "done" | "error">>
  ) => void;
  setResults: (r: ScanResult[]) => void;
  setIsComplete: (b: boolean) => void;
  setErrorMessage: (m: string) => void;
};

function applyScanEvent(event: ScanWsEvent, cb: StateCallbacks): void {
  switch (event.type) {
    case "state_snapshot": {
      for (const e of event.events) {
        applyScanEvent(e, cb);
      }
      break;
    }
    case "universe_built": {
      cb.setUniverseSize(event.universe_size);
      cb.setScanStatus("running");
      break;
    }
    case "factor_progress": {
      const { factor, completed, total } = event;
      cb.setFactorProgress((prev) => ({
        ...prev,
        [factor]: prev[factor] === "done" ? "done" : "running",
      }));
      if (total > 0) {
        cb.setProgress((prev) => {
          const contribution = (completed / total) * 25;
          return Math.max(prev, contribution);
        });
      }
      break;
    }
    case "factor_complete": {
      cb.setFactorProgress((prev) => ({
        ...prev,
        [event.factor]: "done",
      }));
      cb.setProgress((prev) => Math.min(prev + 25, 100));
      break;
    }
    case "scan_complete": {
      cb.setResults(event.top);
      cb.setIsComplete(true);
      cb.setScanStatus("complete");
      cb.setProgress(() => 100);
      break;
    }
    case "scan_error": {
      cb.setErrorMessage(event.message);
      cb.setIsComplete(true);
      cb.setScanStatus("error");
      break;
    }
  }
}
