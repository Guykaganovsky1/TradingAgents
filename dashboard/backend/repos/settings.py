"""App settings repository."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.orm import AppSettings


async def get_setting(session: AsyncSession, key: str) -> AppSettings | None:
    result = await session.execute(select(AppSettings).where(AppSettings.key == key))
    return result.scalar_one_or_none()


async def get_all_settings(session: AsyncSession) -> list[AppSettings]:
    result = await session.execute(select(AppSettings))
    return list(result.scalars().all())


async def upsert_setting(
    session: AsyncSession,
    key: str,
    value_encrypted: str | None = None,
    value_plain: str | None = None,
) -> AppSettings:
    setting = await get_setting(session, key)
    if setting is None:
        setting = AppSettings(
            key=key,
            value_encrypted=value_encrypted,
            value_plain=value_plain,
        )
        session.add(setting)
    else:
        setting.value_encrypted = value_encrypted
        setting.value_plain = value_plain
    await session.commit()
    await session.refresh(setting)
    return setting


async def delete_setting(session: AsyncSession, key: str) -> bool:
    setting = await get_setting(session, key)
    if setting is None:
        return False
    await session.delete(setting)
    await session.commit()
    return True
