"""LLM catalog: static model options + dynamic Ollama tag fetch."""
from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger("dashboard.services.llm_catalog")


# ---------------------------------------------------------------------------
# Codex extras (not in upstream model_catalog).
# The Codex API (Responses API) and Codex CLI are exposed as separate
# providers so the user can wire the coding-planner agent independently.
# ---------------------------------------------------------------------------
CODEX_EXTRAS: dict[str, dict[str, list[dict[str, str]]]] = {
    "codex": {
        "deep": [
            {"label": "GPT-5 Codex - Coding-tuned, Responses API", "value": "gpt-5-codex"},
            {"label": "GPT-5 Codex Mini - Faster, cheaper coding", "value": "gpt-5-codex-mini"},
        ],
        "quick": [
            {"label": "GPT-5 Codex Mini - Faster, cheaper coding", "value": "gpt-5-codex-mini"},
        ],
    },
    "codex-cli": {
        # The Codex CLI defaults to the model in ~/.codex/config.toml.
        # Empty string = let CLI choose; explicit values override.
        "deep": [
            {"label": "(config.toml default) - Use account's Codex model", "value": ""},
            {"label": "GPT-5 Codex - via ChatGPT Plus subscription", "value": "gpt-5-codex"},
        ],
        "quick": [
            {"label": "(config.toml default) - Use account's Codex model", "value": ""},
        ],
    },
}


def get_providers() -> list[str]:
    """Return list of known LLM providers (upstream + Codex extras)."""
    # Add project root to path to import tradingagents
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    try:
        from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS  # noqa: PLC0415
        upstream = list(MODEL_OPTIONS.keys())
    except ImportError:
        logger.warning("Could not import model_catalog; returning Codex-only provider list")
        upstream = []

    # Append Codex providers (de-duped) so they're selectable in the UI.
    for codex_provider in CODEX_EXTRAS:
        if codex_provider not in upstream:
            upstream.append(codex_provider)
    return upstream


def get_model_options() -> dict[str, dict[str, list[dict[str, str]]]]:
    """Return model options per provider and mode."""
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    try:
        from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS  # noqa: PLC0415
    except ImportError:
        logger.warning("Could not import model_catalog")
        return {}

    result: dict[str, dict[str, list[dict[str, str]]]] = {}
    for provider, modes in MODEL_OPTIONS.items():
        result[provider] = {}
        for mode, options in modes.items():
            result[provider][mode] = [
                {"label": label, "value": value} for label, value in options
            ]
    # Merge Codex extras (not in upstream catalog).
    for codex_provider, modes in CODEX_EXTRAS.items():
        if codex_provider not in result:
            result[codex_provider] = {mode: list(opts) for mode, opts in modes.items()}
    return result


async def fetch_ollama_models(base_url: str | None = None) -> list[str]:
    """Fetch available Ollama models via /api/tags endpoint."""
    import httpx  # noqa: PLC0415

    url = (base_url or "http://localhost:11434").rstrip("/") + "/api/tags"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return [m["name"] for m in data.get("models", [])]
    except Exception as exc:
        logger.warning("Could not fetch Ollama models from %s: %s", url, exc)
        return []
