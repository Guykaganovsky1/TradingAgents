"use client";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getRunReport } from "@/lib/api";
import type { ReportSection } from "@/lib/types";
import { t } from "@/lib/i18n/en";
import { Loader2 } from "lucide-react";

const SECTIONS: { key: ReportSection; label: string }[] = [
  { key: "market_report", label: t.history.report.market },
  { key: "news_report", label: t.history.report.news },
  { key: "social_report", label: t.history.report.social },
  { key: "fundamentals_report", label: t.history.report.fundamentals },
  { key: "investment_plan", label: t.history.report.investment_plan },
  { key: "trader_investment_plan", label: t.history.report.trader_investment_plan },
  { key: "final_trade_decision", label: t.history.report.final_trade_decision },
];

type ReportState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; content: string }
  | { status: "error"; message: string };

interface ReportTabsProps {
  runId: string;
  availableSections?: ReportSection[];
}

export function ReportTabs({ runId, availableSections }: ReportTabsProps) {
  const sections = availableSections
    ? SECTIONS.filter((s) => availableSections.includes(s.key))
    : SECTIONS;

  const [active, setActive] = useState<ReportSection>(sections[0]?.key ?? "market_report");
  const [reportState, setReportState] = useState<ReportState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setReportState({ status: "loading" });
    });
    getRunReport(runId, active).then(
      (content) => {
        if (!cancelled) setReportState({ status: "ok", content });
      },
      (e: Error) => {
        if (!cancelled) setReportState({ status: "error", message: e.message });
      }
    );
    return () => { cancelled = true; };
  }, [runId, active]);

  if (sections.length === 0) {
    return <p className="text-xs text-slate-500">No report sections available.</p>;
  }

  return (
    <div>
      {/* Tab list */}
      <div
        role="tablist"
        aria-label="Report sections"
        className="flex flex-wrap gap-1.5 mb-3"
      >
        {sections.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={active === s.key}
            onClick={() => setActive(s.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
              active === s.key
                ? "bg-indigo-500/12 border-indigo-400/30 text-indigo-200"
                : "border-transparent text-slate-500 hover:text-slate-400"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        role="tabpanel"
        aria-label={sections.find((s) => s.key === active)?.label}
        className="min-h-[120px]"
      >
        {reportState.status === "loading" && (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-8 justify-center">
            <Loader2 size={14} className="animate-spin" />
            Loading report…
          </div>
        )}
        {reportState.status === "error" && (
          <div className="text-xs text-red-400 py-4">
            Failed to load: {reportState.message}
          </div>
        )}
        {reportState.status === "ok" && (
          <div className="text-xs text-slate-400 leading-[1.8] whitespace-pre-wrap font-mono">
            {reportState.content}
          </div>
        )}
      </div>
    </div>
  );
}
