#!/usr/bin/env bash
# dashboard/scripts/dev.sh
# -------------------------
# Starts the FastAPI backend and the Next.js frontend concurrently.
# Both processes run in the foreground with colour-coded log prefixes.
# Ctrl-C shuts down both cleanly — no orphaned processes.
#
# Usage (from the dashboard/ directory):
#   bash scripts/dev.sh
#   # or via make:
#   make dev

set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

# ── Resolve paths ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${DASHBOARD_DIR}/backend"
FRONTEND_DIR="${DASHBOARD_DIR}/frontend"

# ── Helper: load .env if present ──────────────────────────────────────────
if [[ -f "${DASHBOARD_DIR}/.env" ]]; then
    # Export variables; ignore comments and blanks
    set -o allexport
    # shellcheck source=/dev/null
    source "${DASHBOARD_DIR}/.env"
    set +o allexport
fi

BACKEND_PORT="${DASHBOARD_PORT:-8787}"
FRONTEND_PORT=3000

# ── PID/PGID tracking ─────────────────────────────────────────────────────
# We kill PROCESS GROUPS not parent PIDs — Next 16 spawns dozens of
# postcss/swc/jest-worker children that survive a plain `kill PID`.
BACKEND_PGID=""
FRONTEND_PGID=""

# ── Cleanup on exit ────────────────────────────────────────────────────────
cleanup() {
    echo -e "\n${YELLOW}[dev]${RESET} Shutting down…"

    # Backend: kill its process group
    if [[ -n "${BACKEND_PGID}" ]] && kill -0 -- "-${BACKEND_PGID}" 2>/dev/null; then
        echo -e "${YELLOW}[dev]${RESET} Stopping backend group ${BACKEND_PGID}"
        kill -TERM -- "-${BACKEND_PGID}" 2>/dev/null || true
    fi

    # Frontend: defer to stop-frontend.sh which knows about workers
    bash "${SCRIPT_DIR}/stop-frontend.sh" 2>&1 | sed "s/^/  /"

    sleep 1

    # Force-kill any backend stragglers
    if [[ -n "${BACKEND_PGID}" ]] && kill -0 -- "-${BACKEND_PGID}" 2>/dev/null; then
        kill -KILL -- "-${BACKEND_PGID}" 2>/dev/null || true
    fi

    echo -e "${YELLOW}[dev]${RESET} Done."
}

trap cleanup EXIT INT TERM

# ── Prefixed log helper ────────────────────────────────────────────────────
# Reads stdin and prepends a coloured label to each line.
prefix_logs() {
    local label="$1"
    local colour="$2"
    while IFS= read -r line; do
        printf "${colour}%s${RESET} %s\n" "${label}" "${line}"
    done
}

# ── Pre-flight checks ──────────────────────────────────────────────────────
if [[ ! -d "${BACKEND_DIR}" ]]; then
    echo -e "${RED}[dev] ERROR:${RESET} backend/ directory not found at ${BACKEND_DIR}" >&2
    exit 1
fi

if [[ ! -d "${FRONTEND_DIR}" ]]; then
    echo -e "${RED}[dev] ERROR:${RESET} frontend/ directory not found at ${FRONTEND_DIR}" >&2
    exit 1
fi

if [[ ! -f "${BACKEND_DIR}/.venv/bin/uvicorn" ]]; then
    echo -e "${YELLOW}[dev] WARNING:${RESET} backend venv not found. Run 'make setup' first." >&2
fi

if [[ ! -d "${FRONTEND_DIR}/node_modules" ]]; then
    echo -e "${YELLOW}[dev] WARNING:${RESET} frontend node_modules not found. Run 'make setup' first." >&2
fi

echo -e "${CYAN}[dev]${RESET} Starting TradingAgents Dashboard"
echo -e "${CYAN}[dev]${RESET} Backend  → http://localhost:${BACKEND_PORT}"
echo -e "${CYAN}[dev]${RESET} Frontend → http://localhost:${FRONTEND_PORT}"
echo -e "${CYAN}[dev]${RESET} Press Ctrl-C to stop both services"
echo ""

# ── Single-instance guard for backend port ───────────────────────────────
if lsof -nP -i ":${BACKEND_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo -e "${RED}[dev] ERROR:${RESET} port ${BACKEND_PORT} already in use." >&2
    echo -e "${YELLOW}[dev]${RESET} Set DASHBOARD_PORT in .env or stop the other service." >&2
    exit 1
fi

# ── Start backend in its own process group ───────────────────────────────
set -m   # job control: each background pipeline gets its own PGID
(
    cd "${BACKEND_DIR}"
    UVICORN_BIN=".venv/bin/uvicorn"
    if [[ ! -f "${UVICORN_BIN}" ]]; then
        UVICORN_BIN="uvicorn"
    fi
    exec "${UVICORN_BIN}" main:app \
        --host "${DASHBOARD_HOST:-127.0.0.1}" \
        --port "${BACKEND_PORT}" \
        --reload \
        --log-level "${DASHBOARD_LOG_LEVEL:-info}"
) 2>&1 | prefix_logs "[backend]" "${GREEN}" &
BACKEND_PID=$!
BACKEND_PGID=$(ps -o pgid= -p "${BACKEND_PID}" 2>/dev/null | tr -d ' ')
BACKEND_PGID="${BACKEND_PGID:-${BACKEND_PID}}"

# ── Start frontend via guarded wrapper (refuses if already running) ──────
bash "${SCRIPT_DIR}/start-frontend.sh" --bg | prefix_logs "[frontend]" "${CYAN}"
if [[ ! -f "${DASHBOARD_DIR}/.frontend.pgid" ]]; then
    echo -e "${RED}[dev] ERROR:${RESET} frontend failed to start (no PGID file)." >&2
    exit 1
fi
FRONTEND_PGID=$(cat "${DASHBOARD_DIR}/.frontend.pgid")

echo ""
echo -e "${CYAN}[dev]${RESET} Backend  PGID ${BACKEND_PGID}"
echo -e "${CYAN}[dev]${RESET} Frontend PGID ${FRONTEND_PGID}"
echo -e "${CYAN}[dev]${RESET} Tail frontend log: tail -f ${DASHBOARD_DIR}/.frontend.log"
echo ""

set +m

# ── Wait for backend ───────────────────────────────────────────────────────
# Frontend runs detached under its own PGID file. We watch the backend
# (which prints to stdout via the pipe) and let the EXIT trap reap both.
wait "${BACKEND_PID}"
