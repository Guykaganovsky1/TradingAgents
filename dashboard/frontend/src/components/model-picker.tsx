"use client";
import useSWR from "swr";
import { getLlmOptions } from "@/lib/api";
import { t } from "@/lib/i18n/en";
import { cn } from "@/lib/utils";
import type { LlmOptions } from "@/lib/types";
import { Loader2 } from "lucide-react";

interface ModelPickerProps {
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}

const selectClass =
  "w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-base md:text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition-colors";

/**
 * Derive flat model list for a given provider from the backend LlmOptions shape.
 * Backend: { providers: string[], models: { [provider]: { [category]: [{id, label}] } } }
 */
function getModelsForProvider(
  options: LlmOptions | undefined,
  provider: string
): { id: string; label: string }[] {
  if (!options?.models[provider]) return [];
  // Flatten all categories into a single list
  return Object.values(options.models[provider]).flat();
}

export function ModelPicker({
  provider,
  model,
  onProviderChange,
  onModelChange,
  disabled,
}: ModelPickerProps) {
  const { data, isLoading } = useSWR<LlmOptions>(
    "/api/settings/llm-options",
    getLlmOptions,
    { revalidateOnFocus: false }
  );

  const models = getModelsForProvider(data, provider);

  function handleProviderChange(pid: string) {
    onProviderChange(pid);
    const providerModels = getModelsForProvider(data, pid);
    if (providerModels[0]) onModelChange(providerModels[0].id);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 size={12} className="animate-spin" />
        Loading providers…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-[1px] text-white/35">
          {t.run.llmProvider}
        </label>
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          disabled={disabled}
          className={cn(selectClass, disabled && "opacity-50 cursor-not-allowed")}
        >
          {(data?.providers ?? []).map((p) => (
            <option key={p} value={p}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-[1px] text-white/35">
          {t.run.model}
        </label>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={disabled || models.length === 0}
          className={cn(
            selectClass,
            (disabled || models.length === 0) && "opacity-50 cursor-not-allowed"
          )}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          {models.length === 0 && (
            <option value="">No models available</option>
          )}
        </select>
      </div>
    </div>
  );
}
