"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { RunWsClient, type WsStatus } from "@/lib/ws";
import type {
  AnyWsEvent,
  AgentState,
  Signal,
  WsStateSnapshot,
  WsAgentStarted,
  WsAgentCompleted,
} from "@/lib/types";

export interface RunStreamState {
  status: WsStatus;
  agents: AgentState[];
  log: AnyWsEvent[];
  decision: Signal | null;
  confidence: number | null;
  tokensIn: number;
  tokensOut: number;
  errorMessage: string | null;
  isComplete: boolean;
}

const AGENT_ORDER = [
  "Market Analyst",
  "News Analyst",
  "Social Analyst",
  "Fundamentals Analyst",
  "Bull Researcher",
  "Bear Researcher",
  "Portfolio Manager",
  "Trader",
];

// Module-level promise cache so multiple hook instances share one fetch.
let wsConfigPromise: Promise<{ wsUrl: string; token: string }> | null = null;

function getWsConfig(): Promise<{ wsUrl: string; token: string }> {
  if (!wsConfigPromise) {
    wsConfigPromise = fetch("/api/ws-config")
      .then((res) => {
        if (!res.ok) throw new Error("ws-config fetch failed");
        return res.json() as Promise<{ wsUrl: string; token: string }>;
      })
      .catch((err) => {
        // Reset so next mount can retry
        wsConfigPromise = null;
        throw err;
      });
  }
  return wsConfigPromise;
}

function getOrCreateAgent(agents: AgentState[], name: string): AgentState[] {
  if (agents.some((a) => a.name === name)) return agents;
  return [
    ...agents,
    {
      name,
      status: "pending",
    },
  ];
}

function sortAgents(agents: AgentState[]): AgentState[] {
  return [...agents].sort((a, b) => {
    const ai = AGENT_ORDER.indexOf(a.name);
    const bi = AGENT_ORDER.indexOf(b.name);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export function useRunStream(runId: string | null): RunStreamState {
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [log, setLog] = useState<AnyWsEvent[]>([]);
  const [decision, setDecision] = useState<Signal | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [tokensIn, setTokensIn] = useState(0);
  const [tokensOut, setTokensOut] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const clientRef = useRef<RunWsClient | null>(null);

  const handleEvent = useCallback((event: AnyWsEvent) => {
    setLog((prev) => [...prev.slice(-500), event]);

    switch (event.type) {
      case "state_snapshot": {
        const snap = event as WsStateSnapshot;
        setAgents(sortAgents(snap.agents));
        // Replay buffered log
        setLog((snap.log as AnyWsEvent[]).slice(-500));
        break;
      }
      case "agent_started": {
        const ev = event as WsAgentStarted;
        setAgents((prev) => {
          const list = getOrCreateAgent(prev, ev.agent);
          return sortAgents(
            list.map((a) =>
              a.name === ev.agent
                ? { ...a, status: "running", started_at: ev.timestamp, status_text: "Running…" }
                : a
            )
          );
        });
        break;
      }
      case "agent_completed": {
        const ev = event as WsAgentCompleted;
        setAgents((prev) =>
          sortAgents(
            prev.map((a) =>
              a.name === ev.agent
                ? { ...a, status: "done", duration_s: ev.duration_s, status_text: "Complete" }
                : a
            )
          )
        );
        break;
      }
      case "agent_message": {
        // Status text update for running agent
        const ev = event as { type: "agent_message"; agent: string; content: string; timestamp: string };
        setAgents((prev) =>
          prev.map((a) =>
            a.name === ev.agent && a.status === "running"
              ? { ...a, status_text: ev.content.slice(0, 60) }
              : a
          )
        );
        break;
      }
      case "token_usage": {
        const ev = event as { type: "token_usage"; in: number; out: number; timestamp: string };
        setTokensIn((t) => t + ev.in);
        setTokensOut((t) => t + ev.out);
        break;
      }
      case "run_completed": {
        const ev = event as { type: "run_completed"; decision: Signal; confidence: number; timestamp: string };
        setDecision(ev.decision);
        setConfidence(ev.confidence);
        setIsComplete(true);
        setAgents((prev) =>
          prev.map((a) => (a.status === "pending" ? { ...a, status: "done" } : a))
        );
        break;
      }
      case "run_error": {
        const ev = event as { type: "run_error"; message: string; timestamp: string };
        setErrorMessage(ev.message);
        setIsComplete(true);
        break;
      }
    }
  }, []);

  useEffect(() => {
    if (!runId) return;

    let cancelled = false;

    // Fetch ws-config from the BFF (server-side token, never in client bundle).
    // Module-level promise cache prevents duplicate fetches.
    getWsConfig()
      .then(({ wsUrl, token }) => {
        if (cancelled) return;
        // Connect directly to the backend WebSocket — no Next.js proxy needed.
        // The BFF only served the token; the actual WS upgrade goes straight
        // to the backend which already has CORS configured for localhost:3000.
        const url = `${wsUrl}/ws/runs/${runId}?token=${encodeURIComponent(token)}`;
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
  }, [runId, handleEvent]);

  return {
    status: wsStatus,
    agents,
    log,
    decision,
    confidence,
    tokensIn,
    tokensOut,
    errorMessage,
    isComplete,
  };
}
