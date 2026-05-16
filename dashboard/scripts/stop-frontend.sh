#!/usr/bin/env bash
# dashboard/scripts/stop-frontend.sh
# ----------------------------------
# Kills the full process group of the Next.js dev server started by
# start-frontend.sh. Also performs an aggressive sweep for any orphaned
# next/postcss/swc workers tied to our frontend directory, in case the
# server was started outside our wrapper.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${DASHBOARD_DIR}/frontend"
PGID_FILE="${DASHBOARD_DIR}/.frontend.pgid"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RESET='\033[0m'

killed_any=0

# ── 1. Kill via tracked PGID if present ───────────────────────────────────
if [[ -f "${PGID_FILE}" ]]; then
    pgid=$(cat "${PGID_FILE}" 2>/dev/null || echo "")
    if [[ -n "${pgid}" ]] && kill -0 -- "-${pgid}" 2>/dev/null; then
        echo -e "${YELLOW}[stop]${RESET} Killing process group ${pgid}…"
        kill -TERM -- "-${pgid}" 2>/dev/null || true
        sleep 1
        kill -KILL -- "-${pgid}" 2>/dev/null || true
        killed_any=1
    fi
    rm -f "${PGID_FILE}"
fi

# ── 2. Sweep for orphaned next/postcss/swc tied to our frontend dir ──────
# Use pgrep to find candidates, then verify cwd via lsof.
sweep_orphans() {
    local pattern="$1"
    while IFS= read -r pid; do
        [[ -z "${pid}" ]] && continue
        proc_cwd=$(lsof -p "${pid}" -d cwd -Fn 2>/dev/null | awk '/^n/ {sub(/^n/,""); print; exit}')
        if [[ "${proc_cwd}" == "${FRONTEND_DIR}"* ]]; then
            pgid=$(ps -o pgid= -p "${pid}" 2>/dev/null | tr -d ' ')
            if [[ -n "${pgid}" ]] && kill -0 -- "-${pgid}" 2>/dev/null; then
                echo -e "${YELLOW}[stop]${RESET} Killing orphan group ${pgid} (matched ${pattern})"
                kill -KILL -- "-${pgid}" 2>/dev/null || true
                killed_any=1
            fi
        fi
    done < <(pgrep -f "${pattern}" 2>/dev/null || true)
}

sweep_orphans "next(-server)? dev"
sweep_orphans "next/dist/build/postcss"
sweep_orphans "next/dist/compiled/jest-worker"

# ── 3. Last resort: anything still listening on port 3000 ────────────────
if lsof -nP -i ":${FRONTEND_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    while IFS= read -r pid; do
        [[ -z "${pid}" ]] && continue
        echo -e "${YELLOW}[stop]${RESET} Killing :${FRONTEND_PORT} listener PID ${pid}"
        kill -KILL "${pid}" 2>/dev/null || true
        killed_any=1
    done < <(lsof -nP -i ":${FRONTEND_PORT}" -sTCP:LISTEN -t 2>/dev/null)
fi

if [[ "${killed_any}" -eq 0 ]]; then
    echo -e "${GREEN}[stop]${RESET} Nothing to stop — no frontend processes found."
else
    echo -e "${GREEN}[stop]${RESET} Frontend stopped."
fi
