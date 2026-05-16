# TradingAgents Dashboard Verification Report
Date: 2026-05-16
Verifier: Tier-4 QA Agent (Claude Sonnet 4.6)
Branch: claude/competent-liskov-74c676
Test token: 8yVlsn437XOjAnE-A4Bst0lMpxYHQ-nGOXMgjAK-T-M

---

## 1. Executive Verdict

VERDICT: BLOCK (do not ship)

The backend is solid and passes all 45 tests. The frontend has critical API contract mismatches that cause runtime failures on every real user interaction. The Zod schemas in src/lib/api.ts do not match the backend response shapes. The WebSocket auth mechanism relies on a meta[name="ws-token"] tag that is never injected, making streaming permanently broken.

---

## 2. Quality-Gate Results

| Check | Result | Detail |
|---|---|---|
| Backend pytest | 45/45 PASS | Ran under Python 3.12 + greenlet; all tests pass in 4s |
| Backend ruff check | 0 errors | Deprecation warnings only (cosmetic) |
| Frontend typecheck | 0 errors | TypeScript compiles cleanly |
| Frontend lint | 0 errors | ESLint passes |
| Frontend build | SUCCESS | 8/8 pages generated, Turbopack 19.3s |

Note: python -m pytest returns "No tests collected" under Python 3.14 (system default) because pytest is not installed there. greenlet is also missing from the 3.12 site-packages but is required by SQLAlchemy async. After installing with uv, all 45 pass.

---

## 3. Real-Data Audit

Frontend grep results:
- mock/MOCK/dummy/stub/fake: 0 matches in production code (placeholder= HTML attributes only, legitimate)
- TODO/FIXME/HACK: 0 matches
- Lorem ipsum: 0 matches
- Hard-coded ticker arrays: 0 matches
- onClick stub handlers / href="#" / coming soon: 0 matches

Backend grep results:
- mock/fake/stub: 0 in production code
- TODO/FIXME: 1 in tests/test_security.py (test vectors, expected)
- shell=True / eval() / exec(): 0
- SQL f-string concatenation: 0 (all ORM)

VERDICT: PASS - no mock data in production code paths.

---

## 4. Connection-Test Results

Backend started at 127.0.0.1:8788 (port 8787 occupied by existing tradinggp process).

| Test | HTTP Status | Verdict |
|---|---|---|
| GET /healthz | 200 {"status":"ok","version":"0.1.0","uptime_seconds":15.4} | PASS |
| GET /api/watchlist (no auth) | 401 {"detail":"Invalid or missing authentication token"} | PASS |
| GET /api/watchlist (valid Bearer) | 200 [] | PASS |
| GET /api/watchlist (wrong Bearer) | 401 | PASS |
| GET /api/settings (valid Bearer) | 200 - only has_* booleans, no key values | PASS |
| GET /api/runs/validate/AAPL | 200 {"valid":false,"message":"Ticker validation timed out"} | PARTIAL |
| GET /api/runs/validate/AAPL; rm -rf | 200 {"valid":false,"message":"Invalid ticker format"} | PASS |

Note on validate timeout: yfinance works correctly via direct Python call (returns 184 keys for AAPL). The timeout is an asyncio issue when run_in_executor is called using get_event_loop() inside an already-running async context. See Critical Issues #2.

---

## 5. Spec-Compliance Audit

### Security (spec section 9)

| Item | Status | Evidence |
|---|---|---|
| Auth required on all /api/** | PASS | require_auth Depends on all routes |
| WebSocket auth via ?token= | PASS | api/runs.py checks token != get_api_token() and closes with code 4001 |
| Secrets Fernet-encrypted before INSERT | PASS | api/settings.py calls encrypt_secret() before upsert_setting for SENSITIVE_KEYS |
| Path traversal protection | PASS | report_reader.py: UUID regex + relative_to() containment check |
| Ticker regex ^[A-Z0-9.\-]{1,10}$ | PASS | models/schemas.py line 15 used as Pydantic validator |
| Rate limiting on POST /api/runs | FAIL | No @limiter decorator on create_run; only global 60/min applies, not spec-required 10/min |
| CORS origins not * | PASS | core/config.py: ["http://localhost:3000", "http://127.0.0.1:3000"] |

### Streaming (spec section 8)

| Item | Status | Evidence |
|---|---|---|
| RunManager buffer keeps last 200 events | PASS | run_manager.py: deque(maxlen=ws_event_buffer_size), default 200 |
| state_snapshot sent first on reconnect | PASS | api/runs.py: sends buffered events as {"type":"state_snapshot","events":buffered} |
| Background runs via asyncio.create_task | PASS | run_manager.py: asyncio.create_task() not tied to request lifecycle |

### Frontend Quality (spec sections 17/18)

| Item | Status | Evidence |
|---|---|---|
| bottom-nav.tsx exists and conditional | PASS | Uses className="... flex lg:hidden" |
| aria-live="polite" on stream output | PASS | stream-output.tsx: role="log" aria-live="polite" |
| Focus ring on interactive elements | PASS | lib/theme.ts exports focusRing; components use it |
| BUY/HOLD/SELL badges have icons | PASS | signal-badge.tsx imports TrendingUp, Minus, TrendingDown |
| components/empty-state.tsx exists | PASS | Exists and is used in history/page.tsx and watchlist/page.tsx |
| Watchlist table becomes cards <md | PASS | hidden md:block (table) + md:hidden (cards) |
| lib/theme.ts with color tokens | PASS | All design tokens defined |
| No hex literals in components/ | PARTIAL | 7 hex literals found in token-chart.tsx, bottom-nav.tsx, sidebar.tsx, decision-card.tsx |
| lib/i18n/en.ts exists | PASS | Comprehensive; 6 components import t from it |
| Real frontend wiring (all calls via BFF) | PASS | api.ts uses /api/* relative paths; BFF proxies with server-side token |

---

## 6. Critical Issues

### HIGH - Must fix before ship

ISSUE 1: Frontend-Backend API Contract Mismatch (BREAKS ALL DATA FETCHING)
Files: dashboard/frontend/src/lib/api.ts, src/lib/types.ts

The Zod schemas and TypeScript types do not match the backend response shapes. Every data fetch fails Zod validation and throws at runtime.

Watchlist:
  Frontend expects: {ticker, display_name, analysts[], added_at, last_run_id, notes, latest_decision, latest_confidence, latest_run_at}
  Backend returns:  {id, ticker, created_at, schedules[]}

Stats overview:
  Frontend expects: {active_signals, analyses_today, tokens_today, tokens_total, top_signal, buy_count, hold_count, sell_count}
  Backend returns:  {total_runs, runs_today, runs_this_week, success_rate, decisions, avg_tokens_per_run}

Start run response:
  Frontend expects: {run_id, ws_url}
  Backend returns:  RunSummary {id, ticker, analysis_date, analysts, status, decision, llm_provider, deep_model, quick_model, ...}

Settings:
  Frontend expects: {deep_think_provider, quick_think_provider, ollama_base_url, auto_save, codex_planner, has_alpha_vantage_key}
  Backend returns:  {llm_provider, deep_think_llm, quick_think_llm, output_language, max_debate_rounds, has_openai_key, has_anthropic_key, has_google_key}

Run history:
  Frontend expects: run_id, confidence, llm_model, completed_at, status="complete"
  Backend returns:  id, decision, deep_model, quick_model, finished_at, status="done"

ISSUE 2: WebSocket Token Never Delivered / WS Proxy Broken
File: dashboard/frontend/src/hooks/use-run-stream.ts lines 150-155

The hook reads token from document.querySelector('meta[name="ws-token"]') but this meta tag is never injected in any layout file. Token defaults to "" (empty string).

Additionally, lib/ws.ts constructs URL as /api/ws/runs/{runId}?token=... routing through the Next.js BFF. The BFF route.ts uses fetch() which cannot proxy WebSocket upgrades. Live streaming is broken end-to-end.

Fix options:
a) Inject token server-side in layout.tsx as a meta tag AND set up a proper WS proxy (custom Next.js server or nginx)
b) Connect browser directly to backend WS with token stored in sessionStorage (obtained via a dedicated /api/ws-token endpoint)

### MEDIUM

ISSUE 3: Rate Limit Not Applied to POST /api/runs
File: dashboard/backend/api/runs.py - create_run function
The spec requires 10/min on POST /api/runs. Only the global 60/min applies.
Fix: Add @limiter.limit(get_settings().rate_limit_runs) decorator.

ISSUE 4: Ticker Validation Always Times Out via API
File: dashboard/backend/services/ticker_validator.py line 15
Change: loop = asyncio.get_event_loop()
To:     loop = asyncio.get_running_loop()

### LOW

ISSUE 5: Hex Literals in Components (Theme Violation)
Files: token-chart.tsx, bottom-nav.tsx, sidebar.tsx, decision-card.tsx
Replace hardcoded hex values with colors.* from lib/theme.ts

ISSUE 6: Standalone Build Has Wrong Directory Structure
The .next/standalone contains the full absolute path, not a portable structure.
Fix: Add outputFileTracingRoot to next.config.ts

---

## 7. What ACTUALLY Works vs. What's Scaffolded

### Genuinely working

- Backend: all 45 tests passing; auth, watchlist CRUD, schedule CRUD, stats, Fernet encryption, path traversal protection, ticker regex, run lifecycle, WebSocket event streaming, scheduler, audit logging
- Backend CORS: locked to localhost:3000 only
- Backend security: all endpoints require Bearer token; settings GET never leaks encrypted values; WS closes with 4001 on bad token
- Frontend build: TypeScript, ESLint, Next.js all pass cleanly
- Frontend UI components: glassmorphism, aria-live stream output, signal badges with icons, empty states, responsive layout, i18n, bottom nav, theme tokens
- BFF proxy: correctly forwards requests with server-side bearer token - WORKS when BACKEND_URL and DASHBOARD_API_TOKEN env vars are set
- No mock data anywhere in production code
- Backend data files protected from git (data/ directory is gitignored)

### Broken in practice (root cause: API contract mismatch + WS token)

- Watchlist page: crashes on load - ZodError on display_name required field missing
- Overview/stats: schema mismatch - numbers never display
- Settings page: schema mismatch - settings do not load or save
- History page: field names wrong (run_id vs id, completed_at vs finished_at, complete vs done)
- Run page - live streaming: WebSocket auth broken; streaming output never receives events
- Run page - start analysis: ZodError immediately on {run_id, ws_url} expectation vs RunSummary response
- Ticker validation in UI: API returns timeout for all tickers (asyncio context bug)
