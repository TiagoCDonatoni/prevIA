from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Tuple

def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def _truncate(s: str | None, n: int = 240) -> str | None:
    if s is None:
        return None
    return s if len(s) <= n else s[:n] + "…"

def iter_json_paths(obj: Any, path: str = "$") -> Iterable[Tuple[str, str, str, str | None]]:
    """
    Yields tuples: (json_path, field_name, value_type, example_value)
    value_type: string|number|object|array|boolean|null|unknown
    """
    if obj is None:
        yield (path, path.split(".")[-1], "null", "null")
        return

    if isinstance(obj, bool):
        yield (path, path.split(".")[-1], "boolean", str(obj).lower())
        return

    if isinstance(obj, (int, float)):
        yield (path, path.split(".")[-1], "number", _truncate(str(obj)))
        return

    if isinstance(obj, str):
        yield (path, path.split(".")[-1], "string", _truncate(obj))
        return

    if isinstance(obj, list):
        yield (path, path.split(".")[-1], "array", f"array(len={len(obj)})")
        for i, item in enumerate(obj[:3]):  # amostra para não explodir
            yield from iter_json_paths(item, f"{path}[{i}]")
        return

    if isinstance(obj, dict):
        yield (path, path.split(".")[-1], "object", "object")
        for k, v in obj.items():
            safe_key = k.replace('"', '\\"')
            yield from iter_json_paths(v, f'{path}["{safe_key}"]')
        return

    yield (path, path.split(".")[-1], "unknown", _truncate(str(obj)))
