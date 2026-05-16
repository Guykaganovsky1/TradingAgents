"use client";
import { TrendingUp, Newspaper, MessageCircle, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/en";
import type { AnalystKey } from "@/lib/types";

const ANALYSTS: {
  key: AnalystKey;
  label: string;
  Icon: typeof TrendingUp;
}[] = [
  { key: "market", label: t.analysts.market, Icon: TrendingUp },
  { key: "news", label: t.analysts.news, Icon: Newspaper },
  { key: "social", label: t.analysts.social, Icon: MessageCircle },
  { key: "fundamentals", label: t.analysts.fundamentals, Icon: BarChart3 },
];

interface AnalystToggleGroupProps {
  value: AnalystKey[];
  onChange: (value: AnalystKey[]) => void;
  disabled?: boolean;
}

export function AnalystToggleGroup({
  value,
  onChange,
  disabled,
}: AnalystToggleGroupProps) {
  function toggle(key: AnalystKey) {
    if (disabled) return;
    if (value.includes(key)) {
      // Keep at least one analyst
      if (value.length === 1) return;
      onChange(value.filter((v) => v !== key));
    } else {
      onChange([...value, key]);
    }
  }

  return (
    <div
      role="group"
      aria-label={t.run.analystsToInclude}
      className="grid grid-cols-4 gap-2"
    >
      {ANALYSTS.map(({ key, label, Icon }) => {
        const on = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            aria-label={`${label} analyst ${on ? "(enabled)" : "(disabled)"}`}
            onClick={() => toggle(key)}
            disabled={disabled}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[10px] border py-2.5 px-1 text-center transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
              "min-h-[44px]", // touch target
              on
                ? "border-indigo-400/35 bg-indigo-500/[0.08]"
                : "border-white/[0.07] bg-white/[0.03] hover:border-white/[0.12]",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <Icon
              size={16}
              aria-hidden="true"
              className={on ? "text-indigo-300" : "text-slate-500"}
            />
            <span
              className={cn(
                "text-[11px] font-medium",
                on ? "text-indigo-200" : "text-slate-500"
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
