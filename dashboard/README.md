# TradingAgents Dashboard

A glassmorphism-styled web dashboard that wraps the [TradingAgents](../README.md) engine with a full browser UI. Manage your watchlist, trigger on-demand or scheduled analyses, watch agent reasoning stream in real time, browse historical reports, and configure LLM providers — all without touching the CLI.

---

## Architecture

```
Browser (localhost:3000)
        │
        │  HTTPS / WebSocket
        ▼
┌───────────────────────┐
│   Next.js Frontend    │  TypeScript, Tailwind, shadcn/ui
│   (pnpm dev / SSR)    │  Glassmorphism UI, SSE streaming
└──────────┬────────────┘
           │  BFF proxy  (server-side only, bearer token)
           │  REST + SSE
           ▼
┌───────────────────────┐
│   FastAPI Backend     │  Python 3.12, uvicorn
│   localhost:8787      │  SQLite (watchlist, schedules, history)
│                       │  Alembic migrations
└──────────┬────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
SQLite DB    TradingAgents
(dashboard   Python engine
 .db)        (tradingagents/)
             └─ results/
```

The frontend never contacts the backend directly from the browser. All API calls flow through a Next.js BFF (Backend for Frontend) route that injects the bearer token server-side, keeping the secret off the client.

---

## Requirements

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Python | 3.12 | `python3 --version` |
| Node.js | 20 LTS | `node --version` |
| pnpm | 8+ | `npm install -g pnpm` |
| Docker + Compose | 24+ | Optional — for containerised setup |

Ollama is optional; configure `OLLAMA_BASE_URL` if you want local models.

---

## Quick Start (3 commands)

```bash
cd dashboard
make setup   # install deps, run migrations, print token
make dev     # start backend (:8787) + frontend (:3000) concurrently
```

Open **http://localhost:3000**.

> First run: `make setup` copies `.env.example` → `.env`, creates the Python venv, installs all deps, and prints your bearer token.

---

## Manual Setup

Use this if you don't have `make` available.

### 1. Copy environment file

```bash
cd dashboard
cp .env.example .env
# Edit .env and add your LLM API keys
```

### 2. Backend

```bash
cd dashboard/backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head               # creates/migrates dashboard.db
```

Start the backend:

```bash
uvicorn main:app --host 127.0.0.1 --port 8787 --reload
```

### 3. Frontend

```bash
cd dashboard/frontend
pnpm install
pnpm dev                           # starts on http://localhost:3000
```

### 4. Get your bearer token

```bash
cat dashboard/backend/data/.token
```

Add it to `dashboard/.env`:
```
DASHBOARD_API_TOKEN=<token-from-above>
```

Then restart both services.

---

## Environment Variables

All variables live in `dashboard/.env` (copy from `.env.example`). The table below lists every variable, its default, and whether it is required.

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DASHBOARD_API_TOKEN` | _(auto-generated)_ | Yes | Bearer token for API authentication. Generated on first backend start and written to `backend/data/.token`. |
| `DASHBOARD_SECRET_KEY` | _(auto-generated)_ | Yes | Fernet key for encrypting stored provider API keys. Auto-generated if blank. |
| `DASHBOARD_CORS_ORIGINS` | `http://localhost:3000,...` | Yes | Comma-separated allowed CORS origins for the backend. |
| `DASHBOARD_HOST` | `127.0.0.1` | No | Host the uvicorn server binds to. |
| `DASHBOARD_PORT` | `8787` | No | Port for the FastAPI backend. |
| `DASHBOARD_DB_PATH` | `./backend/data/dashboard.db` | No | SQLite database path (relative to `dashboard/`). |
| `DASHBOARD_LOG_LEVEL` | `INFO` | No | Uvicorn log level: DEBUG, INFO, WARNING, ERROR. |
| `TRADINGAGENTS_RESULTS_DIR` | `../results` | No | Path to the TradingAgents results directory. |
| `OPENAI_API_KEY` | _(empty)_ | No | OpenAI key (can also be set via the Settings UI). |
| `ANTHROPIC_API_KEY` | _(empty)_ | No | Anthropic key. |
| `GOOGLE_API_KEY` | _(empty)_ | No | Google/Gemini key. |
| `ALPHA_VANTAGE_API_KEY` | _(empty)_ | No | Alpha Vantage key for market data. |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | No | Ollama server URL for local models. |
| `BACKEND_URL` | `http://localhost:8787` | Yes (frontend) | Server-side URL the Next.js BFF uses to reach the backend. In Docker: `http://backend:8787`. |
| `NEXT_PUBLIC_APP_NAME` | `TradingAgents` | No | Name displayed in the browser tab and UI header. |

---

## API Token

The bearer token is the only credential protecting the backend API. Keep it secret.

**Retrieve after setup:**
```bash
# Via make
make token

# Directly
cat dashboard/backend/data/.token
```

**Use in HTTP requests:**
```bash
curl -H "Authorization: Bearer <token>" http://localhost:8787/health
```

**Rotate the token** by deleting `backend/data/.token` and restarting the backend — a new token is generated automatically.

---

## Available `make` Targets

```
make help         List all targets (this output)
make setup        First-run: copy .env, install deps, migrate DB, print token
make dev          Start backend + frontend concurrently (Ctrl-C stops both)
make backend      Start FastAPI backend only
make frontend     Start Next.js frontend only
make test         Run backend pytest + frontend pnpm test
make lint         Lint backend (ruff) + frontend
make build        Production build of the frontend
make docker-up    Build Docker images and start via docker-compose
make docker-down  Stop and remove Docker containers
make token        Print the current bearer token
make clean        DESTRUCTIVE: delete venv, node_modules, and the database
```

---

## Docker Setup (Optional)

Docker Compose starts both services in isolated containers with a shared network.

```bash
# Copy and configure env first
cp dashboard/.env.example dashboard/.env

# Build and start
cd dashboard && make docker-up

# Stop
make docker-down
```

The backend container mounts:
- `./backend/data` → `/app/data` (SQLite + token file, persisted)
- `../results` → `/results` (TradingAgents output directory)

> **Note:** The Dockerfiles (`backend/Dockerfile` and `frontend/Dockerfile.dev`) are maintained by the respective service teams. If they don't exist yet, run `make dev` for the non-Docker local workflow.

---

## Production Deployment

### Frontend — Vercel

1. Push the `dashboard/frontend` directory (or the whole repo) to GitHub.
2. Import the project in Vercel; set the **root directory** to `dashboard/frontend`.
3. Add environment variables in Vercel's settings:
   ```
   BACKEND_URL=https://your-backend.fly.dev
   DASHBOARD_API_TOKEN=<your-token>
   NEXT_PUBLIC_APP_NAME=TradingAgents
   ```
4. Deploy.

### Backend — Fly.io

```bash
cd dashboard/backend
fly launch --name tradingagents-backend --dockerfile Dockerfile
fly secrets set DASHBOARD_API_TOKEN=<token> DASHBOARD_SECRET_KEY=<key>
fly volumes create data --size 1    # persist SQLite
fly deploy
```

### Backend — Railway

Click "New Service → GitHub Repo", point to `dashboard/backend/`, set the environment variables from `.env.example`, and deploy. Railway auto-detects the `Dockerfile`.

> **CORS:** After deploying the frontend, update `DASHBOARD_CORS_ORIGINS` on the backend to include your Vercel domain.

---

## Troubleshooting

### Port already in use

```
Address already in use: 127.0.0.1:8787
```

Find and stop the process using that port:
```bash
lsof -i :8787 | grep LISTEN
kill -9 <PID>
```

Change the port in `.env` (`DASHBOARD_PORT=8788`) and update `BACKEND_URL` in the frontend config.

### Ollama model not responding

Make sure Ollama is running and the model is pulled:
```bash
ollama serve                         # start the server
ollama pull <model-name>             # e.g. ollama pull llama3.2
```

Verify `OLLAMA_BASE_URL` in `.env` matches where Ollama is listening.

### Token mismatch (401 Unauthorized)

The frontend `.env` `DASHBOARD_API_TOKEN` must match the value in `backend/data/.token`.

```bash
make token                           # print the backend token
# then update DASHBOARD_API_TOKEN in dashboard/.env and restart
```

### `alembic: command not found`

Activate the backend venv first:
```bash
source dashboard/backend/.venv/bin/activate
alembic upgrade head
```

Or use the full path: `dashboard/backend/.venv/bin/alembic upgrade head`.

### `pnpm: command not found`

```bash
npm install -g pnpm
```

### Python version too old

```bash
python3 --version          # must be 3.12+
```

Install a newer Python via `pyenv`, `asdf`, or directly from https://python.org.

---

## Design Spec

The full design specification — including UI wireframes, API contract, database schema, and feature list — lives at:

```
docs/superpowers/specs/2026-05-16-dashboard-design.md
```

(relative to the repo root)
