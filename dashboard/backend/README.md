# TradingAgents Dashboard Backend

FastAPI backend for the TradingAgents Dashboard. Provides REST + WebSocket APIs for running trading analyses, managing watchlists, schedules, settings, and viewing stats.

## Quick Start

```bash
cd dashboard/backend
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8787
```

On first start, a bearer token is generated and printed to stdout:

```
============================================================
  DASHBOARD_API_TOKEN: <your-token-here>
  (saved to data/.token)
============================================================
```

Copy this token — you'll need it for all API requests.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HOST` | `127.0.0.1` | Bind host |
| `PORT` | `8787` | Bind port |
| `DATA_DIR` | `./data` | Directory for DB, token, fernet key, audit log |
| `TRADINGAGENTS_RESULTS_DIR` | `~/.tradingagents/logs` | Where TradingAgents writes analysis results |

## Authentication

All `/api/*` and `/ws/*` routes require:
```
Authorization: Bearer <token>
```

WebSocket connections use `?token=<token>` query parameter.

## API Routes

### Health (unauthenticated)
- `GET /healthz` — Health check

### Watchlist
- `GET /api/watchlist` — List all watchlist items with schedules
- `POST /api/watchlist` — Add ticker `{"ticker": "AAPL"}`
- `DELETE /api/watchlist/{ticker}` — Remove ticker

### Schedules
- `GET /api/watchlist/{ticker}/schedules` — List schedules for ticker
- `POST /api/watchlist/{ticker}/schedules` — Create schedule `{"cron_expr": "0 9 * * 1-5", "analysts": ["market", "news"]}`
- `GET /api/schedules/{id}` — Get schedule
- `PATCH /api/schedules/{id}` — Update schedule
- `DELETE /api/schedules/{id}` — Delete schedule

### Runs
- `GET /api/runs` — List runs (supports `?ticker=&status=&page=&page_size=`)
- `POST /api/runs` — Start analysis `{"ticker": "AAPL", "analysis_date": "2024-01-15", "analysts": ["market", "news", "fundamentals", "social"]}`
- `GET /api/runs/{id}` — Get run status
- `DELETE /api/runs/{id}` — Delete run record (not while running)
- `GET /api/runs/{id}/report/{section}` — Get report section
- `GET /api/runs/validate/{symbol}` — Validate ticker symbol
- `WS /ws/runs/{id}?token=<token>` — Stream run events

### Settings
- `GET /api/settings` — Current settings (secrets masked as `has_X: bool`)
- `PATCH /api/settings` — Update setting `{"key": "llm_provider", "value": "openai"}`
- `POST /api/settings/test-llm` — Test LLM connection
- `GET /api/settings/llm-options` — Available providers and models

### Stats
- `GET /api/stats/overview` — Aggregate stats
- `GET /api/stats/tokens?days=30` — Token usage per day

## WebSocket Events

Connect to `ws://localhost:8787/ws/runs/{run_id}?token=<token>`

Event types:
- `state_snapshot` — Buffered events for reconnect catch-up
- `status` — Run status change (`running`, `done`, `error`)
- `llm_start` — LLM call started
- `llm_end` — LLM call finished (includes token usage)
- `tool_start` / `tool_end` — Tool call events
- `chain_start` / `chain_end` — LangChain chain events
- `agent_action` / `agent_finish` — Agent events
- `stream_end` — Run complete, stream closed

## Running Tests

```bash
cd dashboard/backend
pip install pytest pytest-asyncio httpx
python -m pytest -q
```

## Report Sections

Valid section names for `GET /api/runs/{id}/report/{section}`:
- `market_report`
- `fundamentals_report`
- `sentiment_report`
- `news_report`
- `investment_debate_state`
- `risk_debate_state`
- `trader_investment_decision`
- `final_trade_decision`
