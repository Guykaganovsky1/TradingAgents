"use client";
import { CheckCircle2, Circle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import type { AgentState } from "@/lib/types";

interface AgentPipelineProps {
  agents: AgentState[];
}

export function AgentPipeline({ agents }: AgentPipelineProps) {
  if (agents.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-4 text-center">
        Waiting for analysis to start…
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2" aria-label="Agent pipeline">
      {agents.map((agent) => (
        <AgentStep key={agent.name} agent={agent} />
      ))}
    </ol>
  );
}

function AgentStep({ agent }: { agent: AgentState }) {
  const { name, status, duration_s, status_text } = agent;

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 transition-all duration-200",
        status === "done" &&
          "border-emerald-400/20 bg-emerald-400/[0.02]",
        status === "running" &&
          "border-indigo-400/30 bg-indigo-500/[0.05]",
        status === "error" &&
          "border-red-400/20 bg-red-500/[0.03]",
        status === "pending" &&
          "border-white/[0.05] bg-white/[0.02] opacity-50"
      )}
    >
      {/* Icon */}
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-lg shrink-0",
          status === "done" && "bg-emerald-400/15",
          status === "running" && "bg-indigo-400/20",
          status === "error" && "bg-red-400/15",
          status === "pending" && "bg-white/[0.04]"
        )}
        aria-hidden="true"
      >
        {status === "done" && (
          <CheckCircle2 size={14} className="text-emerald-400" />
        )}
        {status === "running" && (
          <Loader2 size={14} className="text-indigo-400 animate-spin" />
        )}
        {status === "error" && (
          <AlertCircle size={14} className="text-red-400" />
        )}
        {status === "pending" && (
          <Circle size={14} className="text-slate-600" />
        )}
      </span>

      {/* Name + status */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-indigo-200 truncate">{name}</p>
        <p
          className={cn(
            "text-[11px] truncate",
            status === "done" && "text-emerald-400",
            status === "running" && "text-indigo-400",
            status === "error" && "text-red-400",
            status === "pending" && "text-slate-600"
          )}
        >
          {status_text ??
            (status === "done"
              ? "Complete"
              : status === "running"
              ? "Running…"
              : status === "error"
              ? "Error"
              : "Waiting")}
        </p>
      </div>

      {/* Duration */}
      {duration_s !== undefined && (
        <span className="shrink-0 text-[11px] text-slate-600 tabular-nums">
          {formatDuration(duration_s)}
        </span>
      )}
    </li>
  );
}
