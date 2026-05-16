# TradingAgents Dashboard — Makefile
# ====================================
# All paths are relative to this file (dashboard/).
# Run from the dashboard/ directory, or use -C from the repo root:
#   make -C dashboard <target>

.DEFAULT_GOAL := help
SHELL         := bash

# ── Paths ────────────────────────────────────────────────────────────────────
DASHBOARD_DIR  := $(dir $(realpath $(firstword $(MAKEFILE_LIST))))
BACKEND_DIR    := $(DASHBOARD_DIR)backend
FRONTEND_DIR   := $(DASHBOARD_DIR)frontend
VENV           := $(BACKEND_DIR)/.venv
PYTHON         := $(VENV)/bin/python
PIP            := $(VENV)/bin/pip
UVICORN        := $(VENV)/bin/uvicorn
ALEMBIC        := $(VENV)/bin/alembic
RUFF           := $(VENV)/bin/ruff
PYTEST         := $(VENV)/bin/pytest
TOKEN_FILE     := $(BACKEND_DIR)/data/.token

# Load .env if present (exports are available in recipes)
-include $(DASHBOARD_DIR).env
export

.PHONY: help setup dev backend frontend frontend-stop test lint build \
        docker-up docker-down clean token hooks gitignore-audit

# ── help ─────────────────────────────────────────────────────────────────────
help: ## List all available make targets with descriptions
	@echo ""
	@echo "TradingAgents Dashboard — available targets"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Quick start:"
	@echo "  make setup   # first-time install"
	@echo "  make dev     # start both services (Ctrl-C to stop)"
	@echo ""

# ── setup ────────────────────────────────────────────────────────────────────
setup: ## First-run: copy .env, install deps, run migrations, print token
	@bash $(DASHBOARD_DIR)scripts/init-first-run.sh

# ── dev ──────────────────────────────────────────────────────────────────────
dev: ## Start backend + frontend concurrently (Ctrl-C to stop both)
	@bash $(DASHBOARD_DIR)scripts/dev.sh

# ── backend ──────────────────────────────────────────────────────────────────
backend: ## Start the FastAPI backend only (uvicorn --reload)
	@echo "Starting backend on http://$${DASHBOARD_HOST:-127.0.0.1}:$${DASHBOARD_PORT:-8787} …"
	@cd $(BACKEND_DIR) && \
		$(UVICORN) main:app \
			--host "$${DASHBOARD_HOST:-127.0.0.1}" \
			--port "$${DASHBOARD_PORT:-8787}" \
			--reload \
			--log-level "$${DASHBOARD_LOG_LEVEL:-info}"

# ── frontend ─────────────────────────────────────────────────────────────────
frontend: ## Start Next.js dev (single-instance guard; refuses if already running)
	@bash $(DASHBOARD_DIR)scripts/start-frontend.sh

frontend-stop: ## Stop the Next.js dev server + reap orphan postcss/swc workers
	@bash $(DASHBOARD_DIR)scripts/stop-frontend.sh

# ── hooks ────────────────────────────────────────────────────────────────────
hooks: ## Enable repo-managed git hooks (.githooks/) — runs the gitignore audit pre-commit
	@cd $(DASHBOARD_DIR).. && git config core.hooksPath .githooks
	@echo "✓ Git hooks enabled. Pre-commit will now run .githooks/pre-commit."
	@echo "  To disable later: git config --unset core.hooksPath"

gitignore-audit: ## One-off run of the gitignore audit (same check as the pre-commit hook)
	@bash $(DASHBOARD_DIR)../.githooks/pre-commit

# ── test ─────────────────────────────────────────────────────────────────────
test: ## Run backend pytest + frontend pnpm test
	@echo "=== Backend tests ==="
	@cd $(BACKEND_DIR) && $(PYTEST) tests/ -v
	@echo ""
	@echo "=== Frontend tests ==="
	@cd $(FRONTEND_DIR) && pnpm test

# ── lint ─────────────────────────────────────────────────────────────────────
lint: ## Lint backend with ruff + frontend with pnpm lint
	@echo "=== Backend lint (ruff) ==="
	@cd $(BACKEND_DIR) && $(RUFF) check .
	@echo ""
	@echo "=== Frontend lint ==="
	@cd $(FRONTEND_DIR) && pnpm lint

# ── build ────────────────────────────────────────────────────────────────────
build: ## Build frontend for production (pnpm build)
	@echo "=== Frontend production build ==="
	@cd $(FRONTEND_DIR) && pnpm build
	@echo "Backend is a pure Python process — no build step required."

# ── docker-up ────────────────────────────────────────────────────────────────
docker-up: ## Build Docker images and start both services via docker-compose
	@docker-compose -f $(DASHBOARD_DIR)docker-compose.yml up --build

# ── docker-down ──────────────────────────────────────────────────────────────
docker-down: ## Stop and remove Docker containers
	@docker-compose -f $(DASHBOARD_DIR)docker-compose.yml down

# ── token ────────────────────────────────────────────────────────────────────
token: ## Print the current bearer token (backend must have started at least once)
	@if [ -f "$(TOKEN_FILE)" ]; then \
		echo ""; \
		echo "  Bearer token: $$(cat $(TOKEN_FILE))"; \
		echo ""; \
		echo "  Use as: Authorization: Bearer <token>"; \
		echo "  Or set: DASHBOARD_API_TOKEN=$$(cat $(TOKEN_FILE))"; \
		echo ""; \
	else \
		echo "Token file not found at $(TOKEN_FILE)." >&2; \
		echo "Start the backend once (make backend) to generate it." >&2; \
		exit 1; \
	fi

# ── clean ────────────────────────────────────────────────────────────────────
clean: ## DESTRUCTIVE: remove venv, node_modules, build artefacts, and the database
	@echo ""
	@echo "\033[1;31mWARNING: This will permanently delete:\033[0m"
	@echo "  - $(VENV)"
	@echo "  - $(FRONTEND_DIR)/node_modules"
	@echo "  - $(FRONTEND_DIR)/.next"
	@echo "  - $(BACKEND_DIR)/data/dashboard.db"
	@echo "  - $(BACKEND_DIR)/__pycache__ and *.pyc files"
	@echo ""
	@read -r -p "Type 'yes' to confirm: " CONFIRM; \
	if [ "$${CONFIRM}" = "yes" ]; then \
		rm -rf $(VENV); \
		rm -rf $(FRONTEND_DIR)/node_modules; \
		rm -rf $(FRONTEND_DIR)/.next; \
		rm -f  $(BACKEND_DIR)/data/dashboard.db; \
		find $(BACKEND_DIR) -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true; \
		find $(BACKEND_DIR) -name '*.pyc' -delete 2>/dev/null || true; \
		echo "Clean complete."; \
	else \
		echo "Aborted."; \
	fi
