"use client";
import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateTicker } from "@/lib/api";
import { t } from "@/lib/i18n/en";

interface TickerInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidated?: (valid: boolean, displayName?: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
}

type ValidationState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "valid"; displayName: string | null }
  | { status: "invalid" };

export function TickerInput({
  value,
  onChange,
  onValidated,
  className,
  disabled,
  id,
}: TickerInputProps) {
  const [vState, setVState] = useState<ValidationState>({ status: "idle" });

  useEffect(() => {
    if (!value || value.length < 1) {
      Promise.resolve().then(() => {
        setVState({ status: "idle" });
        onValidated?.(false);
      });
      return;
    }

    Promise.resolve().then(() => setVState({ status: "validating" }));

    let cancelled = false;
    const timer = setTimeout(() => {
      validateTicker(value.toUpperCase()).then(
        (result) => {
          if (cancelled) return;
          if (result.valid) {
            setVState({ status: "valid", displayName: result.ticker ?? null });
            onValidated?.(true, result.ticker);
          } else {
            setVState({ status: "invalid" });
            onValidated?.(false);
          }
        },
        () => {
          if (!cancelled) {
            setVState({ status: "invalid" });
            onValidated?.(false);
          }
        }
      );
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const borderClass =
    vState.status === "valid"
      ? "border-emerald-400/40"
      : vState.status === "invalid"
      ? "border-red-400/40"
      : "border-white/[0.08]";

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        disabled={disabled}
        placeholder={t.watchlist.tickerLabel}
        maxLength={10}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          "w-full rounded-lg border px-3 py-2 pr-10",
          "bg-white/[0.04] text-sm text-slate-200 placeholder:text-slate-600",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
          "transition-colors duration-150",
          "text-base md:text-sm",
          borderClass,
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        aria-describedby={`${id ?? "ticker"}-status`}
        aria-invalid={vState.status === "invalid"}
      />
      {/* Status icon */}
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
        {vState.status === "validating" && (
          <Loader2 size={14} className="text-slate-500 animate-spin" />
        )}
        {vState.status === "valid" && (
          <CheckCircle2 size={14} className="text-emerald-400" />
        )}
        {vState.status === "invalid" && (
          <XCircle size={14} className="text-red-400" />
        )}
      </span>
      {/* Status text */}
      <p
        id={`${id ?? "ticker"}-status`}
        className="mt-1 text-[11px]"
        aria-live="polite"
      >
        {vState.status === "validating" && (
          <span className="text-slate-500">{t.watchlist.tickerValidating}</span>
        )}
        {vState.status === "valid" && vState.displayName && (
          <span className="text-emerald-400">
            {t.watchlist.tickerValid(vState.displayName)}
          </span>
        )}
        {vState.status === "invalid" && (
          <span className="text-red-400">{t.watchlist.tickerInvalid}</span>
        )}
      </p>
    </div>
  );
}
