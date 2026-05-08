from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from src.auth.service import get_auth_me_payload
from src.auth.sessions import build_request_fingerprints
from src.db.pg import pg_conn
from src.internal_access.guards import require_admin_access

router = APIRouter(tags=["telemetry"])
admin_router = APIRouter(
    prefix="/admin/telemetry",
    tags=["admin-telemetry"],
    dependencies=[Depends(require_admin_access)],
)

EVENT_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{1,80}$")
IDENTITY_RE = re.compile(r"^[A-Za-z0-9_.:-]{8,120}$")
SESSION_RE = re.compile(r"^[A-Za-z0-9_.:-]{8,120}$")
MAX_PAYLOAD_BYTES = 24_000
MAX_FIELD_LENGTH = 240

ALLOWED_ACTOR_TYPES = {"anonymous", "user", "admin", "system"}
ALLOWED_SURFACES = {"landing", "auth", "app", "account", "admin", "public_embed", "unknown"}

V1_EVENT_NAMES = {
    "landing_viewed",
    "landing_primary_cta_clicked",
    "public_free_anon_embed_viewed",
    "public_free_anon_embed_loaded",
    "product_index_viewed",
    "anon_match_selected",
    "anon_reveal_started",
    "anon_reveal_succeeded",
    "anon_reveal_blocked_no_credits",
    "anon_analysis_opened",
    "auth_modal_opened",
    "auth_mode_selected",
    "auth_submit_started",
    "auth_submit_succeeded",
    "auth_submit_failed",
    "auth_forgot_password_clicked",
    "anon_promoted_to_user",
    "post_signup_plan_offer_shown",
    "post_signup_plan_selected",
    "post_signup_continue_free_clicked",
    "post_signup_checkout_started",
    "checkout_started",
    "checkout_completed",
    "checkout_failed",
}


class TelemetryEventIn(BaseModel):
    client_event_id: str | None = Field(default=None, max_length=120)
    event_name: str = Field(..., min_length=2, max_length=80)
    surface: str | None = Field(default="unknown", max_length=40)
    actor_type: str | None = Field(default="anonymous", max_length=40)

    anonymous_id: str | None = Field(default=None, max_length=120)
    session_id: str | None = Field(default=None, max_length=120)

    plan_code: str | None = Field(default=None, max_length=40)
    auth_mode: str | None = Field(default=None, max_length=40)
    route: str | None = Field(default=None, max_length=240)
    lang: str | None = Field(default=None, max_length=20)
    source: str | None = Field(default=None, max_length=80)

    utm: Dict[str, Any] | None = None
    payload: Dict[str, Any] | None = None
    occurred_at_iso: str | None = Field(default=None, max_length=80)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_occurred_at(raw: str | None) -> datetime:
    if not raw:
        return _utc_now()

    value = str(raw).strip()
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return _utc_now()


def _safe_text(raw: Any, *, max_len: int = MAX_FIELD_LENGTH) -> str | None:
    value = str(raw or "").strip()
    if not value:
        return None
    return value[:max_len]


def _safe_dict(raw: Dict[str, Any] | None) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {}

    encoded = json.dumps(raw, ensure_ascii=False, default=str)
    if len(encoded.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "ok": False,
                "code": "TELEMETRY_PAYLOAD_TOO_LARGE",
                "message": "telemetry payload is too large",
            },
        )
    return raw


def _safe_identity(raw: str | None) -> str | None:
    value = _safe_text(raw, max_len=120)
    if not value:
        return None
    if not IDENTITY_RE.match(value):
        return None
    return value


def _safe_session(raw: str | None) -> str | None:
    value = _safe_text(raw, max_len=120)
    if not value:
        return None
    if not SESSION_RE.match(value):
        return None
    return value


def _derive_auth_context(request: Request) -> Dict[str, Any]:
    try:
        payload = get_auth_me_payload(request)
    except Exception:
        return {
            "is_authenticated": False,
            "user_id": None,
            "auth_mode": None,
            "plan_code": None,
        }

    user = payload.get("user") or {}
    subscription = payload.get("subscription") or {}

    return {
        "is_authenticated": bool(payload.get("is_authenticated")),
        "user_id": user.get("user_id") if payload.get("is_authenticated") else None,
        "auth_mode": payload.get("auth_mode"),
        "plan_code": subscription.get("plan_code"),
    }


def _normalize_event_name(raw: str) -> str:
    event_name = str(raw or "").strip().lower()
    if not EVENT_NAME_RE.match(event_name):
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "code": "INVALID_EVENT_NAME",
                "message": "invalid telemetry event_name",
            },
        )

    if event_name not in V1_EVENT_NAMES:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "code": "UNKNOWN_EVENT_NAME",
                "message": "telemetry event_name is not in v1 contract",
            },
        )

    return event_name


def _normalize_surface(raw: str | None) -> str:
    surface = str(raw or "unknown").strip().lower()
    return surface if surface in ALLOWED_SURFACES else "unknown"


def _normalize_actor_type(raw: str | None) -> str:
    actor_type = str(raw or "anonymous").strip().lower()
    return actor_type if actor_type in ALLOWED_ACTOR_TYPES else "anonymous"


def _window_to_since(window: str) -> datetime:
    now = _utc_now()
    normalized = str(window or "7d").strip().lower()

    if normalized in {"today", "1d"}:
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if normalized == "30d":
        return now - timedelta(days=30)
    return now - timedelta(days=7)


@router.post("/telemetry/events")
def track_telemetry_event(request: Request, event: TelemetryEventIn = Body(...)):
    event_name = _normalize_event_name(event.event_name)
    auth_context = _derive_auth_context(request)
    actor_type = _normalize_actor_type(event.actor_type)
    surface = _normalize_surface(event.surface)

    anonymous_id = _safe_identity(event.anonymous_id)
    session_id = _safe_session(event.session_id)
    client_event_id = _safe_identity(event.client_event_id)

    payload = _safe_dict(event.payload)
    utm = _safe_dict(event.utm)

    user_id = None
    if auth_context.get("is_authenticated"):
        try:
            user_id = int(auth_context.get("user_id"))
        except (TypeError, ValueError):
            user_id = None

    plan_code = _safe_text(event.plan_code, max_len=40) or _safe_text(auth_context.get("plan_code"), max_len=40)
    auth_mode = _safe_text(event.auth_mode, max_len=40) or _safe_text(auth_context.get("auth_mode"), max_len=40)
    occurred_at = _parse_occurred_at(event.occurred_at_iso)
    fingerprints = build_request_fingerprints(request)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            if anonymous_id:
                cur.execute(
                    """
                    INSERT INTO telemetry.anonymous_identities (
                        anonymous_id,
                        first_source,
                        first_lang,
                        first_utm_json,
                        last_session_id,
                        events_count,
                        linked_user_id,
                        promoted_at_utc
                    )
                    VALUES (
                        %(anonymous_id)s,
                        %(source)s,
                        %(lang)s,
                        %(utm_json)s::jsonb,
                        %(session_id)s,
                        1,
                        %(linked_user_id)s,
                        CASE WHEN %(linked_user_id)s::bigint IS NULL THEN NULL ELSE now() END
                    )
                    ON CONFLICT (anonymous_id) DO UPDATE SET
                        last_seen_at_utc = now(),
                        last_session_id = COALESCE(EXCLUDED.last_session_id, telemetry.anonymous_identities.last_session_id),
                        events_count = telemetry.anonymous_identities.events_count + 1,
                        linked_user_id = COALESCE(telemetry.anonymous_identities.linked_user_id, EXCLUDED.linked_user_id),
                        promoted_at_utc = CASE
                            WHEN telemetry.anonymous_identities.promoted_at_utc IS NULL
                              AND EXCLUDED.linked_user_id IS NOT NULL
                            THEN now()
                            ELSE telemetry.anonymous_identities.promoted_at_utc
                        END
                    """,
                    {
                        "anonymous_id": anonymous_id,
                        "source": _safe_text(event.source, max_len=80),
                        "lang": _safe_text(event.lang, max_len=20),
                        "utm_json": json.dumps(utm, ensure_ascii=False, default=str),
                        "session_id": session_id,
                        "linked_user_id": user_id if event_name == "anon_promoted_to_user" else None,
                    },
                )

            cur.execute(
                """
                INSERT INTO telemetry.events (
                    client_event_id,
                    event_name,
                    surface,
                    actor_type,
                    anonymous_id,
                    user_id,
                    session_id,
                    plan_code,
                    auth_mode,
                    route,
                    lang,
                    source,
                    utm_json,
                    payload_json,
                    occurred_at_utc,
                    request_ip_hash,
                    user_agent_hash
                )
                VALUES (
                    %(client_event_id)s,
                    %(event_name)s,
                    %(surface)s,
                    %(actor_type)s,
                    %(anonymous_id)s,
                    %(user_id)s,
                    %(session_id)s,
                    %(plan_code)s,
                    %(auth_mode)s,
                    %(route)s,
                    %(lang)s,
                    %(source)s,
                    %(utm_json)s::jsonb,
                    %(payload_json)s::jsonb,
                    %(occurred_at_utc)s,
                    %(request_ip_hash)s,
                    %(user_agent_hash)s
                )
                ON CONFLICT (client_event_id) WHERE client_event_id IS NOT NULL DO NOTHING
                RETURNING telemetry_event_id
                """,
                {
                    "client_event_id": client_event_id,
                    "event_name": event_name,
                    "surface": surface,
                    "actor_type": actor_type,
                    "anonymous_id": anonymous_id,
                    "user_id": user_id,
                    "session_id": session_id,
                    "plan_code": plan_code,
                    "auth_mode": auth_mode,
                    "route": _safe_text(event.route, max_len=240),
                    "lang": _safe_text(event.lang, max_len=20),
                    "source": _safe_text(event.source, max_len=80),
                    "utm_json": json.dumps(utm, ensure_ascii=False, default=str),
                    "payload_json": json.dumps(payload, ensure_ascii=False, default=str),
                    "occurred_at_utc": occurred_at,
                    "request_ip_hash": fingerprints.get("ip_hash"),
                    "user_agent_hash": fingerprints.get("user_agent_hash"),
                },
            )
            inserted = cur.fetchone()
        conn.commit()

    return {"ok": True, "inserted": bool(inserted)}


@admin_router.get("/anonymous-summary")
def admin_anonymous_summary(
    window: Literal["today", "7d", "30d"] = Query(default="7d"),
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    since = _window_to_since(window)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH scoped AS (
                    SELECT *
                    FROM telemetry.events
                    WHERE actor_type = 'anonymous'
                      AND received_at_utc >= %(since)s
                )
                SELECT
                    COUNT(*)::bigint AS events_total,
                    COUNT(DISTINCT anonymous_id)::bigint AS anonymous_visitors,
                    COUNT(DISTINCT session_id)::bigint AS anonymous_sessions,
                    COUNT(*) FILTER (WHERE event_name = 'public_free_anon_embed_viewed')::bigint AS embed_viewed,
                    COUNT(*) FILTER (WHERE event_name = 'anon_match_selected')::bigint AS matches_selected,
                    COUNT(*) FILTER (WHERE event_name = 'anon_reveal_started')::bigint AS reveal_started,
                    COUNT(*) FILTER (WHERE event_name = 'anon_reveal_succeeded')::bigint AS reveal_succeeded,
                    COUNT(*) FILTER (WHERE event_name = 'anon_reveal_blocked_no_credits')::bigint AS blocked_no_credits,
                    COUNT(*) FILTER (WHERE event_name = 'auth_modal_opened')::bigint AS auth_modal_opened,
                    COUNT(*) FILTER (WHERE event_name = 'auth_submit_succeeded')::bigint AS auth_submit_succeeded,
                    COUNT(*) FILTER (WHERE event_name = 'anon_promoted_to_user')::bigint AS anon_promoted_to_user
                FROM scoped
                """,
                {"since": since},
            )
            row = cur.fetchone() or [0] * 11

            cur.execute(
                """
                SELECT
                    COALESCE(payload_json->>'sport_key', 'unknown') AS sport_key,
                    COALESCE(payload_json->>'league_name', payload_json->>'league_label', '—') AS league_name,
                    COUNT(*)::bigint AS reveal_count
                FROM telemetry.events
                WHERE actor_type = 'anonymous'
                  AND event_name = 'anon_reveal_succeeded'
                  AND received_at_utc >= %(since)s
                GROUP BY 1, 2
                ORDER BY reveal_count DESC, sport_key ASC
                LIMIT 10
                """,
                {"since": since},
            )
            top_leagues = [
                {
                    "sport_key": str(sport_key),
                    "league_name": str(league_name),
                    "reveal_count": int(reveal_count or 0),
                }
                for sport_key, league_name, reveal_count in (cur.fetchall() or [])
            ]

            cur.execute(
                """
                SELECT
                    COALESCE(payload_json->>'event_id', 'unknown') AS event_id,
                    COALESCE(payload_json->>'home_name', '—') AS home_name,
                    COALESCE(payload_json->>'away_name', '—') AS away_name,
                    COALESCE(payload_json->>'sport_key', 'unknown') AS sport_key,
                    COUNT(*)::bigint AS reveal_count
                FROM telemetry.events
                WHERE actor_type = 'anonymous'
                  AND event_name = 'anon_reveal_succeeded'
                  AND received_at_utc >= %(since)s
                GROUP BY 1, 2, 3, 4
                ORDER BY reveal_count DESC, event_id ASC
                LIMIT 10
                """,
                {"since": since},
            )
            top_events = [
                {
                    "event_id": str(event_id),
                    "home_name": str(home_name),
                    "away_name": str(away_name),
                    "sport_key": str(sport_key),
                    "reveal_count": int(reveal_count or 0),
                }
                for event_id, home_name, away_name, sport_key, reveal_count in (cur.fetchall() or [])
            ]

    metrics = {
        "events_total": int(row[0] or 0),
        "anonymous_visitors": int(row[1] or 0),
        "anonymous_sessions": int(row[2] or 0),
        "embed_viewed": int(row[3] or 0),
        "matches_selected": int(row[4] or 0),
        "reveal_started": int(row[5] or 0),
        "reveal_succeeded": int(row[6] or 0),
        "blocked_no_credits": int(row[7] or 0),
        "auth_modal_opened": int(row[8] or 0),
        "auth_submit_succeeded": int(row[9] or 0),
        "anon_promoted_to_user": int(row[10] or 0),
    }

    reveal_succeeded = metrics["reveal_succeeded"]
    auth_modal_opened = metrics["auth_modal_opened"]
    anonymous_visitors = metrics["anonymous_visitors"]

    return {
        "ok": True,
        "window": window,
        "since_utc": since.isoformat().replace("+00:00", "Z"),
        "metrics": {
            **metrics,
            "credits_consumed": reveal_succeeded,
            "visitor_to_reveal_rate": round(reveal_succeeded / anonymous_visitors, 4) if anonymous_visitors else 0,
            "reveal_to_auth_modal_rate": round(auth_modal_opened / reveal_succeeded, 4) if reveal_succeeded else 0,
            "auth_modal_to_signup_rate": round(metrics["anon_promoted_to_user"] / auth_modal_opened, 4) if auth_modal_opened else 0,
        },
        "top_leagues": top_leagues,
        "top_events": top_events,
    }