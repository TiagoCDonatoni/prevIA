from __future__ import annotations

from typing import Any, Dict, Tuple
import httpx

class ApiFootballClient:
    def __init__(self, base_url: str, api_key: str, timeout_s: int = 30):
        if not base_url:
            raise ValueError("APIFOOTBALL_BASE_URL vazio")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key.strip()
        self.timeout_s = timeout_s

    def get(self, path: str, params: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if not self.api_key:
            # chave ausente: ainda retornamos estrutura controlada, sem quebrar o sistema
            return 401, {"errors": {"auth": "missing_api_key"}, "response": None}

        headers = {"x-apisports-key": self.api_key}

        with httpx.Client(timeout=self.timeout_s) as client:
            r = client.get(f"{self.base_url}{path}", params=params, headers=headers)
            # se não for JSON válido, isso vai levantar exceção -> tratamos no runner
            return r.status_code, r.json()
