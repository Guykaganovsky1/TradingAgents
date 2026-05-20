/**
 * signals.ts — extract a BUY / HOLD / SELL stance from free-text agent output.
 *
 * The TradingAgents pipeline emits decisions across a wider vocabulary than
 * our 3-tier dashboard signal:
 *   Buy / Overweight / Long / Bullish / Accumulate / Strong Buy → BUY
 *   Hold / Neutral / Market Weight / Maintain / Wait           → HOLD
 *   Sell / Underweight / Short / Bearish / Reduce / Strong Sell → SELL
 *
 * Each section card on /history/[runId] shows the agent's stance via a
 * SignalBadge. This module is the single place that decides what stance
 * to render — keeps the logic out of components and reusable.
 */

import type { Signal } from "@/lib/types";

const ALIASES: Record<string, Signal> = {
  // BUY family
  "buy": "BUY",
  "strong buy": "BUY",
  "strongbuy": "BUY",
  "overweight": "BUY",
  "over weight": "BUY",
  "long": "BUY",
  "bullish": "BUY",
  "bull": "BUY",
  "accumulate": "BUY",
  "add": "BUY",
  // HOLD family
  "hold": "HOLD",
  "neutral": "HOLD",
  "market weight": "HOLD",
  "marketweight": "HOLD",
  "market perform": "HOLD",
  "maintain": "HOLD",
  "wait": "HOLD",
  "watch": "HOLD",
  // SELL family
  "sell": "SELL",
  "strong sell": "SELL",
  "strongsell": "SELL",
  "underweight": "SELL",
  "under weight": "SELL",
  "short": "SELL",
  "bearish": "SELL",
  "bear": "SELL",
  "reduce": "SELL",
  "trim": "SELL",
  "exit": "SELL",
};

/**
 * Normalize a raw decision string ("Hold", "Underweight", "STRONG BUY", …)
 * to one of the three canonical signals, or null if unrecognised.
 */
export function normalizeSignal(raw: string | null | undefined): Signal | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return ALIASES[key] ?? null;
}

/**
 * Walk markdown / JSON content from an agent and try to extract their
 * conclusion. Strategy, most specific → least specific:
 *
 *   1. Look for explicit markers like '**Recommendation**: X',
 *      '**Rating**: X', '**Decision**: X', '**Action**: X'. The token
 *      after the colon is the canonical stance.
 *   2. Look for the last-occurring stance vocabulary token (BUY/SELL/HOLD
 *      and their aliases). Last-occurring biases toward conclusions
 *      written after an analysis ("…therefore, SELL.").
 *   3. Return null if nothing matched — the caller renders no pill.
 *
 * Why "last-occurring" and not "most frequent": Bull/Bear debates discuss
 * both sides extensively before reaching a verdict. Counting occurrences
 * gives the loser-by-frequency the answer, which is wrong. The last
 * stance token is almost always inside the conclusion paragraph.
 */
export function extractSignal(content: string | null | undefined): Signal | null {
  if (!content) return null;

  // Strip code fences so a code sample containing "buy" doesn't poison the
  // search. The actual report text is markdown around them; tokens we
  // care about live in prose, not inside code spans.
  const stripped = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ");

  // 1) Explicit markers. Case-insensitive, allow markdown bold around the
  //    label, optional space before the colon, and grab the stance word.
  //    We accept multi-word stances ("Strong Buy", "Market Weight") by
  //    capturing up to two trailing words then normalizing.
  const markerRegex =
    /\*{0,2}(?:recommendation|rating|decision|action|verdict|conclusion|stance|call)\*{0,2}\s*:\s*\*{0,2}([a-zA-Z ]{2,30})\*{0,2}/gi;
  let lastMarker: string | null = null;
  for (const m of stripped.matchAll(markerRegex)) {
    lastMarker = m[1] ?? null;
  }
  if (lastMarker) {
    // Try normalizing the full match first, then shrinking by trailing
    // words so 'Buy on dips' still matches 'buy'.
    const trimmed = lastMarker.trim();
    const tokens = trimmed.split(/\s+/);
    for (let n = tokens.length; n > 0; n--) {
      const sig = normalizeSignal(tokens.slice(0, n).join(" "));
      if (sig) return sig;
    }
  }

  // 2) Last-occurring vocabulary token, with word boundaries so 'sellers'
  //    and 'holdings' don't false-match.
  const vocabRegex =
    /\b(strong\s+buy|strong\s+sell|over\s*weight|under\s*weight|market\s+weight|buy|sell|hold|neutral|bullish|bearish|long|short|accumulate|reduce|trim|wait|watch|maintain|exit|bull|bear)\b/gi;
  let lastToken: string | null = null;
  for (const m of stripped.matchAll(vocabRegex)) {
    lastToken = m[1] ?? null;
  }
  if (lastToken) {
    return normalizeSignal(lastToken.replace(/\s+/g, " "));
  }

  return null;
}

/**
 * Convenience helper for the debate-state JSON sections. The judge's
 * verdict field is always 'judge_decision' but the parsed-content path
 * already strips the JSON envelope, so call sites pass the verdict text
 * directly.
 */
export function extractDebateVerdict(judgeText: string | null | undefined): Signal | null {
  return extractSignal(judgeText);
}
