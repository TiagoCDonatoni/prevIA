from __future__ import annotations

import json
from typing import Any, Dict, Mapping, Optional


def coerce_json_object(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def resolve_tool_access_record(
    tool: Mapping[str, Any],
    entitlement: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    tool_code = str(tool.get("tool_code") or "").strip().upper()
    limits_by_access = coerce_json_object(tool.get("limits_config_json"))
    active = bool(tool.get("active"))
    entitlement_type = str((entitlement or {}).get("entitlement_type") or "").strip().lower()
    entitlement_status = str((entitlement or {}).get("status") or "").strip().lower()

    if active and entitlement_type == "lifetime" and entitlement_status == "active":
        access = "lifetime"
        limits = coerce_json_object(limits_by_access.get("paid"))
    elif active and bool(tool.get("free_enabled")):
        access = "free"
        limits = coerce_json_object(limits_by_access.get("free"))
    else:
        access = "unavailable"
        limits = {}

    return {
        "tool_code": tool_code,
        "access": access,
        "limits": limits,
        "available": access != "unavailable",
    }
