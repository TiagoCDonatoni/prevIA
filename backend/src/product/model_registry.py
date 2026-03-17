from __future__ import annotations

import os

DEFAULT_MODEL_VERSION = "model_v0"
DEFAULT_CALC_VERSION = "snapshot_calc_v1"

def get_active_model_version() -> str:
    # Permite trocar versão sem mudar código (ex.: Poisson bivariado depois)
    return os.getenv("PREVIA_MODEL_VERSION", DEFAULT_MODEL_VERSION)

def get_calc_version() -> str:
    # calc_version = versão do algoritmo de cálculo/derivação (Score Engine)
    return "calc_v1"