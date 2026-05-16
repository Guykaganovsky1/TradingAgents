/**
 * Typed REST client — all calls go through the Next.js /api proxy.
 * Browser never talks to backend directly.
 *
 * Zod schemas mirror dashboard/backend/models/schemas.py exactly.
 */
import { z } from "zod/v4";
import type {
  WatchlistItem,
  Schedule,
  RunDetail,
  StartRunResponse,
  OverviewStats,
  TokenDay,
  LlmOptions,
  AppSettings,
  PatchSettingsRequest,
  TestLlmRequest,
  TestLlmResponse,
  ValidateTickerResponse,
  PaginatedRuns,
  AnalystKey,
  Scan,
  ScanCreateRequest,
  StartScanResponse,
  PaginatedScans,
} from "./types";

// ---------------------------------------------------------------------------
// Zod schemas — one-to-one with backend Pydantic models
// ---------------------------------------------------------------------------

const ScheduleSchema = z.object({
  id: z.number(),
  cron_expr: z.string(),
  analysts: z.array(z.string()),
  enabled: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** WatchlistItemWithSchedules */
const WatchlistItemSchema = z.object({
  id: z.number(),
  ticker: z.string(),
  created_at: z.string(),
  schedules: z.array(ScheduleSchema).default([]),
});

/**
 * RunSummary after model_dump().
 * Backend adds: run_id (alias id), ws_url, completed_at (alias finished_at).
 * Status "done" is remapped to "complete" by model_dump.
 */
const RunSummarySchema = z.object({
  id: z.string(),
  run_id: z.string(),
  ticker: z.string(),
  analysis_date: z.string(),
  analysts: z.array(z.string()),
  status: z.enum(["queued", "running", "done", "complete", "error"]),
  decision: z.string().nullable(),
  llm_provider: z.string().nullable(),
  deep_model: z.string().nullable(),
  quick_model: z.string().nullable(),
  tokens_in: z.number(),
  tokens_out: z.number(),
  llm_calls: z.number(),
  tool_calls: z.number(),
  error_message: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  ws_url: z.string(),
});

/** GET /api/stats/overview */
const OverviewStatsSchema = z.object({
  total_runs: z.number(),
  runs_today: z.number(),
  runs_this_week: z.number(),
  success_rate: z.number(),
  decisions: z.record(z.string(), z.number()),
  avg_tokens_per_run: z.number(),
});

/** GET /api/settings */
const AppSettingsSchema = z
  .object({
    llm_provider: z.string().nullable(),
    deep_think_llm: z.string().nullable(),
    quick_think_llm: z.string().nullable(),
    backend_url: z.string().nullable(),
    output_language: z.string().nullable(),
    max_debate_rounds: z.string().nullable(),
    max_risk_discuss_rounds: z.string().nullable(),
    has_openai_key: z.boolean(),
    has_anthropic_key: z.boolean(),
    has_google_key: z.boolean(),
    // Optional fields the backend may or may not emit depending on version
    auto_save: z.boolean().optional(),
    codex_planner_enabled: z.boolean().optional(),
    codex_provider: z.string().nullable().optional(),
    codex_model: z.string().nullable().optional(),
    codex_backend_url: z.string().nullable().optional(),
    has_alpha_vantage_key: z.boolean().optional(),
    has_moonshot_key: z.boolean().optional(),
    has_kimi_key: z.boolean().optional(),
  })
  .passthrough();   // backend may return extra fields we don't model yet

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public correlationId?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<T> {
  const url = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`/api${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.detail || body.message || message;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }

  const data = await res.json();
  return schema.parse(data) as T;
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export async function getWatchlist(): Promise<WatchlistItem[]> {
  return apiFetch("/watchlist", z.array(WatchlistItemSchema));
}

export async function addToWatchlist(payload: {
  ticker: string;
  analysts?: AnalystKey[];
  notes?: string;
}): Promise<WatchlistItem> {
  return apiFetch("/watchlist", WatchlistItemSchema, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateWatchlistItem(
  ticker: string,
  payload: { analysts?: AnalystKey[]; notes?: string }
): Promise<WatchlistItem> {
  return apiFetch(`/watchlist/${ticker}`, WatchlistItemSchema, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteWatchlistItem(ticker: string): Promise<void> {
  const res = await fetch(`/api/watchlist/${ticker}`, { method: "DELETE" });
  if (!res.ok) throw new ApiError(res.status, `DELETE failed: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export async function getSchedules(ticker: string): Promise<Schedule[]> {
  return apiFetch(`/watchlist/${ticker}/schedules`, z.array(ScheduleSchema));
}

export async function addSchedule(
  ticker: string,
  payload: { cron_expr: string; enabled: boolean; analysts?: string[] }
): Promise<Schedule> {
  return apiFetch(`/watchlist/${ticker}/schedules`, ScheduleSchema, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSchedule(
  id: number,
  payload: { enabled?: boolean; cron_expr?: string; analysts?: string[] }
): Promise<Schedule> {
  return apiFetch(`/schedules/${id}`, ScheduleSchema, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteSchedule(id: number): Promise<void> {
  const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
  if (!res.ok) throw new ApiError(res.status, `DELETE failed`);
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/**
 * POST /api/runs → RunSummary (model_dump adds run_id + ws_url).
 * We accept the full RunSummary and return only {run_id, ws_url} to callers.
 */
export async function startRun(payload: {
  ticker: string;
  analysts?: AnalystKey[];
  analysis_date?: string;
  llm_provider?: string;
  llm_model?: string;
}): Promise<StartRunResponse> {
  // Build request body — analysis_date defaults to today if omitted
  const body = {
    ticker: payload.ticker,
    analysis_date: payload.analysis_date ?? new Date().toISOString().slice(0, 10),
    analysts: payload.analysts ?? ["market", "news", "social", "fundamentals"],
  };
  const run = await apiFetch("/runs", RunSummarySchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { run_id: run.run_id, ws_url: run.ws_url };
}

export async function getRuns(params?: {
  ticker?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedRuns> {
  // Backend uses page/page_size; we map from limit/offset
  const page_size = params?.limit ?? 20;
  const offset = params?.offset ?? 0;
  const page = Math.floor(offset / page_size) + 1;

  const qs = new URLSearchParams();
  if (params?.ticker) qs.set("ticker", params.ticker);
  qs.set("page", String(page));
  qs.set("page_size", String(page_size));
  const suffix = `?${qs}`;

  const schema = z.object({
    items: z.array(RunSummarySchema),
    total: z.number(),
    page: z.number(),
    page_size: z.number(),
  });
  return apiFetch(`/runs${suffix}`, schema);
}

export async function getRun(runId: string): Promise<RunDetail> {
  return apiFetch(`/runs/${runId}`, RunSummarySchema);
}

/**
 * Fetch one report section. The backend wraps every section in a JSON
 * envelope: `{run_id, section, content}` — we unwrap and return just
 * the `content` (a string: either markdown for narrative sections, or
 * a JSON-encoded object for *_debate_state sections).
 */
export async function getRunReport(
  runId: string,
  section: string
): Promise<string> {
  const res = await fetch(`/api/runs/${runId}/report/${section}`);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.text();
      try {
        detail = (JSON.parse(body) as { detail?: string }).detail ?? body;
      } catch {
        detail = body;
      }
    } catch {
      detail = "";
    }
    throw new ApiError(
      res.status,
      `Report fetch failed (${res.status}): ${detail || res.statusText}`,
    );
  }
  const body = await res.text();
  try {
    const envelope = JSON.parse(body) as { content?: string };
    return envelope.content ?? body;
  } catch {
    // Backend changed and now returns plain text? Fall through gracefully.
    return body;
  }
}

export async function deleteRun(runId: string): Promise<void> {
  const res = await fetch(`/api/runs/${runId}`, { method: "DELETE" });
  if (!res.ok) throw new ApiError(res.status, `DELETE run failed`);
}

export async function validateTicker(
  symbol: string
): Promise<ValidateTickerResponse> {
  return apiFetch(
    `/runs/validate/${symbol}`,
    z.object({
      valid: z.boolean(),
      message: z.string().optional(),
      ticker: z.string().optional(),
    })
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  return apiFetch("/settings", AppSettingsSchema);
}

/**
 * PATCH /api/settings accepts a single {key, value} pair.
 * To update multiple settings, call this multiple times.
 */
export async function patchSetting(
  payload: PatchSettingsRequest
): Promise<AppSettings> {
  return apiFetch("/settings", AppSettingsSchema, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** Convenience alias kept for compatibility */
export async function patchSettings(
  payload: PatchSettingsRequest
): Promise<AppSettings> {
  return patchSetting(payload);
}

export async function testLlm(
  payload: TestLlmRequest
): Promise<TestLlmResponse> {
  return apiFetch(
    "/settings/test-llm",
    z.object({
      ok: z.boolean(),
      message: z.string(),
      latency_ms: z.number().optional(),
    }),
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function getLlmOptions(): Promise<LlmOptions> {
  return apiFetch(
    "/settings/llm-options",
    z.object({
      providers: z.array(z.string()),
      models: z.record(
        z.string(),
        z.record(
          z.string(),
          z.array(z.object({ label: z.string(), value: z.string() }))
        )
      ),
    })
  );
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getOverviewStats(): Promise<OverviewStats> {
  return apiFetch("/stats/overview", OverviewStatsSchema);
}

export async function getTokenStats(days = 7): Promise<TokenDay[]> {
  return apiFetch(
    `/stats/tokens?days=${days}`,
    z.array(
      z.object({
        date: z.string(),
        tokens_in: z.number(),
        tokens_out: z.number(),
        runs: z.number(),
      })
    )
  );
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

const FactorScoreSchema = z.object({
  score: z.number(),
  weight: z.number(),
  signals: z.array(z.string()),
}).nullable();

const ScanResultSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  asset_class: z.enum(["stock", "crypto"]),
  composite_score: z.number(),
  rank: z.number(),
  factors: z.object({
    technical: FactorScoreSchema,
    news: FactorScoreSchema,
    sentiment: FactorScoreSchema,
    fundamental: FactorScoreSchema,
  }),
  // Price + change come from CoinGecko for crypto; stocks scraped from
  // Wikipedia have no price data attached and arrive as null. Volume is
  // already nullable for the same reason on the stock side.
  price: z.number().nullable(),
  price_change_24h_pct: z.number().nullable(),
  volume_usd_24h: z.number().nullable(),
  suggested_analysts: z.array(z.string()),
  run_url: z.string(),
});

const ScanSchema = z.object({
  scan_id: z.string(),
  universes: z.array(z.enum(["watchlist", "sp500", "nasdaq100", "crypto"])),
  top_n: z.number(),
  status: z.enum(["queued", "running", "complete", "error"]),
  progress_pct: z.number(),
  factor_progress: z.record(
    z.enum(["technical", "news", "sentiment", "fundamental"]),
    z.enum(["pending", "running", "done", "error"])
  ).nullable().optional().transform((v) => v ?? null),
  results: z.array(ScanResultSchema).nullable(),
  error_message: z.string().nullable(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
  universe_size: z.number(),
});

const StartScanResponseSchema = z.object({
  scan_id: z.string(),
  ws_url: z.string(),
});

const PaginatedScansSchema = z.object({
  items: z.array(ScanSchema),
  total: z.number(),
});

export async function startScan(body: ScanCreateRequest): Promise<StartScanResponse> {
  return apiFetch("/scans", StartScanResponseSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getScan(scanId: string): Promise<Scan> {
  return apiFetch(`/scans/${scanId}`, ScanSchema);
}

export async function listScans(limit = 20, offset = 0): Promise<PaginatedScans> {
  return apiFetch(`/scans?limit=${limit}&offset=${offset}`, PaginatedScansSchema);
}

export async function deleteScan(scanId: string): Promise<void> {
  const res = await fetch(`/api/scans/${scanId}`, { method: "DELETE" });
  if (!res.ok) throw new ApiError(res.status, `DELETE scan failed`);
}

export { ApiError };
