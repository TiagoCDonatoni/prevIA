from __future__ import annotations

import json
import socket
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from src.core.settings import Settings
from src.odds.provider_usage import (
    ENDPOINT_GROUP_REST,
    PROVIDER_ODDSPAPI,
    claim_provider_request,
    record_provider_request_result,
)


class OddspapiClientError(Exception):
    def __init__(
        self,
        message: str,
        *,
        endpoint: Optional[str] = None,
        status_code: Optional[int] = None,
        payload: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.endpoint = endpoint
        self.status_code = status_code
        self.payload = payload


class OddspapiUsageCapReached(OddspapiClientError):
    pass


@dataclass(frozen=True)
class OddspapiResponse:
    endpoint: str
    status_code: int
    data: Any
    request_url_redacted: str
    usage_claim: Optional[Dict[str, Any]] = None


def _clean_base_url(value: str) -> str:
    return str(value or "").strip().rstrip("/")


def _redact_api_key(url: str) -> str:
    if "apiKey=" not in url:
        return url

    prefix, rest = url.split("apiKey=", 1)
    if "&" not in rest:
        return prefix + "apiKey=***"

    _, suffix = rest.split("&", 1)
    return prefix + "apiKey=***&" + suffix


def _coerce_query_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, (list, tuple, set)):
        return ",".join(str(item).strip() for item in value if str(item).strip())

    return str(value)


class OddspapiClient:
    """
    Client HTTP isolado para OddsPapi.

    Regras:
    - Não decide quais eventos atualizar.
    - Não grava snapshots.
    - Não cria eventos.
    - Não é chamado pelo run_all.
    - Quando receber uma conexão, aplica cap mensal antes da request.
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        timeout_seconds: int = 20,
        user_agent: str = "previa-oddspapi-enrichment/1.0",
    ) -> None:
        self.base_url = _clean_base_url(base_url)
        self.api_key = str(api_key or "").strip()
        self.timeout_seconds = max(1, int(timeout_seconds or 20))
        self.user_agent = user_agent

    @classmethod
    def from_settings(cls, settings: Settings) -> "OddspapiClient":
        return cls(
            base_url=settings.oddspapi_base_url,
            api_key=settings.oddspapi_api_key,
        )

    def _build_url(self, path: str, params: Optional[Mapping[str, Any]] = None) -> str:
        if not self.base_url:
            raise OddspapiClientError("missing_oddspapi_base_url")

        clean_path = "/" + str(path or "").strip().lstrip("/")
        query: Dict[str, str] = {}

        for key, value in dict(params or {}).items():
            if value is None:
                continue

            coerced = _coerce_query_value(value).strip()
            if coerced == "":
                continue

            query[str(key)] = coerced

        query["apiKey"] = self.api_key

        return f"{self.base_url}{clean_path}?{urlencode(query)}"

    def request_json(
        self,
        *,
        path: str,
        params: Optional[Mapping[str, Any]] = None,
        endpoint_label: Optional[str] = None,
        usage_conn=None,
        hard_cap: int = 250,
        reserve: int = 20,
    ) -> OddspapiResponse:
        """
        Executa request JSON na OddsPapi.

        Quando usage_conn for informado:
        - reserva 1 request antes da chamada externa;
        - grava resultado final;
        - faz commit da linha de uso para preservar o cap mensal.

        Use uma conexão dedicada para usage_conn.
        """

        if not self.api_key:
            raise OddspapiClientError("missing_oddspapi_api_key")

        endpoint = endpoint_label or ("/" + str(path or "").strip().lstrip("/"))
        usage_claim: Optional[Dict[str, Any]] = None

        if usage_conn is not None:
            claim = claim_provider_request(
                usage_conn,
                provider=PROVIDER_ODDSPAPI,
                endpoint=endpoint,
                endpoint_group=ENDPOINT_GROUP_REST,
                amount=1,
                hard_cap=hard_cap,
                reserve=reserve,
            )
            usage_claim = claim.to_dict()

            try:
                usage_conn.commit()
            except Exception:
                pass

            if not claim.ok:
                raise OddspapiUsageCapReached(
                    claim.blocked_reason or "provider_monthly_operational_cap_reached",
                    endpoint=endpoint,
                )

        url = self._build_url(path, params=params)
        redacted_url = _redact_api_key(url)

        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": self.user_agent,
            },
            method="GET",
        )

        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                status_code = int(getattr(response, "status", 200) or 200)
                raw = response.read().decode("utf-8")
        except HTTPError as exc:
            payload = ""
            try:
                payload = exc.read().decode("utf-8")[:2000]
            except Exception:
                payload = ""

            if usage_conn is not None:
                record_provider_request_result(
                    usage_conn,
                    provider=PROVIDER_ODDSPAPI,
                    endpoint=endpoint,
                    endpoint_group=ENDPOINT_GROUP_REST,
                    status=f"http_{exc.code}",
                    error=payload or str(exc),
                )
                usage_conn.commit()

            raise OddspapiClientError(
                f"oddspapi_http_error_{exc.code}",
                endpoint=endpoint,
                status_code=int(exc.code),
                payload=payload,
            ) from exc
        except (URLError, TimeoutError, socket.timeout) as exc:
            if usage_conn is not None:
                record_provider_request_result(
                    usage_conn,
                    provider=PROVIDER_ODDSPAPI,
                    endpoint=endpoint,
                    endpoint_group=ENDPOINT_GROUP_REST,
                    status="network_error",
                    error=str(exc),
                )
                usage_conn.commit()

            raise OddspapiClientError(
                "oddspapi_network_error",
                endpoint=endpoint,
                payload=str(exc),
            ) from exc

        try:
            data = json.loads(raw) if raw.strip() else None
        except json.JSONDecodeError as exc:
            if usage_conn is not None:
                record_provider_request_result(
                    usage_conn,
                    provider=PROVIDER_ODDSPAPI,
                    endpoint=endpoint,
                    endpoint_group=ENDPOINT_GROUP_REST,
                    status="parse_error",
                    error=raw[:1000],
                )
                usage_conn.commit()

            raise OddspapiClientError(
                "oddspapi_json_parse_error",
                endpoint=endpoint,
                status_code=status_code,
                payload=raw[:2000],
            ) from exc

        if usage_conn is not None:
            record_provider_request_result(
                usage_conn,
                provider=PROVIDER_ODDSPAPI,
                endpoint=endpoint,
                endpoint_group=ENDPOINT_GROUP_REST,
                status="ok",
                error=None,
            )
            usage_conn.commit()

        return OddspapiResponse(
            endpoint=endpoint,
            status_code=status_code,
            data=data,
            request_url_redacted=redacted_url,
            usage_claim=usage_claim,
        )

    def get_bookmakers(self, *, usage_conn=None, hard_cap: int = 250, reserve: int = 20) -> OddspapiResponse:
        return self.request_json(
            path="/bookmakers",
            endpoint_label="/bookmakers",
            usage_conn=usage_conn,
            hard_cap=hard_cap,
            reserve=reserve,
        )

    def get_sports(self, *, usage_conn=None, hard_cap: int = 250, reserve: int = 20) -> OddspapiResponse:
        return self.request_json(
            path="/sports",
            endpoint_label="/sports",
            usage_conn=usage_conn,
            hard_cap=hard_cap,
            reserve=reserve,
        )

    def get_markets(
        self,
        *,
        sport_id: int = 10,
        usage_conn=None,
        hard_cap: int = 250,
        reserve: int = 20,
    ) -> OddspapiResponse:
        return self.request_json(
            path="/markets",
            params={"sportId": sport_id},
            endpoint_label="/markets",
            usage_conn=usage_conn,
            hard_cap=hard_cap,
            reserve=reserve,
        )

    def get_fixtures(
        self,
        *,
        params: Mapping[str, Any],
        usage_conn=None,
        hard_cap: int = 250,
        reserve: int = 20,
    ) -> OddspapiResponse:
        return self.request_json(
            path="/fixtures",
            params=params,
            endpoint_label="/fixtures",
            usage_conn=usage_conn,
            hard_cap=hard_cap,
            reserve=reserve,
        )

    def get_odds(
        self,
        *,
        params: Mapping[str, Any],
        usage_conn=None,
        hard_cap: int = 250,
        reserve: int = 20,
    ) -> OddspapiResponse:
        return self.request_json(
            path="/odds",
            params=params,
            endpoint_label="/odds",
            usage_conn=usage_conn,
            hard_cap=hard_cap,
            reserve=reserve,
        )