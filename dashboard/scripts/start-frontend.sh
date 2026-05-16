#!/usr/bin/env bash
# dashboard/scripts/start-frontend.sh
# -----------------------------------
# Single-instance guard for the Next.js dev server.
#
# Refuses to start if:
#   • Port 3000 is already in LISTEN state
#   • Another `next dev` process is already running with cwd = our frontend dir
#
# When it does start, the server runs in its OWN process group (setsid via
# `set -m`) so a single `kill -TERM -<PGID>` reaps the entire tree —
# next-server, postcss/Tailwind workers, swc workers, and child sockets.
# This prevents the orphan worker fork-bomb (3990+ processes) we hit before.
#
# Usage:
#   bash scripts/start-frontend.sh         # blocks in foreground
#   bash scripts/start-frontend.sh --bg    # forks to background, prints PGID
#
# Stop with:  bash scripts/stop-frontend.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${DASHBOARD_DIR}/frontend"
PGID_FILE="${DASHBOARD_DIR}/.frontend.pgid"
LOG_FILE="${DASHBOARD_DIR}/.frontend.log"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RESET='\033[0m'

# ── Single-instance check 1: port held? ───────────────────────────────────
if lsof -nP -i ":${FRONTEND_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    holder_pid=$(lsof -nP -i ":${FRONTEND_PORT}" -sTCP:LISTEN -t 2>/dev/null | head -1)
    echo -e "${RED}[frontend]${RESET} Port ${FRONTEND_PORT} already in use (PID ${holder_pid:-unknown})." >&2
    echo -e "${YELLOW}[frontend]${RESET} If this is a previous dev server, run: bash scripts/stop-frontend.sh" >&2
    exit 1
fi

# ── Single-instance check 2: matching next dev process anywhere? ──────────
# Find any node process whose argv contains "next dev" AND whose cwd matches
# our frontend dir. lsof on /Library/Frameworks won't reach that, so use pgrep
# combined with lsof to check working directories.
running_pid=""
while IFS= read -r pid; do
    [[ -z "${pid}" ]] && continue
    # Match cwd via lsof — the `cwd` line begins with 'n' under -Fn (file name)
    proc_cwd=$(lsof -p "${pid}" -d cwd -Fn 2>/dev/null | awk '/^n/ {sub(/^n/,""); print; exit}')
    if [[ "${proc_cwd}" == "${FRONTEND_DIR}" ]]; then
        running_pid="${pid}"
        break
    fi
done < <(pgrep -f "next(-server)? dev" 2>/dev/null || true)

if [[ -n "${running_pid}" ]]; then
    echo -e "${RED}[frontend]${RESET} A 'next dev' is already running for this directory (PID ${running_pid})." >&2
    echo -e "${YELLOW}[frontend]${RESET} Stop it first: bash scripts/stop-frontend.sh" >&2
    exit 1
fi

# ── Stale PGID file? clean up ─────────────────────────────────────────────
if [[ -f "${PGID_FILE}" ]]; then
    old_pgid=$(cat "${PGID_FILE}" 2>/dev/null || echo "")
    if [[ -n "${old_pgid}" ]] && kill -0 -- "-${old_pgid}" 2>/dev/null; then
        echo -e "${YELLOW}[frontend]${RESET} Stale PGID file references live group ${old_pgid}; refusing to start." >&2
        echo -e "${YELLOW}[frontend]${RESET} Run: bash scripts/stop-frontend.sh" >&2
        exit 1
    fi
    rm -f "${PGID_FILE}"
fi

# ── Pre-flight ────────────────────────────────────────────────────────────
if [[ ! -d "${FRONTEND_DIR}/node_modules" ]]; then
    echo -e "${RED}[frontend]${RESET} node_modules missing. Run 'pnpm install' first." >&2
    exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
    echo -e "${RED}[frontend]${RESET} pnpm not found in PATH." >&2
    exit 1
fi

# ── Launch in its own process group ───────────────────────────────────────
# We use a tiny Python wrapper to call os.setsid() before execvp — this
# works portably on macOS and Linux regardless of whether the parent shell
# has job control enabled (set -m fails in non-interactive bash on macOS,
# so we don't rely on it). The child becomes its own session leader and
# thus its own process group leader, so PGID == child's PID. That lets
# `kill -- -<PGID>` reap the entire next/postcss/swc worker tree.

if ! command -v python3 >/dev/null 2>&1; then
    echo -e "${RED}[frontend]${RESET} python3 is required to spawn with a fresh session." >&2
    exit 1
fi

SETSID_WRAPPER="${SCRIPT_DIR}/_setsid_spawn.py"
if [[ ! -f "${SETSID_WRAPPER}" ]]; then
    cat > "${SETSID_WRAPPER}" <<'PYEOF'
#!/usr/bin/env python3
"""Tiny shim: create a new session (os.setsid) then exec the given command.
The new session means the spawned process becomes its own process-group
leader. PGID == PID, so `kill -- -<PID>` reaps the whole tree."""
import os
import sys
if len(sys.argv) < 2:
    sys.exit("usage: _setsid_spawn.py <cmd> [args...]")
os.setsid()
os.execvp(sys.argv[1], sys.argv[1:])
PYEOF
    chmod +x "${SETSID_WRAPPER}"
fi

echo -e "${CYAN}[frontend]${RESET} Starting Next.js dev server on :${FRONTEND_PORT}"

cd "${FRONTEND_DIR}"

if [[ "${1:-}" == "--bg" ]]; then
    # Background mode: detach via setsid wrapper, capture PID (== PGID).
    nohup python3 "${SETSID_WRAPPER}" pnpm dev >"${LOG_FILE}" 2>&1 &
    child_pid=$!
    # Give the child a moment to call setsid().
    sleep 0.2
    pgid=$(ps -o pgid= -p "${child_pid}" 2>/dev/null | tr -d ' ' || true)
    pgid="${pgid:-${child_pid}}"
    echo "${pgid}" > "${PGID_FILE}"
    disown "${child_pid}" 2>/dev/null || true
    echo -e "${GREEN}[frontend]${RESET} Started (PID ${child_pid}, PGID ${pgid}). Logs: ${LOG_FILE}"
    echo -e "${CYAN}[frontend]${RESET} Stop: bash scripts/stop-frontend.sh"
    exit 0
fi

# Foreground mode: launch via wrapper, trap and reap the whole group.
python3 "${SETSID_WRAPPER}" pnpm dev &
child_pid=$!
sleep 0.2
pgid=$(ps -o pgid= -p "${child_pid}" 2>/dev/null | tr -d ' ' || true)
pgid="${pgid:-${child_pid}}"
echo "${pgid}" > "${PGID_FILE}"

cleanup() {
    echo -e "\n${YELLOW}[frontend]${RESET} Shutting down (PGID ${pgid})…"
    kill -TERM -- "-${pgid}" 2>/dev/null || true
    sleep 1
    kill -KILL -- "-${pgid}" 2>/dev/null || true
    rm -f "${PGID_FILE}"
    echo -e "${YELLOW}[frontend]${RESET} Done."
}
trap cleanup EXIT INT TERM

wait "${child_pid}"
