from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from html import escape
from typing import Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from src.db.pg import pg_conn
from src.integrations.internal_email import send_internal_email

router = APIRouter(prefix="/public", tags=["public-partner-applications"])

AudienceSizeRange = Literal[
    "up_to_5k",
    "5k_20k",
    "20k_50k",
    "50k_100k",
    "100k_plus",
]

ContentType = Literal[
    "football_analysis",
    "responsible_sports_betting",
    "sports_data_stats",
    "fantasy_trading",
    "sports_community",
    "other",
]


class PartnerApplicationCreateRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=140)
    public_name: str = Field(..., min_length=2, max_length=140)
    email: EmailStr
    whatsapp: str = Field(..., min_length=6, max_length=40)
    lang: Literal["pt", "en", "es"] = "pt"
    main_social_platform: str = Field(..., min_length=2, max_length=40)
    main_social_url: str = Field(..., min_length=8, max_length=500)
    audience_size_range: AudienceSizeRange
    content_type: ContentType
    promotion_plan: str = Field(..., min_length=10, max_length=3000)
    other_social_urls: Optional[str] = Field(default=None, max_length=1500)
    city_state: Optional[str] = Field(default=None, max_length=160)
    media_kit_url: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=2000)
    accepted_responsible_disclosure: bool
    accepted_no_profit_promises: bool
    accepted_not_guaranteed_approval: bool
    accepted_contact: bool
    source: Optional[str] = Field(default="public_partner_application_form", max_length=100)
    website: Optional[str] = Field(default=None, max_length=120)  # honeypot invisível


class PartnerApplicationCreateResponse(BaseModel):
    ok: bool = True
    id: int
    created_at_utc: str
    email_notification_sent: bool


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    cleaned = value.strip()
    return cleaned or None


def _required_clean(value: str) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="required_field_empty")
    return cleaned


def _assert_http_url(value: Optional[str], *, field_name: str) -> Optional[str]:
    cleaned = _clean(value)
    if not cleaned:
        return None

    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail=f"invalid_{field_name}")

    return cleaned


def _hash_optional(value: Optional[str]) -> Optional[str]:
    cleaned = _clean(value)
    if not cleaned:
        return None

    salt = os.getenv("PARTNER_APPLICATION_HASH_SALT", "previa_partner_application_v1")
    digest = hashlib.sha256(f"{salt}:{cleaned}".encode("utf-8")).hexdigest()
    return digest


def _client_ip(request: Request) -> Optional[str]:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    if request.client and request.client.host:
        return request.client.host

    return None


def _iso_utc(value) -> str:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


def _yes_no(value: bool) -> str:
    return "sim" if value else "não"


@router.post("/partner-applications", response_model=PartnerApplicationCreateResponse)
def create_partner_application(
    req: PartnerApplicationCreateRequest,
    request: Request,
) -> PartnerApplicationCreateResponse:
    # Honeypot: bot preenche campo invisível; respondemos sucesso sem gerar lead real.
    if _clean(req.website):
        return PartnerApplicationCreateResponse(
            ok=True,
            id=0,
            created_at_utc=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            email_notification_sent=False,
        )

    if not req.accepted_responsible_disclosure:
        raise HTTPException(status_code=400, detail="accepted_responsible_disclosure_required")
    if not req.accepted_no_profit_promises:
        raise HTTPException(status_code=400, detail="accepted_no_profit_promises_required")
    if not req.accepted_not_guaranteed_approval:
        raise HTTPException(status_code=400, detail="accepted_not_guaranteed_approval_required")
    if not req.accepted_contact:
        raise HTTPException(status_code=400, detail="accepted_contact_required")

    main_social_url = _assert_http_url(req.main_social_url, field_name="main_social_url")
    media_kit_url = _assert_http_url(req.media_kit_url, field_name="media_kit_url")

    params = {
        "full_name": _required_clean(req.full_name),
        "public_name": _required_clean(req.public_name),
        "email": str(req.email).strip().lower(),
        "whatsapp": _required_clean(req.whatsapp),
        "lang": req.lang,
        "main_social_platform": _required_clean(req.main_social_platform).lower(),
        "main_social_url": main_social_url,
        "audience_size_range": req.audience_size_range,
        "content_type": req.content_type,
        "promotion_plan": _required_clean(req.promotion_plan),
        "other_social_urls": _clean(req.other_social_urls),
        "city_state": _clean(req.city_state),
        "media_kit_url": media_kit_url,
        "notes": _clean(req.notes),
        "accepted_responsible_disclosure": bool(req.accepted_responsible_disclosure),
        "accepted_no_profit_promises": bool(req.accepted_no_profit_promises),
        "accepted_not_guaranteed_approval": bool(req.accepted_not_guaranteed_approval),
        "accepted_contact": bool(req.accepted_contact),
        "source": _clean(req.source) or "public_partner_application_form",
        "ip_hash": _hash_optional(_client_ip(request)),
        "user_agent_hash": _hash_optional(request.headers.get("user-agent")),
    }

    insert_sql = """
      INSERT INTO partnership.partner_applications (
        full_name,
        public_name,
        email,
        whatsapp,
        lang,
        main_social_platform,
        main_social_url,
        audience_size_range,
        content_type,
        promotion_plan,
        other_social_urls,
        city_state,
        media_kit_url,
        notes,
        accepted_responsible_disclosure,
        accepted_no_profit_promises,
        accepted_not_guaranteed_approval,
        accepted_contact,
        source,
        ip_hash,
        user_agent_hash,
        status
      )
      VALUES (
        %(full_name)s,
        %(public_name)s,
        %(email)s,
        %(whatsapp)s,
        %(lang)s,
        %(main_social_platform)s,
        %(main_social_url)s,
        %(audience_size_range)s,
        %(content_type)s,
        %(promotion_plan)s,
        %(other_social_urls)s,
        %(city_state)s,
        %(media_kit_url)s,
        %(notes)s,
        %(accepted_responsible_disclosure)s,
        %(accepted_no_profit_promises)s,
        %(accepted_not_guaranteed_approval)s,
        %(accepted_contact)s,
        %(source)s,
        %(ip_hash)s,
        %(user_agent_hash)s,
        'new'
      )
      RETURNING id, created_at_utc
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(insert_sql, params)
                row = cur.fetchone()
            conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed_to_insert_partner_application: {e}")

    if not row:
        raise HTTPException(status_code=500, detail="partner_application_insert_returned_empty")

    application_id, created_at_utc = row
    email_sent = False
    email_error: Optional[str] = None

    subject = f"[prevIA] Nova candidatura de parceiro #{int(application_id)} — {params['public_name']}"
    text_body = (
        "Nova candidatura recebida no Programa de Parceiros prevIA.\n\n"
        f"id: {int(application_id)}\n"
        f"nome: {params['full_name']}\n"
        f"canal/nome público: {params['public_name']}\n"
        f"email: {params['email']}\n"
        f"whatsapp: {params['whatsapp']}\n"
        f"lang: {params['lang']}\n"
        f"rede principal: {params['main_social_platform']}\n"
        f"link principal: {params['main_social_url']}\n"
        f"audiência: {params['audience_size_range']}\n"
        f"tipo de conteúdo: {params['content_type']}\n"
        f"cidade/estado: {params['city_state'] or '-'}\n"
        f"mídia kit: {params['media_kit_url'] or '-'}\n"
        f"source: {params['source']}\n\n"
        "Como pretende divulgar:\n"
        f"{params['promotion_plan']}\n\n"
        "Outras redes:\n"
        f"{params['other_social_urls'] or '-'}\n\n"
        "Observações:\n"
        f"{params['notes'] or '-'}\n\n"
        "Aceites:\n"
        f"- Ferramenta auxiliar, sem palpites/garantia: {_yes_no(params['accepted_responsible_disclosure'])}\n"
        f"- Sem promessa de lucro/green/aposta certa: {_yes_no(params['accepted_no_profit_promises'])}\n"
        f"- Envio não garante aprovação: {_yes_no(params['accepted_not_guaranteed_approval'])}\n"
        f"- Aceita contato: {_yes_no(params['accepted_contact'])}\n"
    )

    safe_promotion_plan = escape(params["promotion_plan"]).replace("\n", "<br />")
    safe_other_social_urls = escape(params["other_social_urls"] or "-").replace("\n", "<br />")
    safe_notes = escape(params["notes"] or "-").replace("\n", "<br />")

    html_body = f"""
      <h2>Nova candidatura de parceiro</h2>
      <ul>
        <li><strong>id:</strong> {int(application_id)}</li>
        <li><strong>nome:</strong> {escape(params['full_name'])}</li>
        <li><strong>canal/nome público:</strong> {escape(params['public_name'])}</li>
        <li><strong>email:</strong> {escape(params['email'])}</li>
        <li><strong>whatsapp:</strong> {escape(params['whatsapp'])}</li>
        <li><strong>lang:</strong> {escape(params['lang'])}</li>
        <li><strong>rede principal:</strong> {escape(params['main_social_platform'])}</li>
        <li><strong>link principal:</strong> {escape(params['main_social_url'] or '-')}</li>
        <li><strong>audiência:</strong> {escape(params['audience_size_range'])}</li>
        <li><strong>tipo de conteúdo:</strong> {escape(params['content_type'])}</li>
        <li><strong>cidade/estado:</strong> {escape(params['city_state'] or '-')}</li>
        <li><strong>mídia kit:</strong> {escape(params['media_kit_url'] or '-')}</li>
        <li><strong>source:</strong> {escape(params['source'])}</li>
      </ul>
      <p><strong>Como pretende divulgar:</strong></p>
      <p>{safe_promotion_plan}</p>
      <p><strong>Outras redes:</strong></p>
      <p>{safe_other_social_urls}</p>
      <p><strong>Observações:</strong></p>
      <p>{safe_notes}</p>
      <p><strong>Aceites:</strong></p>
      <ul>
        <li>Ferramenta auxiliar, sem palpites/garantia: {_yes_no(params['accepted_responsible_disclosure'])}</li>
        <li>Sem promessa de lucro/green/aposta certa: {_yes_no(params['accepted_no_profit_promises'])}</li>
        <li>Envio não garante aprovação: {_yes_no(params['accepted_not_guaranteed_approval'])}</li>
        <li>Aceita contato: {_yes_no(params['accepted_contact'])}</li>
      </ul>
    """

    try:
        send_internal_email(
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            to_email=os.getenv("PARTNER_APPLICATION_NOTIFY_EMAIL", "").strip() or None,
        )
        email_sent = True
    except Exception as e:
        email_sent = False
        email_error = str(e)[:1000]

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE partnership.partner_applications
                    SET
                      email_notification_sent = %(email_notification_sent)s,
                      email_notification_attempted_at_utc = NOW(),
                      email_notification_error = %(email_notification_error)s,
                      updated_at_utc = NOW()
                    WHERE id = %(application_id)s
                    """,
                    {
                        "application_id": int(application_id),
                        "email_notification_sent": email_sent,
                        "email_notification_error": email_error,
                    },
                )
            conn.commit()
    except Exception:
        pass

    return PartnerApplicationCreateResponse(
        ok=True,
        id=int(application_id),
        created_at_utc=_iso_utc(created_at_utc),
        email_notification_sent=email_sent,
    )