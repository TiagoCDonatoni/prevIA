from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Mapping, Optional


@dataclass(frozen=True)
class ModelProfile:
    """
    Perfil explícito de política do modelo.

    Importante: este arquivo ainda NÃO liga nenhum modelo novo ao snapshot.
    Ele existe para deixar a próxima evolução versionada e auditável antes
    de conectar no pipeline do produto.
    """

    key: str
    mode: str
    description: str
    history_window: Optional[int] = None
    season_weights: Optional[List[float]] = None
    competition_adjustment_cap: float = 0.15
    use_global_team_history: bool = False
    use_same_league_history: bool = False
    use_historical_league_prior: bool = False

    def normalized_weights(self) -> List[float]:
        if not self.season_weights:
            return []

        total = sum(float(w) for w in self.season_weights)
        if total <= 0:
            raise ValueError(f"model profile {self.key} has invalid season_weights")

        return [float(w) / total for w in self.season_weights]

    def target_seasons(self, target_season: int) -> List[int]:
        if not self.history_window or self.history_window <= 0:
            return [int(target_season)]

        return [int(target_season) - offset for offset in range(int(self.history_window))]

    def as_dict(self) -> Dict[str, object]:
        return {
            "key": self.key,
            "mode": self.mode,
            "description": self.description,
            "history_window": self.history_window,
            "season_weights": list(self.season_weights or []),
            "season_weights_normalized": self.normalized_weights(),
            "competition_adjustment_cap": float(self.competition_adjustment_cap),
            "use_global_team_history": bool(self.use_global_team_history),
            "use_same_league_history": bool(self.use_same_league_history),
            "use_historical_league_prior": bool(self.use_historical_league_prior),
        }


MODEL_PROFILES: Mapping[str, ModelProfile] = {
    "model_v0": ModelProfile(
        key="model_v0",
        mode="current",
        description="Modelo atual: season-first, com competição + temporada global + fallbacks.",
    ),
    "model_v1_hist5_decay": ModelProfile(
        key="model_v1_hist5_decay",
        mode="historical_decay",
        description=(
            "Modelo experimental desconectado: contexto histórico de 5 temporadas, "
            "com peso maior na temporada efetiva e peso pequeno nas antigas."
        ),
        history_window=5,
        # Atual, -1, -2, -3, -4.
        # Soma 1.0 por clareza, mas os consumidores devem sempre renormalizar
        # quando faltar uma temporada para uma liga/time.
        season_weights=[0.42, 0.27, 0.17, 0.09, 0.05],
        competition_adjustment_cap=0.15,
        use_global_team_history=True,
        use_same_league_history=True,
        use_historical_league_prior=True,
    ),
}


def get_model_profile(profile_key: str) -> ModelProfile:
    key = str(profile_key or "").strip()
    if not key:
        raise ValueError("profile_key is required")

    profile = MODEL_PROFILES.get(key)
    if profile is None:
        allowed = ", ".join(sorted(MODEL_PROFILES.keys()))
        raise ValueError(f"unknown model profile {key!r}; allowed: {allowed}")

    return profile


def list_model_profiles() -> List[Dict[str, object]]:
    return [profile.as_dict() for profile in MODEL_PROFILES.values()]