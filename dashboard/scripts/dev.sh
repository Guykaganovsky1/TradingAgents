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

# ── PID tracking ──────────────────────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""

# ── Cleanup on exit ────────────────────────────────────────────────────────
cleanup() {
    echo -e "\n${YELLOW}[dev]${RESET} Shutting down…"

    if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
        echo -e "${YELLOW}[dev]${RESET} Stopping backend (PID ${BACKEND_PID})"
        kill "${BACKEND_PID}" 2>/dev/null || true
    fi

    if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
        echo -e "${YELLOW}[dev]${RESET} Stopping frontend (PID ${FRONTEND_PID})"
        kill "${FRONTEND_PID}" 2>/dev/null || true
    fi

    # Give processes a moment to exit gracefully
    sleep 1

    # Force-kill any stragglers
    if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
        kill -9 "${BACKEND_PID}" 2>/dev/null || true
    fi
    if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
        kill -9 "${FRONTEND_PID}" 2>/dev/null || true
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

# ── Start backend ──────────────────────────────────────────────────────────
(
    cd "${BACKEND_DIR}"
    UVICORN_BIN=".venv/bin/uvicorn"
    if [[ ! -f "${UVICORN_BIN}" ]]; then
        UVICORN_BIN="uvicorn"
    fi
    "${UVICORN_BIN}" main:app \
        --host "${DASHBOARD_HOST:-127.0.0.1}" \
        --port "${BACKEND_PORT}" \
        --reload \
        --log-level "${DASHBOARD_LOG_LEVEL:-info}" \
        2>&1
) | prefix_logs "[backend]" "${GREEN}" &
BACKEND_PID=$!

# ── Start frontend ─────────────────────────────────────────────────────────
(
    cd "${FRONTEND_DIR}"
    PNPM_BIN="pnpm"
    if ! command -v pnpm &>/dev/null; then
        echo "pnpm not found. Install via: npm install -g pnpm" >&2
        exit 1
    fi
    "${PNPM_BIN}" dev 2>&1
) | prefix_logs "[frontend]" "${CYAN}" &
FRONTEND_PID=$!

# ── Wait for both ──────────────────────────────────────────────────────────
# Wait for whichever exits first; then trigger cleanup via the EXIT trap.
wait "${BACKEND_PID}" "${FRONTEND_PID}"
