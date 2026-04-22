from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from typing import Optional, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

from src.db.pg import pg_conn
from src.integrations.internal_email import send_internal_email

router = APIRouter(prefix="/public", tags=["public"])


class BetaLeadCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    lang: Literal["pt", "en", "es"]
    country: Optional[str] = Field(default=None, max_length=120)
    bettor_profile: Optional[str] = Field(default=None, max_length=80)
    experience_level: Optional[str] = Field(default=None, max_length=80)
    uses_tipsters: Optional[bool] = None
    interest_note: Optional[str] = Field(default=None, max_length=2000)
    source: Optional[str] = Field(default="landing_beta_form", max_length=80)


class BetaLeadCreateResponse(BaseModel):
    ok: bool = True
    id: int
    created_at_utc: str
    email_notification_sent: bool

class ContactMessageCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    lang: Literal["pt", "en", "es"]
    subject: str = Field(..., min_length=2, max_length=200)
    message: str = Field(..., min_length=5, max_length=4000)
    source: Optional[str] = Field(default="landing_contact_form", max_length=80)


class ContactMessageCreateResponse(BaseModel):
    ok: bool = True
    id: int
    created_at_utc: str
    email_notification_sent: bool

@router.post("/beta-leads", response_model=BetaLeadCreateResponse)
def create_beta_lead(req: BetaLeadCreateRequest) -> BetaLeadCreateResponse:
    insert_sql = """
      INSERT INTO public_site.beta_leads (
        name,
        email,
        lang,
        country,
        bettor_profile,
        experience_level,
        uses_tipsters,
        interest_note,
        source,
        status
      )
      VALUES (
        %(name)s,
        %(email)s,
        %(lang)s,
        %(country)s,
        %(bettor_profile)s,
        %(experience_level)s,
        %(uses_tipsters)s,
        %(interest_note)s,
        %(source)s,
        'new'
      )
      RETURNING id, created_at_utc
    """

    params = {
        "name": req.name.strip(),
        "email": str(req.email).strip().lower(),
        "lang": req.lang,
        "country": req.country.strip() if req.country else None,
        "bettor_profile": req.bettor_profile.strip() if req.bettor_profile else None,
        "experience_level": req.experience_level.strip() if req.experience_level else None,
        "uses_tipsters": req.uses_tipsters,
        "interest_note": req.interest_note.strip() if req.interest_note else None,
        "source": (req.source or "landing_beta_form").strip(),
    }

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(insert_sql, params)
                row = cur.fetchone()
            conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed_to_insert_beta_lead: {e}")

    if not row:
        raise HTTPException(status_code=500, detail="beta_lead_insert_returned_empty")

    lead_id, created_at_utc = row
    email_sent = False
    email_error: Optional[str] = None

    subject = f"[prevIA] Novo lead público #{int(lead_id)}"
    text_body = (
        f"Novo lead captado pela landing pública.\n\n"
        f"id: {int(lead_id)}\n"
        f"name: {params['name']}\n"
        f"email: {params['email']}\n"
        f"lang: {params['lang']}\n"
        f"country: {params['country'] or '-'}\n"
        f"bettor_profile: {params['bettor_profile'] or '-'}\n"
        f"experience_level: {params['experience_level'] or '-'}\n"
        f"uses_tipsters: {params['uses_tipsters']}\n"
        f"source: {params['source']}\n"
        f"interest_note: {params['interest_note'] or '-'}\n"
    )

    safe_note = escape(params["interest_note"] or "-").replace("\n", "<br />")

    html_body = f"""
      <h2>Novo lead público</h2>
      <ul>
        <li><strong>id:</strong> {int(lead_id)}</li>
        <li><strong>name:</strong> {escape(params['name'])}</li>
        <li><strong>email:</strong> {escape(params['email'])}</li>
        <li><strong>lang:</strong> {escape(params['lang'])}</li>
        <li><strong>country:</strong> {escape(params['country'] or '-')}</li>
        <li><strong>bettor_profile:</strong> {escape(params['bettor_profile'] or '-')}</li>
        <li><strong>experience_level:</strong> {escape(params['experience_level'] or '-')}</li>
        <li><strong>uses_tipsters:</strong> {params['uses_tipsters']}</li>
        <li><strong>source:</strong> {escape(params['source'])}</li>
      </ul>
      <p><strong>interest_note:</strong></p>
      <p>{safe_note}</p>
    """

    try:
        send_internal_email(subject=subject, text_body=text_body, html_body=html_body)
        email_sent = True
    except Exception as e:
        email_sent = False
        email_error = str(e)[:1000]

    update_email_status_sql = """
      UPDATE public_site.beta_leads
      SET
        email_notification_sent = %(email_notification_sent)s,
        email_notification_attempted_at_utc = NOW(),
        email_notification_error = %(email_notification_error)s
      WHERE id = %(lead_id)s
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    update_email_status_sql,
                    {
                        "lead_id": int(lead_id),
                        "email_notification_sent": email_sent,
                        "email_notification_error": email_error,
                    },
                )
            conn.commit()
    except Exception:
        pass

    created_iso = (
        created_at_utc.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        if isinstance(created_at_utc, datetime)
        else str(created_at_utc)
    )

    return BetaLeadCreateResponse(
        ok=True,
        id=int(lead_id),
        created_at_utc=created_iso,
        email_notification_sent=email_sent,
    )

@router.post("/contact-messages", response_model=ContactMessageCreateResponse)
def create_contact_message(req: ContactMessageCreateRequest) -> ContactMessageCreateResponse:
    insert_sql = """
      INSERT INTO public_site.contact_messages (
        name,
        email,
        lang,
        subject,
        message,
        source,
        status
      )
      VALUES (
        %(name)s,
        %(email)s,
        %(lang)s,
        %(subject)s,
        %(message)s,
        %(source)s,
        'new'
      )
      RETURNING id, created_at_utc
    """

    params = {
        "name": req.name.strip(),
        "email": str(req.email).strip().lower(),
        "lang": req.lang,
        "subject": req.subject.strip(),
        "message": req.message.strip(),
        "source": (req.source or "landing_contact_form").strip(),
    }

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(insert_sql, params)
                row = cur.fetchone()
            conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed_to_insert_contact_message: {e}")

    if not row:
        raise HTTPException(status_code=500, detail="contact_message_insert_returned_empty")

    contact_id, created_at_utc = row
    email_sent = False
    email_error: Optional[str] = None

    subject = f"[prevIA] Nova mensagem de contato #{int(contact_id)}"
    text_body = (
        f"Nova mensagem enviada pela página de contato.\n\n"
        f"id: {int(contact_id)}\n"
        f"name: {params['name']}\n"
        f"email: {params['email']}\n"
        f"lang: {params['lang']}\n"
        f"subject: {params['subject']}\n"
        f"source: {params['source']}\n"
        f"message:\n{params['message']}\n"
    )

    safe_message = escape(params["message"]).replace("\n", "<br />")

    html_body = f"""
      <h2>Nova mensagem de contato</h2>
      <ul>
        <li><strong>id:</strong> {int(contact_id)}</li>
        <li><strong>name:</strong> {escape(params['name'])}</li>
        <li><strong>email:</strong> {escape(params['email'])}</li>
        <li><strong>lang:</strong> {escape(params['lang'])}</li>
        <li><strong>subject:</strong> {escape(params['subject'])}</li>
        <li><strong>source:</strong> {escape(params['source'])}</li>
      </ul>
      <p><strong>message:</strong></p>
      <p>{safe_message}</p>
    """

    try:
        send_internal_email(subject=subject, text_body=text_body, html_body=html_body)
        email_sent = True
    except Exception as e:
        email_sent = False
        email_error = str(e)[:1000]

    update_email_status_sql = """
      UPDATE public_site.contact_messages
      SET
        email_notification_sent = %(email_notification_sent)s,
        email_notification_attempted_at_utc = NOW(),
        email_notification_error = %(email_notification_error)s
      WHERE id = %(contact_id)s
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    update_email_status_sql,
                    {
                        "contact_id": int(contact_id),
                        "email_notification_sent": email_sent,
                        "email_notification_error": email_error,
                    },
                )
            conn.commit()
    except Exception:
        pass

    created_iso = (
        created_at_utc.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        if isinstance(created_at_utc, datetime)
        else str(created_at_utc)
    )

    return ContactMessageCreateResponse(
        ok=True,
        id=int(contact_id),
        created_at_utc=created_iso,
        email_notification_sent=email_sent,
    )