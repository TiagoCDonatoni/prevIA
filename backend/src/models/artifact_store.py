from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ARTIFACTS_DIR = Path("artifacts/models")


@dataclass(frozen=True)
class ModelArtifactRef:
    path: Path

    def exists(self) -> bool:
        return self.path.exists()


def ensure_artifacts_dir() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)


def save_json_artifact(*, filename: str, payload: dict[str, Any]) -> ModelArtifactRef:
    ensure_artifacts_dir()
    path = ARTIFACTS_DIR / filename
    tmp = path.with_suffix(".tmp")

    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)  # atomic-ish on same filesystem

    return ModelArtifactRef(path=path)


def load_json_artifact(*, filename: str) -> dict[str, Any]:
    path = ARTIFACTS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"artifact not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))
