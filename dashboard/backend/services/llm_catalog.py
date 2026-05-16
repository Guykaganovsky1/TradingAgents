"""LLM catalog: static model options + dynamic Ollama tag fetch."""
from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger("dashboard.services.llm_catalog")


def get_providers() -> list[str]:
    """Return list of known LLM providers."""
    # Add project root to path to import tradingagents
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    try:
        from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS  # noqa: PLC0415
        return list(MODEL_OPTIONS.keys())
    except ImportError:
        logger.warning("Could not import model_catalog; returning empty provider list")
        return []


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
