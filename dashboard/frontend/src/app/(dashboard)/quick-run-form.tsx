"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/en";

export function QuickRunForm() {
  const [ticker, setTicker] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) return;
    router.push(`/run?ticker=${encodeURIComponent(ticker.toUpperCase())}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        type="text"
        value={ticker}
        onChange={(e) => setTicker(e.target.value.toUpperCase())}
        placeholder={t.overview.quickRunPlaceholder}
        maxLength={10}
        autoCapitalize="characters"
        autoCorrect="off"
        aria-label="Ticker symbol for quick analysis"
        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-base md:text-sm text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      />
      <button
        type="submit"
        disabled={!ticker.trim()}
        className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
        }}
      >
        {t.overview.analyze}
      </button>
    </form>
  );
}
