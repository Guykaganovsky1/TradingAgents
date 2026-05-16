"""Settings API: /api/settings + test-llm + llm-options."""
from __future__ import annotations

import contextlib
import logging
import time

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

import repos.settings as settings_repo
from api.deps import get_session, require_auth
from core.logging import get_audit_logger
from core.security import decrypt_secret, encrypt_secret
from models.schemas import (
    SENSITIVE_KEYS,
    LLMOptionsResponse,
    LLMTestRequest,
    LLMTestResponse,
    SettingsKey,
    SettingsPatch,
    SettingsResponse,
)
from services.llm_catalog import fetch_ollama_models, get_model_options, get_providers

logger = logging.getLogger("dashboard.api.settings")
router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
async def get_settings_endpoint(
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> SettingsResponse:
    """Return settings — sensitive keys appear as has_X: bool only."""
    all_settings = await settings_repo.get_all_settings(session)
    setting_map = {s.key: s for s in all_settings}

    def plain(key: str) -> str | None:
        s = setting_map.get(key)
        return s.value_plain if s else None

    def has_secret(key: str) -> bool:
        s = setting_map.get(key)
        return bool(s and s.value_encrypted)

    provider = plain(SettingsKey.llm_provider)
    deep_llm = plain(SettingsKey.deep_think_llm)
    quick_llm = plain(SettingsKey.quick_think_llm)
    auto_save_val = plain(SettingsKey.auto_save)
    codex_val = plain(SettingsKey.codex_planner_enabled)
    return SettingsResponse(
        llm_provider=provider,
        deep_think_llm=deep_llm,
        quick_think_llm=quick_llm,
        backend_url=plain(SettingsKey.backend_url),
        output_language=plain(SettingsKey.output_language),
        max_debate_rounds=plain(SettingsKey.max_debate_rounds),
        max_risk_discuss_rounds=plain(SettingsKey.max_risk_discuss_rounds),
        has_openai_key=has_secret(SettingsKey.openai_api_key),
        has_anthropic_key=has_secret(SettingsKey.anthropic_api_key),
        has_google_key=has_secret(SettingsKey.google_api_key),
        # Spec-required aliases
        deep_think_provider=provider,
        deep_think_model=deep_llm,
        quick_think_provider=provider,
        quick_think_model=quick_llm,
        ollama_base_url=plain(SettingsKey.ollama_base_url),
        auto_save=auto_save_val.lower() not in ("false", "0", "no") if auto_save_val else True,
        codex_planner_enabled=codex_val.lower() in ("true", "1", "yes") if codex_val else False,
        has_alpha_vantage_key=has_secret(SettingsKey.alpha_vantage_api_key),
        has_moonshot_key=has_secret(SettingsKey.moonshot_api_key),
    )


@router.patch("", response_model=SettingsResponse)
async def patch_settings(
    body: SettingsPatch,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> SettingsResponse:
    key = body.key.value
    value = body.value

    if key in SENSITIVE_KEYS:
        encrypted = encrypt_secret(value) if value else None
        await settings_repo.upsert_setting(session, key, value_encrypted=encrypted)
    else:
        await settings_repo.upsert_setting(session, key, value_plain=value)

    get_audit_logger().info("settings.patch key=%s", key)

    return await get_settings_endpoint(session=session, _auth=None)


@router.post("/test-llm", response_model=LLMTestResponse)
async def test_llm_connection(
    body: LLMTestRequest,
    session: AsyncSession = Depends(get_session),
    _auth=Depends(require_auth),
) -> LLMTestResponse:
    """Test connectivity to an LLM provider."""
    import os  # noqa: PLC0415,E401
    import sys

    # Build env from stored keys
    all_settings = await settings_repo.get_all_settings(session)
    setting_map = {s.key: s for s in all_settings}

    key_env_map = {
        "openai_api_key": "OPENAI_API_KEY",
        "anthropic_api_key": "ANTHROPIC_API_KEY",
        "google_api_key": "GOOGLE_API_KEY",
    }
    for db_key, env_var in key_env_map.items():
        if db_key in setting_map and setting_map[db_key].value_encrypted:
            with contextlib.suppress(Exception):
                os.environ[env_var] = decrypt_secret(setting_map[db_key].value_encrypted)

    from core.config import get_settings as _gs  # noqa: PLC0415
    project_root = _gs().data_dir.parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    start = time.monotonic()
    try:
        from tradingagents.llm_clients.factory import create_llm_client  # noqa: PLC0415
        client = create_llm_client(
            provider=body.provider,
            model=body.model,
            base_url=body.base_url,
        )
        llm = client.get_llm()
        # Simple invoke to test connectivity
        await llm.ainvoke("Reply with just 'ok'")
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return LLMTestResponse(ok=True, message="Connection successful", latency_ms=latency_ms)
    except Exception as exc:
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        logger.warning("LLM test failed: %s", exc)
        return LLMTestResponse(ok=False, message=str(exc)[:300], latency_ms=latency_ms)


@router.get("/llm-options", response_model=LLMOptionsResponse)
async def get_llm_options(
    _auth=Depends(require_auth),
) -> LLMOptionsResponse:
    """Return available LLM providers and models."""
    providers = get_providers()
    models = get_model_options()

    # Add Ollama dynamic models if reachable
    ollama_models = await fetch_ollama_models()
    if ollama_models and "ollama" in models:
        ollama_dynamic = [{"label": m, "value": m} for m in ollama_models]
        for mode in models.get("ollama", {}).values():
            # Prepend dynamic models before "Custom model ID"
            mode[:0] = ollama_dynamic  # type: ignore[assignment]

    return LLMOptionsResponse(providers=providers, models=models)
