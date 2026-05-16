#!/usr/bin/env bash
# dashboard/scripts/init-first-run.sh
# -------------------------------------
# Idempotent first-run setup for the TradingAgents Dashboard.
# Safe to re-run — existing files and environments are not overwritten.
#
# What it does:
#   1. Checks Python 3.12+, Node 20+, pnpm
#   2. Copies .env.example → .env (if .env is absent)
#   3. Creates backend Python venv and installs requirements
#   4. Runs Alembic migrations
#   5. Installs frontend Node dependencies
#   6. Prints the bearer token
#
# Usage:
#   cd dashboard && bash scripts/init-first-run.sh

set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[init]${RESET} $*"; }
success() { echo -e "${GREEN}[init]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[init]${RESET} $*"; }
error()   { echo -e "${RED}[init] ERROR:${RESET} $*" >&2; }
die()     { error "$*"; exit 1; }

# ── Resolve paths ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${DASHBOARD_DIR}/backend"
FRONTEND_DIR="${DASHBOARD_DIR}/frontend"

# ── Helper: version comparison ─────────────────────────────────────────────
# Returns 0 if actual >= required
version_gte() {
    local actual="$1" required="$2"
    printf '%s\n%s\n' "${required}" "${actual}" | sort -V | head -1 | grep -q "^${required}$"
}

# ============================================================
# STEP 1 — Dependency checks
# ============================================================
info "Checking system requirements…"

# Python 3.12+
if ! command -v python3 &>/dev/null; then
    die "python3 not found. Install Python 3.12 or later from https://python.org"
fi
PYTHON_VERSION="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
if ! version_gte "${PYTHON_VERSION}" "3.12"; then
    die "Python 3.12+ required (found ${PYTHON_VERSION}). Please upgrade Python."
fi
success "Python ${PYTHON_VERSION} ✓"

# Node 20+
if ! command -v node &>/dev/null; then
    die "node not found. Install Node.js 20 or later from https://nodejs.org"
fi
NODE_VERSION="$(node --version | sed 's/^v//')"
NODE_MAJOR="${NODE_VERSION%%.*}"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
    die "Node 20+ required (found v${NODE_VERSION}). Please upgrade Node.js."
fi
success "Node v${NODE_VERSION} ✓"

# pnpm
if ! command -v pnpm &>/dev/null; then
    warn "pnpm not found."
    read -r -p "    Install pnpm globally now? [Y/n] " answer
    answer="${answer:-Y}"
    if [[ "${answer}" =~ ^[Yy]$ ]]; then
        npm install -g pnpm
        success "pnpm installed ✓"
    else
        die "pnpm is required. Install it with: npm install -g pnpm"
    fi
else
    PNPM_VERSION="$(pnpm --version)"
    success "pnpm ${PNPM_VERSION} ✓"
fi

# ============================================================
# STEP 2 — Create .env from .env.example
# ============================================================
info "Setting up environment file…"

if [[ ! -f "${DASHBOARD_DIR}/.env" ]]; then
    if [[ ! -f "${DASHBOARD_DIR}/.env.example" ]]; then
        die ".env.example not found at ${DASHBOARD_DIR}/.env.example"
    fi
    cp "${DASHBOARD_DIR}/.env.example" "${DASHBOARD_DIR}/.env"
    success "Created ${DASHBOARD_DIR}/.env from .env.example"
    info "Edit ${DASHBOARD_DIR}/.env to add your LLM API keys."
else
    info ".env already exists — skipping copy."
fi

# ============================================================
# STEP 3 — Backend Python venv + dependencies
# ============================================================
info "Setting up backend Python environment…"

VENV_DIR="${BACKEND_DIR}/.venv"
REQUIREMENTS="${BACKEND_DIR}/requirements.txt"

if [[ ! -f "${REQUIREMENTS}" ]]; then
    die "backend/requirements.txt not found. Is the backend code present?"
fi

if [[ ! -d "${VENV_DIR}" ]]; then
    info "Creating Python virtual environment at backend/.venv …"
    python3 -m venv "${VENV_DIR}"
    success "Virtual environment created ✓"
else
    info "backend/.venv already exists — skipping venv creation."
fi

info "Installing backend Python dependencies…"
"${VENV_DIR}/bin/pip" install --quiet --upgrade pip
"${VENV_DIR}/bin/pip" install --quiet -r "${REQUIREMENTS}"
success "Backend dependencies installed ✓"

# ============================================================
# STEP 4 — Alembic database migrations
# ============================================================
info "Running database migrations (alembic upgrade head)…"

ALEMBIC_BIN="${VENV_DIR}/bin/alembic"
if [[ ! -f "${ALEMBIC_BIN}" ]]; then
    warn "alembic not found in venv — skipping migration. Run manually if needed."
else
    # Ensure the data directory exists for the SQLite file
    mkdir -p "${BACKEND_DIR}/data"
    (cd "${BACKEND_DIR}" && "${ALEMBIC_BIN}" upgrade head)
    success "Database migrations applied ✓"
fi

# ============================================================
# STEP 5 — Frontend Node dependencies
# ============================================================
info "Setting up frontend Node dependencies…"

if [[ ! -d "${FRONTEND_DIR}" ]]; then
    warn "frontend/ directory not found — skipping Node setup."
elif [[ ! -f "${FRONTEND_DIR}/package.json" ]]; then
    warn "frontend/package.json not found — skipping Node setup."
elif [[ ! -d "${FRONTEND_DIR}/node_modules" ]]; then
    info "Installing frontend dependencies (pnpm install)…"
    (cd "${FRONTEND_DIR}" && pnpm install)
    success "Frontend dependencies installed ✓"
else
    info "frontend/node_modules already exists — skipping pnpm install."
fi

# ============================================================
# STEP 6 — Print bearer token
# ============================================================
TOKEN_FILE="${BACKEND_DIR}/data/.token"

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}   TradingAgents Dashboard — Setup Complete${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if [[ -f "${TOKEN_FILE}" ]]; then
    TOKEN="$(cat "${TOKEN_FILE}")"
    echo -e "${GREEN}Bearer token:${RESET} ${TOKEN}"
    echo ""
    echo "  Add to your .env:  DASHBOARD_API_TOKEN=${TOKEN}"
else
    info "Bearer token will be generated when the backend starts for the first time."
    echo "  Run 'make backend' then 'make token' to retrieve it."
fi

echo ""
echo -e "  ${CYAN}Start dev servers:${RESET}  cd dashboard && make dev"
echo -e "  ${CYAN}Backend only:${RESET}        make backend"
echo -e "  ${CYAN}Frontend only:${RESET}       make frontend"
echo ""
