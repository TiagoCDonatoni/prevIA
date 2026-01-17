from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import requests


class TheOddsApiError(RuntimeError):
    pass


@dataclass(frozen=True)
class TheOddsClient:
    base_url: str
    api_key: str
    timeout_sec: int = 20

    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        if not self.api_key:
            raise TheOddsApiError("THE_ODDS_API_KEY not set")
        if not self.base_url:
            raise TheOddsApiError("THE_ODDS_API_BASE_URL not set")

        url = self.base_url.rstrip("/") + path
        p = dict(params or {})
        p["apiKey"] = self.api_key

        r = requests.get(url, params=p, timeout=self.timeout_sec)
        if r.status_code >= 400:
            txt = ""
            try:
                txt = r.text
            except Exception:
                pass
            raise TheOddsApiError(f"Odds API HTTP {r.status_code}: {txt[:300]}")

        # The Odds API responde JSON (list/dict)
        return r.json()

    def list_sports(self) -> List[Dict[str, Any]]:
        # GET /v4/sports
        return self._get("/sports", params={})

    def get_odds_h2h(
        self,
        *,
        sport_key: str,
        regions: str = "eu",
        markets: str = "h2h",
        odds_format: str = "decimal",
        date_format: str = "iso",
    ) -> List[Dict[str, Any]]:
        # GET /v4/sports/{sport_key}/odds?markets=h2h...
        return self._get(
            f"/sports/{sport_key}/odds",
            params={
                "regions": regions,
                "markets": markets,
                "oddsFormat": odds_format,
                "dateFormat": date_format,
            },
        )
