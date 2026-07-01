from __future__ import annotations

import json
from html import escape
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import quote

from src.core.settings import load_settings
from src.db.pg import pg_conn
from src.integrations.product_email import send_product_email


EVENT_SENT = "worldcup_pool_predictions_open_email_sent"
EVENT_FAILED = "worldcup_pool_predictions_open_email_failed"
DEFAULT_COMPETITION_KEY = "fifa_world_cup_2026"


PHASE_LABELS: Dict[str, Dict[str, str]] = {
    "round_of_32": {
        "pt": "fase extra (16-avos de final)",
        "en": "extra knockout round",
        "es": "ronda extra",
    },
    "round_of_16": {
        "pt": "oitavas de final",
        "en": "round of 16",
        "es": "octavos de final",
    },
    "quarter_final": {
        "pt": "quartas de final",
        "en": "quarter-finals",
        "es": "cuartos de final",
    },
    "semi_final": {
        "pt": "semifinais",
        "en": "semi-finals",
        "es": "semifinales",
    },
    "third_place": {
        "pt": "disputa de 3º lugar",
        "en": "third-place match",
        "es": "partido por el 3º puesto",
    },
    "final": {
        "pt": "final",
        "en": "final",
        "es": "final",
    },
}


def _jsonb(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _coerce_lang(lang: Optional[str]) -> str:
    raw = str(lang or "").strip().lower()
    if raw.startswith("en"):
        return "en"
    if raw.startswith("es"):
        return "es"
    return "pt"


def _coerce_pool_ids(value: Any) -> List[int]:
    if value is None:
        return []

    if isinstance(value, int):
        return [int(value)]

    if isinstance(value, str):
        chunks = [chunk.strip() for chunk in value.split(",")]
        return [int(chunk) for chunk in chunks if chunk]

    if isinstance(value, Sequence):
        result: List[int] = []
        for item in value:
            if item is None:
                continue
            safe = str(item).strip()
            if safe:
                result.append(int(safe))
        return result

    return []


def _phase_label(*, phase: str, lang: str, override: Optional[str] = None) -> str:
    if override:
        return str(override).strip()

    labels = PHASE_LABELS.get(str(phase or "").strip(), {})
    return labels.get(lang) or labels.get("pt") or str(phase or "").strip()


def _participant_panel_url(*, origin: str, lang: str, invite_token: str) -> str:
    clean_origin = str(origin or "").rstrip("/")
    safe_lang = _coerce_lang(lang)
    safe_token = quote(str(invite_token or "").strip())
    return f"{clean_origin}/{safe_lang}/bolao/copa/painel/{safe_token}"


def _open_match_summary(*, competition_key: str, phase: str) -> Dict[str, Any]:
    sql = """
      SELECT
        COUNT(*)::int AS open_matches,
        MIN(kickoff_utc) AS first_kickoff_utc,
        MAX(lock_at_utc) AS last_lock_at_utc
      FROM worldcup_pool.matches
      WHERE competition_key = %(competition_key)s
        AND phase = %(phase)s
        AND status NOT IN ('cancelled', 'finished')
        AND lock_at_utc IS NOT NULL
        AND lock_at_utc > NOW()
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "competition_key": competition_key,
                    "phase": phase,
                },
            )
            row = cur.fetchone()

    if not row:
        return {
            "open_matches": 0,
            "first_kickoff_utc": None,
            "last_lock_at_utc": None,
        }

    return {
        "open_matches": int(row[0] or 0),
        "first_kickoff_utc": row[1],
        "last_lock_at_utc": row[2],
    }


def _load_recipients(
    *,
    pool_ids: List[int],
    notification_key: str,
    force: bool,
    limit: int,
) -> List[Dict[str, Any]]:
    where_parts = [
        "po.status = 'active'",
        "pt.status = 'active'",
        "NULLIF(TRIM(pt.email), '') IS NOT NULL",
        "pt.email LIKE '%%@%%'",
    ]

    params: Dict[str, Any] = {
        "notification_key": notification_key,
        "force": bool(force),
        "limit": max(1, int(limit or 500)),
    }

    if pool_ids:
        where_parts.append("po.id = ANY(%(pool_ids)s)")
        params["pool_ids"] = pool_ids

    where_sql = "\n        AND ".join(where_parts)

    sql = f"""
      SELECT
        po.id AS pool_id,
        po.name AS pool_name,
        po.lang AS pool_lang,
        po.invite_token,
        pt.id AS participant_id,
        pt.display_name,
        pt.email
      FROM worldcup_pool.participants pt
      JOIN worldcup_pool.pools po ON po.id = pt.pool_id
      WHERE {where_sql}
        AND (
          %(force)s = true
          OR NOT EXISTS (
            SELECT 1
            FROM worldcup_pool.events ev
            WHERE ev.pool_id = po.id
              AND ev.participant_id = pt.id
              AND ev.event_name = %(event_sent)s
              AND ev.payload ->> 'notification_key' = %(notification_key)s
          )
        )
      ORDER BY po.id ASC, pt.display_name ASC, pt.id ASC
      LIMIT %(limit)s
    """

    params["event_sent"] = EVENT_SENT

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return [
        {
            "pool_id": int(row[0]),
            "pool_name": str(row[1] or ""),
            "pool_lang": _coerce_lang(str(row[2] or "")),
            "invite_token": str(row[3] or ""),
            "participant_id": int(row[4]),
            "display_name": str(row[5] or "").strip() or "participante",
            "email": str(row[6] or "").strip(),
        }
        for row in rows
    ]


def _build_email_payload(
    *,
    lang: str,
    participant_name: str,
    pool_name: str,
    panel_url: str,
    phase_label: str,
) -> Dict[str, str]:
    safe_name = escape(participant_name)
    safe_pool = escape(pool_name)
    safe_url = escape(panel_url)
    safe_phase = escape(phase_label)

    if lang == "en":
        subject = f"New predictions available in {pool_name}"
        text_body = (
            f"Hello {participant_name}, how are you?\n\n"
            f"New predictions are now available for the {phase_label} in your pool \"{pool_name}\".\n\n"
            f"Open your panel and make your predictions:\n{panel_url}\n\n"
            f"Good luck!\n"
            f"prevIA\n"
        )
        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #111111; line-height: 1.5;">
            <p>Hello {safe_name}, how are you?</p>
            <p>New predictions are now available for the <strong>{safe_phase}</strong> in your pool <strong>{safe_pool}</strong>.</p>
            <p><a href="{safe_url}" style="display: inline-block; padding: 11px 16px; border-radius: 10px; background: #0b2f8a; color: #ffffff; text-decoration: none; font-weight: 700;">Open prediction panel</a></p>
            <p style="font-size: 13px; color: #555555;">If the button does not open, use this link:<br /><a href="{safe_url}">{safe_url}</a></p>
            <p>Good luck!<br />prevIA</p>
          </body>
        </html>
        """.strip()
        return {"subject": subject, "text_body": text_body, "html_body": html_body}

    if lang == "es":
        subject = f"Nuevos pronósticos disponibles en {pool_name}"
        text_body = (
            f"Hola {participant_name}, ¿todo bien?\n\n"
            f"Ya están disponibles nuevos pronósticos para la {phase_label} de tu porra \"{pool_name}\".\n\n"
            f"Accede a tu panel y haz tus pronósticos:\n{panel_url}\n\n"
            f"¡Buena suerte!\n"
            f"prevIA\n"
        )
        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #111111; line-height: 1.5;">
            <p>Hola {safe_name}, ¿todo bien?</p>
            <p>Ya están disponibles nuevos pronósticos para la <strong>{safe_phase}</strong> de tu porra <strong>{safe_pool}</strong>.</p>
            <p><a href="{safe_url}" style="display: inline-block; padding: 11px 16px; border-radius: 10px; background: #0b2f8a; color: #ffffff; text-decoration: none; font-weight: 700;">Abrir panel de pronósticos</a></p>
            <p style="font-size: 13px; color: #555555;">Si el botón no abre, usa este enlace:<br /><a href="{safe_url}">{safe_url}</a></p>
            <p>¡Buena suerte!<br />prevIA</p>
          </body>
        </html>
        """.strip()
        return {"subject": subject, "text_body": text_body, "html_body": html_body}

    subject = f"Novos palpites liberados no {pool_name}"
    text_body = (
        f"Olá {participant_name}, tudo bem?\n\n"
        f"Já estão liberados novos palpites para a {phase_label} do seu bolão \"{pool_name}\".\n\n"
        f"Acesse seu painel e faça seus palpites:\n{panel_url}\n\n"
        f"Boa sorte!\n"
        f"prevIA\n"
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #111111; line-height: 1.5;">
        <p>Olá {safe_name}, tudo bem?</p>
        <p>Já estão liberados novos palpites para a <strong>{safe_phase}</strong> do seu bolão <strong>{safe_pool}</strong>.</p>
        <p><a href="{safe_url}" style="display: inline-block; padding: 11px 16px; border-radius: 10px; background: #0b2f8a; color: #ffffff; text-decoration: none; font-weight: 700;">Abrir painel de palpites</a></p>
        <p style="font-size: 13px; color: #555555;">Se o botão não abrir, use este link:<br /><a href="{safe_url}">{safe_url}</a></p>
        <p>Boa sorte!<br />prevIA</p>
      </body>
    </html>
    """.strip()
    return {"subject": subject, "text_body": text_body, "html_body": html_body}


def _insert_email_event(
    *,
    event_name: str,
    pool_id: int,
    participant_id: int,
    payload: Dict[str, Any],
) -> None:
    sql = """
      INSERT INTO worldcup_pool.events (
        pool_id,
        participant_id,
        actor_type,
        actor_id,
        event_name,
        payload
      )
      VALUES (
        %(pool_id)s,
        %(participant_id)s,
        'system',
        NULL,
        %(event_name)s,
        %(payload)s::jsonb
      )
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "pool_id": int(pool_id),
                    "participant_id": int(participant_id),
                    "event_name": event_name,
                    "payload": _jsonb(payload),
                },
            )
        conn.commit()


def worldcup_pool_predictions_open_email(
    *,
    competition_key: str = DEFAULT_COMPETITION_KEY,
    phase: str = "round_of_32",
    pool_ids: Any = None,
    notification_key: Optional[str] = None,
    dry_run: bool = True,
    force: bool = False,
    limit: int = 500,
    public_origin: Optional[str] = None,
    stage_label_pt: Optional[str] = None,
    stage_label_en: Optional[str] = None,
    stage_label_es: Optional[str] = None,
) -> Dict[str, Any]:
    settings = load_settings()
    safe_public_origin = str(public_origin or settings.product_public_origin or "").strip()
    safe_phase = str(phase or "").strip() or "round_of_32"
    safe_notification_key = (
        str(notification_key or "").strip()
        or f"{competition_key}:{safe_phase}:predictions_open:v1"
    )
    safe_pool_ids = _coerce_pool_ids(pool_ids)

    match_summary = _open_match_summary(
        competition_key=competition_key,
        phase=safe_phase,
    )

    counters: Dict[str, Any] = {
        "open_matches": int(match_summary["open_matches"]),
        "recipients_loaded": 0,
        "emails_would_send": 0,
        "emails_sent": 0,
        "emails_failed": 0,
        "skipped_no_open_matches": 0,
        "dry_run": bool(dry_run),
        "force": bool(force),
    }

    if int(match_summary["open_matches"]) <= 0:
        counters["skipped_no_open_matches"] = 1
        return {
            "ok": True,
            "counters": counters,
            "notification_key": safe_notification_key,
            "phase": safe_phase,
            "pool_ids": safe_pool_ids,
            "diagnostics": [],
        }

    recipients = _load_recipients(
        pool_ids=safe_pool_ids,
        notification_key=safe_notification_key,
        force=bool(force),
        limit=int(limit),
    )
    counters["recipients_loaded"] = len(recipients)

    diagnostics: List[Dict[str, Any]] = []

    for recipient in recipients:
        lang = _coerce_lang(recipient["pool_lang"])
        phase_label = _phase_label(
            phase=safe_phase,
            lang=lang,
            override={
                "pt": stage_label_pt,
                "en": stage_label_en,
                "es": stage_label_es,
            }.get(lang),
        )

        panel_url = _participant_panel_url(
            origin=safe_public_origin,
            lang=lang,
            invite_token=recipient["invite_token"],
        )

        payload = _build_email_payload(
            lang=lang,
            participant_name=recipient["display_name"],
            pool_name=recipient["pool_name"],
            panel_url=panel_url,
            phase_label=phase_label,
        )

        diagnostic = {
            "pool_id": recipient["pool_id"],
            "participant_id": recipient["participant_id"],
            "email": recipient["email"],
            "display_name": recipient["display_name"],
            "pool_name": recipient["pool_name"],
            "lang": lang,
            "subject": payload["subject"],
            "panel_url": panel_url,
        }

        if dry_run:
            counters["emails_would_send"] += 1
            diagnostic["status"] = "would_send"
            diagnostics.append(diagnostic)
            continue

        try:
            send_product_email(
                to_email=recipient["email"],
                subject=payload["subject"],
                text_body=payload["text_body"],
                html_body=payload["html_body"],
            )
            _insert_email_event(
                event_name=EVENT_SENT,
                pool_id=int(recipient["pool_id"]),
                participant_id=int(recipient["participant_id"]),
                payload={
                    "notification_key": safe_notification_key,
                    "competition_key": competition_key,
                    "phase": safe_phase,
                    "phase_label": phase_label,
                    "subject": payload["subject"],
                    "panel_url": panel_url,
                },
            )
            counters["emails_sent"] += 1
            diagnostic["status"] = "sent"
        except Exception as exc:
            _insert_email_event(
                event_name=EVENT_FAILED,
                pool_id=int(recipient["pool_id"]),
                participant_id=int(recipient["participant_id"]),
                payload={
                    "notification_key": safe_notification_key,
                    "competition_key": competition_key,
                    "phase": safe_phase,
                    "subject": payload["subject"],
                    "error": str(exc),
                },
            )
            counters["emails_failed"] += 1
            diagnostic["status"] = "failed"
            diagnostic["error"] = str(exc)

        diagnostics.append(diagnostic)

    return {
        "ok": counters["emails_failed"] == 0,
        "counters": counters,
        "notification_key": safe_notification_key,
        "phase": safe_phase,
        "pool_ids": safe_pool_ids,
        "public_origin": safe_public_origin,
        "match_summary": match_summary,
        "diagnostics": diagnostics,
    }