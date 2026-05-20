/**
 * Shared TypeScript types matching backend Pydantic schemas.
 * Used across components, hooks, and API layer.
 *
 * Source of truth: dashboard/backend/models/schemas.py
 */

export type Signal = "BUY" | "HOLD" | "SELL";
/** Backend RunStatus enum: queued | running | done | complete | error */
export type RunStatus = "queued" | "running" | "done" | "complete" | "error";
export type AnalystKey = "market" | "news" | "social" | "fundamentals";
/**
 * Report section keys — these MUST match the backend's report_reader
 * allow-list exactly (dashboard/backend/services/report_reader.py).
 * The backend rejects unknown keys with HTTP 400.
 *
 * Naming oddities preserved from the upstream tradingagents file layout:
 *  - sentiment_report (not social_report)
 *  - trader_investment_decision (not trader_investment_plan)
 *  - *_debate_state are structured JSON debate transcripts, not narrative
 */
export type ReportSection =
  | "market_report"
  | "news_report"
  | "sentiment_report"
  | "fundamentals_report"
  | "investment_debate_state"
  | "trader_investment_decision"
  | "risk_debate_state"
  | "final_trade_decision";

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

/**
 * Backend WatchlistItemWithSchedules response.
 * GET /api/watchlist returns: {id, ticker, created_at, schedules[]}
 */
export interface WatchlistItem {
  id: number;
  ticker: string;
  created_at: string;
  schedules: Schedule[];
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

/**
 * Backend ScheduleSummary response.
 */
export interface Schedule {
  id: number;
  cron_expr: string;
  analysts: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/**
 * Backend RunSummary response (after model_dump which adds aliases).
 * Fields from model_dump:
 *   id, ticker, analysis_date, analysts[], status, decision,
 *   llm_provider, deep_model, quick_model,
 *   tokens_in, tokens_out, llm_calls, tool_calls,
 *   error_message, started_at, finished_at, created_at,
 *   run_id (alias for id),
 *   ws_url (alias: /ws/runs/{id}),
 *   completed_at (alias for finished_at)
 */
export interface RunSummary {
  id: string;
  run_id: string; // alias for id
  ticker: string;
  analysis_date: string;
  analysts: string[];
  status: RunStatus;
  decision: string | null;
  llm_provider: string | null;
  deep_model: string | null;
  quick_model: string | null;
  tokens_in: number;
  tokens_out: number;
  llm_calls: number;
  tool_calls: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  completed_at: string | null; // alias for finished_at
  created_at: string;
  ws_url: string; // alias: /ws/runs/{id}
}

/** Kept for backward compat — same shape as RunSummary */
export type RunIndex = RunSummary;

/** Detailed run view — same shape (ws_url already present on RunSummary) */
export type RunDetail = RunSummary;

// ---------------------------------------------------------------------------
// Start-run response
// ---------------------------------------------------------------------------

/**
 * POST /api/runs returns RunSummary (model_dump).
 * The hook uses run_id and ws_url from it.
 */
export interface StartRunResponse {
  run_id: string;
  ws_url: string;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Backend StatsOverview response.
 * GET /api/stats/overview returns:
 *   {total_runs, runs_today, runs_this_week, success_rate, decisions, avg_tokens_per_run}
 */
export interface OverviewStats {
  total_runs: number;
  runs_today: number;
  runs_this_week: number;
  success_rate: number; // 0.0 – 1.0
  decisions: Record<string, number>; // BUY/SELL/HOLD counts
  avg_tokens_per_run: number;
}

/**
 * Backend TokenStats response.
 * GET /api/stats/tokens returns: {date, tokens_in, tokens_out, runs}
 */
export interface TokenDay {
  date: string;
  tokens_in: number;
  tokens_out: number;
  runs: number;
}

// ---------------------------------------------------------------------------
// LLM options
// ---------------------------------------------------------------------------

/** Backend returns models as {label, value} per category. */
export interface LlmModelOption {
  label: string;
  value: string;
}
export interface LlmOptions {
  providers: string[];
  models: Record<string, Record<string, LlmModelOption[]>>;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Backend SettingsResponse.
 * GET /api/settings returns:
 *   {llm_provider, deep_think_llm, quick_think_llm, backend_url,
 *    output_language, max_debate_rounds, max_risk_discuss_rounds,
 *    has_openai_key, has_anthropic_key, has_google_key}
 */
export interface AppSettings {
  llm_provider: string | null;
  deep_think_llm: string | null;
  quick_think_llm: string | null;
  backend_url: string | null;
  output_language: string | null;
  max_debate_rounds: string | null;
  max_risk_discuss_rounds: string | null;
  // Behaviour toggles (wired to backend defaults_config when running an analysis)
  auto_save?: boolean;
  codex_planner_enabled?: boolean;
  // Codex coding planner provider/model overrides (optional — fall back to main llm_provider)
  codex_provider?: string | null;
  codex_model?: string | null;
  codex_backend_url?: string | null;
  // Secret indicators only (never the real keys)
  has_openai_key: boolean;
  has_anthropic_key: boolean;
  has_google_key: boolean;
  has_alpha_vantage_key?: boolean;
  has_moonshot_key?: boolean;
  has_kimi_key?: boolean;
  has_opencode_key?: boolean;
}

/**
 * Backend SettingsPatch: single key-value pair.
 * PATCH /api/settings accepts: {key: SettingsKey, value: string}
 */
export interface PatchSettingsRequest {
  key: string;
  value: string;
}

export interface TestLlmRequest {
  provider: string;
  model: string;
  base_url?: string;
}

export interface TestLlmResponse {
  ok: boolean;
  message: string;
  latency_ms?: number;
}

export interface HealthResponse {
  status: "ok";
  version: string;
  uptime_seconds: number;
}

export interface ValidateTickerResponse {
  valid: boolean;
  message?: string;
  ticker?: string;
}

/**
 * Backend RunListResponse.
 * GET /api/runs returns: {items, total, page, page_size}
 */
export interface PaginatedRuns {
  items: RunSummary[];
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// WebSocket event types
// ---------------------------------------------------------------------------

export type WsEventType =
  | "state_snapshot"
  | "agent_started"
  | "tool_call"
  | "agent_message"
  | "agent_completed"
  | "token_usage"
  | "run_completed"
  | "run_error"
  | "stream_end";

export interface WsEvent {
  type: WsEventType;
  timestamp: string;
}

export interface WsStateSnapshot extends WsEvent {
  type: "state_snapshot";
  run_id: string;
  status: RunStatus;
  agents: AgentState[];
  log: WsEvent[];
}

export interface WsAgentStarted extends WsEvent {
  type: "agent_started";
  agent: string;
}

export interface WsToolCall extends WsEvent {
  type: "tool_call";
  tool: string;
  args: Record<string, unknown>;
}

export interface WsAgentMessage extends WsEvent {
  type: "agent_message";
  agent: string;
  content: string;
}

export interface WsAgentCompleted extends WsEvent {
  type: "agent_completed";
  agent: string;
  duration_s: number;
}

export interface WsTokenUsage extends WsEvent {
  type: "token_usage";
  in: number;
  out: number;
}

export interface WsRunCompleted extends WsEvent {
  type: "run_completed";
  decision: Signal;
  confidence: number;
}

export interface WsRunError extends WsEvent {
  type: "run_error";
  message: string;
}

export type AnyWsEvent =
  | WsStateSnapshot
  | WsAgentStarted
  | WsToolCall
  | WsAgentMessage
  | WsAgentCompleted
  | WsTokenUsage
  | WsRunCompleted
  | WsRunError;

export interface AgentState {
  name: string;
  status: "pending" | "running" | "done" | "error";
  started_at?: string;
  duration_s?: number;
  status_text?: string;
}

// ---------------------------------------------------------------------------
// Scanner types
// ---------------------------------------------------------------------------

export type AssetClass = "stock" | "crypto";
export type ScanStatus = "queued" | "running" | "complete" | "error";
export type FactorKey = "technical" | "news" | "sentiment" | "fundamental";
export type UniverseKey = "watchlist" | "sp500" | "nasdaq100" | "crypto";

export interface FactorScore {
  score: number;   // 0-100
  weight: number;  // 0-1
  signals: string[];
}

export interface ScanResult {
  symbol: string;
  name: string;
  asset_class: AssetClass;
  composite_score: number;
  rank: number;
  factors: Record<FactorKey, FactorScore | null>;
  price: number | null;
  price_change_24h_pct: number | null;
  volume_usd_24h: number | null;
  suggested_analysts: string[];
  run_url: string;
}

export interface Scan {
  scan_id: string;
  universes: UniverseKey[];
  top_n: number;
  status: ScanStatus;
  progress_pct: number;
  factor_progress: Partial<Record<FactorKey, "pending" | "running" | "done" | "error">> | null;
  results: ScanResult[] | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  universe_size: number;
}

export interface ScanCreateRequest {
  universes: UniverseKey[];
  top_n?: number;
  min_price?: number;
  min_volume_usd?: number;
}

export interface StartScanResponse {
  scan_id: string;
  ws_url: string;
}

export interface PaginatedScans {
  items: Scan[];
  total: number;
}

export type ScanWsEvent =
  | { type: "state_snapshot"; events: ScanWsEvent[] }
  | { type: "universe_built"; universe_size: number }
  | { type: "factor_progress"; factor: FactorKey; completed: number; total: number }
  | { type: "factor_complete"; factor: FactorKey; duration_s: number }
  | { type: "scan_complete"; top: ScanResult[] }
  | { type: "scan_error"; message: string };
