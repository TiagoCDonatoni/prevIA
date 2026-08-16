from __future__ import annotations

from typing import Any, Set


def get_enabled_tool_codes(settings: Any = None) -> Set[str]:
    if settings is None:
        from src.core.settings import load_settings

        settings = load_settings()

    if not bool(settings.tools_enabled):
        return set()

    enabled: Set[str] = set()
    if bool(settings.tools_bankroll_enabled):
        enabled.add("BANKROLL_MANAGER")
    return enabled
