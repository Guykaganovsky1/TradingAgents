"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { AnyWsEvent } from "@/lib/types";

interface StreamOutputProps {
  events: AnyWsEvent[];
  className?: string;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en", { hour12: false });
  } catch {
    return iso.slice(11, 19);
  }
}

function renderEvent(event: AnyWsEvent): {
  ts: string;
  agent?: string;
  text: string;
  variant: "normal" | "highlight" | "agent" | "error";
} | null {
  switch (event.type) {
    case "state_snapshot":
      return null; // silent
    case "agent_started":
      return {
        ts: formatTimestamp(event.timestamp),
        agent: event.agent,
        text: "started",
        variant: "agent",
      };
    case "agent_message":
      return {
        ts: formatTimestamp(event.timestamp),
        agent: event.agent,
        text: event.content,
        variant: "normal",
      };
    case "tool_call":
      return {
        ts: formatTimestamp(event.timestamp),
        text: `→ ${event.tool}(${Object.keys(event.args).join(", ")})`,
        variant: "normal",
      };
    case "agent_completed":
      return {
        ts: formatTimestamp(event.timestamp),
        agent: event.agent,
        text: `completed in ${event.duration_s.toFixed(1)}s`,
        variant: "highlight",
      };
    case "token_usage":
      return {
        ts: formatTimestamp(event.timestamp),
        text: `Tokens: +${event.in} in / +${event.out} out`,
        variant: "normal",
      };
    case "run_completed":
      return {
        ts: formatTimestamp(event.timestamp),
        text: `✓ Decision: ${event.decision} (${Math.round(event.confidence * 100)}% confidence)`,
        variant: "highlight",
      };
    case "run_error":
      return {
        ts: formatTimestamp(event.timestamp),
        text: `Error: ${event.message}`,
        variant: "error",
      };
    default:
      return null;
  }
}

export function StreamOutput({ events, className }: StreamOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Auto-scroll only if near bottom
    const distFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distFromBottom < 80) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events]);

  const lines = events.map((e, i) => ({ event: e, key: i }));

  return (
    <div
      ref={containerRef}
      role="log"
      aria-live="polite"
      aria-label="Live analysis output"
      className={cn(
        "bg-black/30 border border-white/[0.06] rounded-[10px] p-3.5 h-44 overflow-y-auto",
        "font-mono text-[11px] leading-relaxed",
        "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10",
        className
      )}
    >
      {lines.length === 0 && (
        <p className="text-slate-600">Waiting for events…</p>
      )}
      {lines.map(({ event, key }) => {
        const line = renderEvent(event);
        if (!line) return null;
        return (
          <div
            key={key}
            className="mb-1 animate-in fade-in duration-150"
          >
            <span className="text-slate-700">[{line.ts}]</span>{" "}
            {line.agent && (
              <span className="text-indigo-400 font-semibold">
                {line.agent}{" "}
              </span>
            )}
            <span
              className={cn(
                line.variant === "highlight" && "text-emerald-400",
                line.variant === "agent" && "text-slate-400",
                line.variant === "error" && "text-red-400",
                line.variant === "normal" && "text-slate-400"
              )}
            >
              {line.text}
            </span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
