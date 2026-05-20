"use client";

/**
 * ReportSummary
 * -------------
 * A "full briefing" view for one analysis run: pulls every report section
 * in parallel and renders them as one easy-to-scan document.
 *
 * Layout:
 *   1. Quick-jump nav (chip per available section)
 *   2. Final Trade Decision card pinned at top (the conclusion first)
 *   3. Each analyst's section as its own glass card with icon + name,
 *      markdown rendered with proper headings/lists/bold.
 *
 * Falls back to the raw text the markdown lib couldn't parse if the
 * backend returns plain text instead of markdown.
 */

import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  TrendingUp,
  Newspaper,
  MessageCircle,
  BarChart3,
  Brain,
  Wallet,
  ClipboardCheck,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { getRunReport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SignalBadge } from "@/components/signal-badge";
import { extractSignal } from "@/lib/signals";
import type { ReportSection } from "@/lib/types";

// ------------------------------------------------------------------
// Section definitions (order = display order top-to-bottom)
// ------------------------------------------------------------------
interface SectionDef {
  key: ReportSection;
  label: string;
  agent: string;
  Icon: typeof TrendingUp;
  /**
   * Section accent color theme. Matches the agent's role:
   * - blue-ish for analysts (gather + reason)
   * - violet for the strategist (synthesize)
   * - emerald for the final decision (commit)
   */
  accent: "blue" | "amber" | "rose" | "emerald" | "violet" | "indigo";
}

const SECTIONS: SectionDef[] = [
  {
    key: "final_trade_decision",
    label: "Final Trade Decision",
    agent: "Portfolio Manager",
    Icon: ClipboardCheck,
    accent: "emerald",
  },
  {
    key: "trader_investment_decision",
    label: "Trader's Plan",
    agent: "Trader",
    Icon: Wallet,
    accent: "violet",
  },
  {
    key: "investment_debate_state",
    label: "Investment Debate",
    agent: "Bull vs Bear Researchers",
    Icon: Brain,
    accent: "indigo",
  },
  {
    key: "risk_debate_state",
    label: "Risk Debate",
    agent: "Risk Management Team",
    Icon: Brain,
    accent: "amber",
  },
  {
    key: "market_report",
    label: "Market Analysis",
    agent: "Market Analyst",
    Icon: TrendingUp,
    accent: "blue",
  },
  {
    key: "news_report",
    label: "News Analysis",
    agent: "News Analyst",
    Icon: Newspaper,
    accent: "amber",
  },
  {
    key: "sentiment_report",
    label: "Social Sentiment",
    agent: "Social Analyst",
    Icon: MessageCircle,
    accent: "rose",
  },
  {
    key: "fundamentals_report",
    label: "Fundamentals",
    agent: "Fundamentals Analyst",
    Icon: BarChart3,
    accent: "indigo",
  },
];

const ACCENT_CLASSES: Record<
  SectionDef["accent"],
  { border: string; bg: string; chip: string; icon: string }
> = {
  blue:    { border: "border-sky-400/20",    bg: "bg-sky-500/[0.04]",     chip: "bg-sky-500/[0.12] text-sky-300 border-sky-400/30",         icon: "text-sky-400" },
  amber:   { border: "border-amber-400/20",  bg: "bg-amber-500/[0.04]",   chip: "bg-amber-500/[0.12] text-amber-300 border-amber-400/30",   icon: "text-amber-400" },
  rose:    { border: "border-rose-400/20",   bg: "bg-rose-500/[0.04]",    chip: "bg-rose-500/[0.12] text-rose-300 border-rose-400/30",      icon: "text-rose-400" },
  indigo:  { border: "border-indigo-400/20", bg: "bg-indigo-500/[0.04]",  chip: "bg-indigo-500/[0.12] text-indigo-300 border-indigo-400/30",icon: "text-indigo-400" },
  violet:  { border: "border-violet-400/20", bg: "bg-violet-500/[0.04]",  chip: "bg-violet-500/[0.12] text-violet-300 border-violet-400/30",icon: "text-violet-400" },
  emerald: { border: "border-emerald-400/30",bg: "bg-emerald-500/[0.06]", chip: "bg-emerald-500/[0.15] text-emerald-300 border-emerald-400/40",icon: "text-emerald-400" },
};

// ------------------------------------------------------------------
// Section loading state
// ------------------------------------------------------------------
type SectionState =
  | { status: "loading" }
  | { status: "missing" }   // 404 → backend has no file for this section
  | { status: "error"; message: string }
  | { status: "ok"; content: string };

interface ReportSummaryProps {
  runId: string;
  /** Optional whitelist — if provided, only these sections render. */
  availableSections?: ReportSection[];
}

export function ReportSummary({ runId, availableSections }: ReportSummaryProps) {
  const sections = availableSections
    ? SECTIONS.filter((s) => availableSections.includes(s.key))
    : SECTIONS;

  // One state per section, fetched in parallel on mount.
  const [states, setStates] = useState<Record<ReportSection, SectionState>>(
    () =>
      Object.fromEntries(
        sections.map((s) => [s.key, { status: "loading" } as SectionState])
      ) as Record<ReportSection, SectionState>
  );

  useEffect(() => {
    let cancelled = false;
    sections.forEach((s) => {
      getRunReport(runId, s.key).then(
        (content) => {
          if (cancelled) return;
          setStates((prev) => ({ ...prev, [s.key]: { status: "ok", content } }));
        },
        (e: Error) => {
          if (cancelled) return;
          // Treat as "missing" (silently hide) when:
          //  - 404 Not Found
          //  - 400 Invalid section (backend allow-list mismatch — possible
          //    if upstream tradingagents renamed something)
          //  - "no file" / "empty" hints
          // Anything else (5xx, network, parse) surfaces as an error.
          const msg = e.message ?? "";
          const isMissing =
            /404|not.?found|invalid section|no such|empty/i.test(msg);
          setStates((prev) => ({
            ...prev,
            [s.key]: isMissing
              ? { status: "missing" }
              : { status: "error", message: msg },
          }));
        }
      );
    });
    return () => {
      cancelled = true;
    };
    // Re-fetch only if runId changes (sections derived from props above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Only show sections that returned content (or are still loading).
  // Missing sections (404) are filtered out of the nav AND the body.
  const visible = sections.filter((s) => {
    const st = states[s.key];
    return st.status !== "missing";
  });

  if (visible.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-4">
        No analyst reports were saved for this run.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick-jump nav */}
      <nav
        aria-label="Jump to report section"
        className="flex flex-wrap gap-1.5"
      >
        {visible.map((s) => {
          const a = ACCENT_CLASSES[s.accent];
          const st = states[s.key];
          const loading = st.status === "loading";
          return (
            <a
              key={s.key}
              href={`#section-${s.key}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                a.chip,
                loading && "opacity-60"
              )}
            >
              <s.Icon size={11} className={a.icon} aria-hidden="true" />
              {s.label}
              {loading && <Loader2 size={10} className="animate-spin" />}
            </a>
          );
        })}
      </nav>

      {/* Section cards */}
      {visible.map((s) => {
        const a = ACCENT_CLASSES[s.accent];
        const st = states[s.key];
        return (
          <section
            key={s.key}
            id={`section-${s.key}`}
            aria-label={s.label}
            className={cn(
              "scroll-mt-20 rounded-[14px] border backdrop-blur-md p-5",
              a.border,
              a.bg
            )}
          >
            {/* Section header — agent name + a SignalBadge derived from the
                section content. For debate states we pull the verdict from
                the parsed JSON; for narrative sections we scan the markdown
                for an explicit Recommendation/Rating/Decision marker, then
                fall back to last-occurring stance vocabulary. */}
            <header className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5 min-w-0">
                <s.Icon size={16} className={cn("shrink-0", a.icon)} aria-hidden="true" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-100">{s.label}</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">{s.agent}</p>
                </div>
              </div>
              {/* Always render the badge once content loads — when no
                  stance can be derived from the text it shows the neutral
                  '—' chip rather than disappearing, so the user sees
                  visual consistency across all sections. SignalBadge
                  itself handles the null fallback internally. */}
              {st.status === "ok" && (
                <SignalBadge
                  signal={deriveSectionSignal(s.key, st.content)}
                  size="sm"
                />
              )}
            </header>

            {/* Body */}
            {st.status === "loading" && (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
                <Loader2 size={13} className="animate-spin" />
                Loading {s.label.toLowerCase()}…
              </div>
            )}

            {st.status === "error" && (
              <div className="flex items-center gap-2 text-xs text-red-400 py-3">
                <AlertTriangle size={13} />
                Failed to load: {st.message}
              </div>
            )}

            {st.status === "ok" && (
              // Debate sections (investment/risk) ship as JSON with one entry
              // per debater (bull_history, bear_history, judge_decision, …).
              // Render those as nested per-agent cards; everything else as
              // straight markdown.
              s.key.endsWith("_debate_state") ? (
                <DebateView content={st.content} kind={s.key} />
              ) : (
                <ProseMarkdown content={st.content} />
              )
            )}
          </section>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------
// Markdown renderer
// ------------------------------------------------------------------
/**
 * Markdown with our design system applied: lighter weight body text,
 * tabular numbers in code spans, restrained heading sizes that match
 * the rest of the dashboard typography.
 */
function ProseMarkdown({ content }: { content: string }) {
  return (
    <div
      className={cn(
        "text-[13px] leading-[1.75] text-slate-300",
        // Headings
        "[&_h1]:text-base [&_h1]:font-bold [&_h1]:text-slate-100 [&_h1]:mt-4 [&_h1]:mb-2",
        "[&_h2]:text-sm  [&_h2]:font-bold [&_h2]:text-slate-100 [&_h2]:mt-4 [&_h2]:mb-2",
        "[&_h3]:text-sm  [&_h3]:font-semibold [&_h3]:text-slate-200 [&_h3]:mt-3 [&_h3]:mb-1.5",
        "[&_h4]:text-[13px] [&_h4]:font-semibold [&_h4]:text-slate-200 [&_h4]:mt-2 [&_h4]:mb-1",
        // Paragraphs + lists
        "[&_p]:my-2",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul_li]:my-1",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol_li]:my-1",
        // Emphasis
        "[&_strong]:text-slate-100 [&_strong]:font-semibold",
        "[&_em]:text-slate-200 [&_em]:italic",
        // Code
        "[&_code]:rounded [&_code]:bg-white/[0.05] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:text-amber-200 [&_code]:font-mono [&_code]:tabular-nums",
        "[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:bg-black/40 [&_pre]:border [&_pre]:border-white/[0.06] [&_pre]:p-3 [&_pre]:overflow-x-auto",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-300",
        // Links
        "[&_a]:text-indigo-300 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-indigo-200",
        // Tables
        "[&_table]:w-full [&_table]:my-3 [&_table]:text-[12px] [&_table]:border-collapse",
        "[&_th]:text-left [&_th]:font-semibold [&_th]:text-slate-200 [&_th]:border-b [&_th]:border-white/[0.08] [&_th]:px-2 [&_th]:py-1.5",
        "[&_td]:border-b [&_td]:border-white/[0.04] [&_td]:px-2 [&_td]:py-1.5",
        // Blockquote
        "[&_blockquote]:border-l-2 [&_blockquote]:border-indigo-400/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-400 [&_blockquote]:my-3",
        // Horizontal rule
        "[&_hr]:my-4 [&_hr]:border-white/[0.06]"
      )}
    >
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
}

// ------------------------------------------------------------------
// Debate renderer
// ------------------------------------------------------------------
/**
 * Per-debate-role layout. The backend stores each *_debate_state as a
 * JSON object with one string field per debater plus a `judge_decision`
 * verdict. We split that into separate color-coded sub-cards so the user
 * sees who said what at a glance.
 */
interface DebateRole {
  field: string;       // key in the debate JSON
  agent: string;       // display name
  accent: SectionDef["accent"];
}

const INVESTMENT_DEBATE_ROLES: DebateRole[] = [
  { field: "judge_decision", agent: "Research Manager — Verdict", accent: "indigo" },
  { field: "bull_history",   agent: "Bull Researcher",            accent: "emerald" },
  { field: "bear_history",   agent: "Bear Researcher",            accent: "rose" },
];

const RISK_DEBATE_ROLES: DebateRole[] = [
  { field: "judge_decision",       agent: "Risk Manager — Verdict",   accent: "indigo" },
  { field: "risky_history",        agent: "Aggressive Analyst",       accent: "rose" },
  { field: "neutral_history",      agent: "Neutral Analyst",          accent: "amber" },
  { field: "safe_history",         agent: "Conservative Analyst",     accent: "blue" },
];

function DebateView({ content, kind }: { content: string; kind: string }) {
  // Try to parse the inner JSON; fall back to markdown if it's not valid JSON.
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    // Not JSON — just render as markdown so we don't drop data.
    return <ProseMarkdown content={content} />;
  }

  const roles = kind === "risk_debate_state"
    ? RISK_DEBATE_ROLES
    : INVESTMENT_DEBATE_ROLES;

  // Only render roles that actually have non-empty content.
  const populated = roles.filter((r) => {
    const v = parsed?.[r.field];
    return typeof v === "string" && v.trim().length > 0;
  });

  if (populated.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-2">
        Debate transcript was empty for this run.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {populated.map((r) => {
        const a = ACCENT_CLASSES[r.accent];
        const text = String(parsed[r.field] ?? "").trim();
        // Each debater's text gets its own signal scan so Bull/Bear/Judge
        // can show different stances side-by-side ('Bull says BUY, Bear
        // says SELL, Judge says HOLD').
        const sig = extractSignal(text);
        return (
          <div
            key={r.field}
            className={cn(
              "rounded-[10px] border p-3.5",
              a.border,
              a.bg
            )}
          >
            {/* Sub-card header mirrors the outer section header pattern:
                role chip + signal pill, separated from the body by a
                subtle bottom border so the eye reads 'header / content'
                at a glance instead of one continuous block. */}
            <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-white/[0.06]">
              <div className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1px]",
                a.chip
              )}>
                {r.agent}
              </div>
              <SignalBadge signal={sig} size="sm" />
            </div>
            <ProseMarkdown content={text} />
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------
// Per-section signal derivation
// ------------------------------------------------------------------
/**
 * Decide what SignalBadge to show in a section header.
 *
 * For *_debate_state sections the content is a JSON envelope —
 * pull the judge's verdict text and scan that. For narrative sections
 * (markdown), scan the whole content. extractSignal() handles the
 * "Recommendation: X" marker + last-occurring vocabulary fallback.
 *
 * Returns null when nothing recognisable is found, so the header
 * gracefully renders no pill instead of a misleading guess.
 */
function deriveSectionSignal(
  sectionKey: string,
  content: string,
): import("@/lib/types").Signal | null {
  if (sectionKey.endsWith("_debate_state")) {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const verdict = parsed["judge_decision"];
      if (typeof verdict === "string") {
        return extractSignal(verdict);
      }
    } catch {
      // Not JSON — fall through to scanning the raw text below.
    }
  }
  return extractSignal(content);
}
