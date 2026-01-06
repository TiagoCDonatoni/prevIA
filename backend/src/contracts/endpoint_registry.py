from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.core.settings import CONFIG_DIR


_REGISTRY_CACHE: dict | None = None


def load_registry() -> Dict[str, Any]:
    global _REGISTRY_CACHE
    if _REGISTRY_CACHE is None:
        path = Path(CONFIG_DIR) / "registry.apifootball.endpoints.v1.json"
        _REGISTRY_CACHE = json.loads(path.read_text(encoding="utf-8"))
    return _REGISTRY_CACHE


def _find_def(registry: Dict[str, Any], path: str) -> Optional[Dict[str, Any]]:
    for e in registry.get("endpoints", []):
        if e.get("path") == path:
            return e
    return None


def make_instance_key(provider: str, path: str, params: Dict[str, Any]) -> str:
    """
    instance_key determinística:
      apifootball:/fixtures|league=886|season=2024
      apifootball:/fixtures/events|fixture=1146680
    """
    registry = load_registry()
    d = _find_def(registry, path)
    identity_params: List[str] = (d or {}).get("identity_params", [])

    parts: List[str] = [f"{provider}:{path}"]
    for k in identity_params:
        v = params.get(k)
        if v is None:
            continue
        parts.append(f"{k}={v}")
    return "|".join(parts)
