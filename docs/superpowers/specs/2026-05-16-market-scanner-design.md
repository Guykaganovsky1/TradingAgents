# Market Scanner — Design Spec

**Status:** Approved (user signed off 2026-05-16), ready for implementation
**Owner:** Guy Kaganovsky
**Depends on:** dashboard backend + frontend (already built)

## 1. Goal

Add a **one-click market scanner** to the dashboard that returns the top 5
symbols worth running the slow multi-agent TradingAgents analysis on. The
scanner is a fast pre-filter (~20-30s wall clock) using free public data,
producing a ranked candidate list with score decomposition so the user can
trust the recommendation before committing to a 5-minute deep analysis.

## 2. Non-goals

- Real-time intraday alerts (this is on-demand only).
- Auto-trade execution.
- Paid data subscriptions (must work with free sources by default; optional Alpha Vantage key for richer news).
- Backtesting the scanner's signal quality (separate future project).

## 3. Architecture

```
dashboard/backend/services/scanner/
├── __init__.py
├── manager.py            # ScanManager singleton — orchestrates, streams progress
├── scorer.py             # Composite weighted scoring (40/30/20/10)
├── universes/
│   ├── __init__.py
│   ├── base.py           # UniverseProvider protocol
│   ├── watchlist.py      # reads dashboard.db watchlist table
│   ├── sp500.py          # Wikipedia scrape, 24h cache
│   ├── nasdaq100.py      # Wikipedia scrape, 24h cache
│   └── crypto.py         # CoinGecko free API, top 100 by 24h vol
└── factors/
    ├── __init__.py
    ├── base.py           # FactorScorer protocol; returns {score, signals}
    ├── technical.py      # RSI, MACD, vol z-score, 52w distance — uses stockstats + yfinance
    ├── news.py           # yfinance news + headline sentiment (last 24h)
    ├── sentiment.py      # Reddit r/stocks + r/wallstreetbets mention z-score
    └── fundamental.py    # P/E percentile, profit margin, D/E — yfinance .info
```

All universes return `list[ScanCandidate]`; the scorer fans out across factors
in parallel via `asyncio.gather`, then composites.

## 4. Data model (SQLite — append to dashboard.db)

```sql
CREATE TABLE scans (
  scan_id         TEXT PRIMARY KEY,           -- uuid
  universes       TEXT NOT NULL,              -- JSON list ["watchlist","sp500",...]
  top_n           INTEGER NOT NULL DEFAULT 5,
  status          TEXT NOT NULL,              -- queued | running | complete | error
  progress_pct    INTEGER NOT NULL DEFAULT 0,
  factor_progress TEXT,                       -- JSON {"technical":"done","news":"running",...}
  results         TEXT,                       -- JSON list[ScannerResult] when complete
  error_message   TEXT,
  started_at      TIMESTAMP NOT NULL,
  completed_at    TIMESTAMP,
  universe_size   INTEGER NOT NULL DEFAULT 0  -- how many distinct tickers were scored
);
CREATE INDEX idx_scans_started_at ON scans(started_at DESC);
```

Migration: `dashboard/backend/alembic/versions/0003_scans.py`.

## 5. REST + WebSocket API

All routes under `/api/scans`, auth via existing bearer token.

- `POST /api/scans` — `{universes: string[], top_n?: int, min_price?: float, min_volume_usd?: float}` → `{scan_id, ws_url}`. Rate-limited 5/min.
- `GET /api/scans?limit=20&offset=0` — paginated scan history.
- `GET /api/scans/{scan_id}` — full record incl. results when complete.
- `GET /api/scans/{scan_id}/results` — just the results JSON (sugar).
- `DELETE /api/scans/{scan_id}` — remove from history.
- `WS /ws/scans/{scan_id}` — streams events:
  ```jsonc
  {"type": "universe_built",  "universe_size": 612}
  {"type": "factor_progress", "factor": "technical", "completed": 612, "total": 612}
  {"type": "factor_complete", "factor": "technical", "duration_s": 8.1}
  {"type": "scan_complete",   "top": [...ScannerResult[]]}
  {"type": "scan_error",      "message": "..."}
  ```

## 6. Per-result schema (ScannerResult)

```jsonc
{
  "symbol": "NVDA",
  "name": "NVIDIA Corporation",
  "asset_class": "stock",                    // "stock" | "crypto"
  "composite_score": 87.2,                   // 0-100, weighted
  "rank": 1,
  "factors": {
    "technical": {
      "score": 92.0,
      "weight": 0.40,
      "signals": ["MACD bullish cross 3d ago", "Vol 2.1× 20d avg"]
    },
    "news":      { "score": 88, "weight": 0.30, "signals": ["8 articles 24h", "sentiment +0.6"] },
    "sentiment": { "score": 76, "weight": 0.20, "signals": ["r/stocks z=2.4", "r/wsb z=1.8"] },
    "fundamental":{ "score": 81, "weight": 0.10, "signals": ["P/E 38 (sector avg 45)"] }
  },
  "price": 142.30,
  "price_change_24h_pct": 3.1,
  "volume_usd_24h": 4_500_000_000,
  "suggested_analysts": ["market", "news", "social", "fundamentals"],
  "run_url": "/run?ticker=NVDA&analysts=market,news,social,fundamentals"
}
```

Crypto rows have `fundamental` score set to `null` (no fundamentals on crypto) and the composite re-normalizes the remaining weights.

## 7. Factor scoring details

### Technical (40% weight)
For each ticker fetch ~60d OHLCV (already cached by yfinance), compute:
- **RSI position score** (0-40): peak at RSI 50-70 (rising momentum). 0 at <30 or >85.
- **MACD score** (0-20): 20 if bull cross in last 5 days, 10 if uptrending, 0 if bear.
- **Volume score** (0-25): z-score of today's vol vs 20d avg, clamped 0-25.
- **52w position score** (0-15): 15 if within 5% of 52w high AND not extended; 0 if at 52w low.

Sum → 0-100. Signals list explains which clauses fired.

### News (30% weight)
For each ticker, hit yfinance `Ticker(sym).news` (free, ~10-30 articles back).
- Filter to **last 24h** by publish timestamp.
- **Article count score** (0-50): count × 10, capped at 50.
- **Sentiment score** (0-50): if Alpha Vantage key configured, use `NEWS_SENTIMENT_DATA`. Else fall back to simple keyword polarity on headlines (`upgrade`, `beat`, `surge` positive; `miss`, `lawsuit`, `downgrade` negative).

Sum → 0-100.

### Sentiment (20% weight)
- Pull mention counts from last 24h on `r/stocks` and `r/wallstreetbets` (Reddit OAuth — needs `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` env vars; if absent, factor is skipped and weights re-normalize).
- Compute z-score vs **30-day baseline** mention count for each ticker (baseline cached daily).
- z ≥ 2.0 → score 100; z 1.0 → 50; z ≤ 0 → 0.
- Crypto: also scan `r/cryptocurrency` (+optional CoinGecko trending API which is free).

### Fundamental (10% weight) — stocks only
- P/E percentile within sector → 0-50.
- Profit margin > sector median → +20.
- Debt/equity ratio in healthy band (0.3-1.5) → +20.
- Free-float quality (insider holdings 0-30%) → +10.
- Crypto: skip; composite re-normalizes to 100% across the 3 remaining factors.

## 8. Universe providers

| Provider | Source | Cache | Size |
|---|---|---|---|
| `watchlist` | dashboard.db `watchlist` table | none | user's actual list |
| `sp500` | Wikipedia "List of S&P 500 companies" table | 24h | 500 |
| `nasdaq100` | Wikipedia "Nasdaq-100" table | 24h | 100 |
| `crypto` | CoinGecko `/coins/markets` `vs_currency=usd order=volume_desc per_page=100` | 1h | 100 |

Universe cache stored in `dashboard/backend/data/scanner_cache/` (gitignored). Falls back to bundled snapshots when network fails.

## 9. Performance + reliability

- All factor scoring runs in `asyncio.gather` with per-ticker semaphore (concurrency=20) so we don't hammer free APIs.
- yfinance batch requests when possible (`yf.download(['A','B','C'])`).
- Per-ticker timeout 8s; on timeout the ticker scores `None` for that factor and the composite uses available factors (re-normalized).
- News + sentiment cached for 5 minutes (a second scan within 5min reuses results — feels instant for the user).
- Run as `asyncio.create_task` from `POST /api/scans` so the request returns immediately with the `scan_id` and the work continues in background. Same pattern as runs.
- WebSocket buffers last 50 events for reconnects.

## 10. Frontend

### New page `dashboard/frontend/src/app/(dashboard)/scan/page.tsx`
- Header with **"⚡ Scan Now"** primary button
- Universe selector: 4 toggle chips (Watchlist / S&P 500 / Nasdaq 100 / Crypto). Default: all enabled if watchlist >0 items, else just SP500+Nasdaq+Crypto.
- Top-N slider: 3 / 5 / 10 (default 5).
- Live progress region (visible during scan):
  - Universe size: `Scanning 612 symbols…`
  - Per-factor progress bars
  - Cancel button (DELETE /api/scans/{id})
- Results region (visible when complete):
  - 5 ranked cards, each showing:
    - Rank pill + asset-class badge (📈 stock / 🪙 crypto)
    - Ticker + name + price + 24h change
    - Composite score (big number) + factor breakdown bar chart (recharts)
    - Top 2 signals per factor as bullets
    - **"Run TradingAgents →"** primary button linking to `/run?ticker=X&analysts=Y`
- Scan history below: collapsed list of previous scans, click to re-display.

### Overview header CTA
Add to `(dashboard)/page.tsx` header:
```tsx
<Button asChild variant="primary" size="sm">
  <Link href="/scan?auto=1">⚡ Scan Now</Link>
</Button>
```
When `?auto=1` is present, `/scan` page auto-fires a scan on mount with defaults.

### Sidebar nav
Add `⚡ Scan` between `▶ Run Analysis` and `📋 Watchlist`.

### Hook + lib additions
- `lib/api.ts`: `startScan`, `getScan`, `listScans`, `deleteScan`
- `lib/types.ts`: `Scan`, `ScanResult`, `ScanProgressEvent`
- `hooks/use-scan-stream.ts`: WebSocket subscription with reconnect (mirror of `use-run-stream`)

## 11. Security

- All routes auth'd via existing bearer.
- CoinGecko + Wikipedia have rate limits — we use polite User-Agent + cache responsibly.
- Reddit OAuth client secret encrypted in `app_settings` like other secrets.
- yfinance/yahoo APIs: standard headers; no auth needed.

## 12. Settings additions

New `app_settings` keys (added to existing SettingsKey enum, optional):
- `reddit_client_id` (plain)
- `reddit_client_secret` (SENSITIVE — Fernet encrypted)
- `scanner_default_universes` (plain, JSON list)
- `scanner_min_price_usd` (plain, default "5")
- `scanner_min_volume_usd` (plain, default "10000000")

Settings UI gets a new "Scanner" card with:
- Reddit credentials (optional — without these, sentiment factor is skipped)
- Default universes (checkboxes)
- Min price + min volume thresholds

## 13. Tests

- `pytest dashboard/backend/tests/test_scanner_*.py`:
  - `test_scanner_universes.py` — each provider returns list, falls back on network fail
  - `test_scanner_factors.py` — each factor returns 0-100 score given mock OHLCV
  - `test_scanner_scorer.py` — composite weighting + crypto re-normalization
  - `test_scanner_endpoints.py` — POST/GET/DELETE/WS happy + auth paths
- Frontend: `pnpm typecheck && pnpm lint && pnpm build` clean.

## 14. Success criteria

1. Click "⚡ Scan Now" → progress bar appears → results within 30s.
2. Each result shows score decomposition; user can defend why it's ranked.
3. Click "Run TradingAgents →" → goes straight to `/run` pre-filled, full analysis kicks off.
4. Scan history accessible — re-display past scans without re-running.
5. Works with zero secrets (no Reddit, no Alpha Vantage) — just slightly weaker scores.
6. SP500 + Nasdaq + Crypto + watchlist combined produces deduped universe of ~700 names.
7. Backend tests pass; frontend typecheck/lint/build clean.

## 15. Open items deferred

- Backtesting whether the composite score actually predicts good TradingAgents BUY outcomes (future ML project).
- Earnings-day boosting (next-quarter earnings within 7d → +10 to news score).
- Sector-relative ranking (top 5 PER sector instead of overall).
- Auto-scheduled scans (e.g., every market open).
