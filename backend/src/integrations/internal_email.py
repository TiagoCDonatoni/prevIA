from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from typing import Optional


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}

def _first_csv_value(raw: str) -> str:
    for item in str(raw or "").split(","):
        cleaned = item.strip()
        if cleaned:
            return cleaned
    return ""


def send_internal_email(
    *,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
    to_email: Optional[str] = None,
) -> None:
    """
    SMTP simples e provider-agnostic.

    Por padrão usa INTERNAL_SMTP_* quando configurado. Se não existir SMTP
    interno separado, reaproveita PRODUCT_SMTP_* para evitar duplicar config
    no Cloud Run. O destinatário pode vir de to_email, INTERNAL_NOTIFY_TO_EMAIL,
    PARTNER_APPLICATION_NOTIFY_EMAIL ou do primeiro email em INTERNAL_STAFF_ADMIN_EMAILS.
    """

    host = (os.getenv("INTERNAL_SMTP_HOST", "").strip() or os.getenv("PRODUCT_SMTP_HOST", "").strip())
    port = int(os.getenv("INTERNAL_SMTP_PORT", "").strip() or os.getenv("PRODUCT_SMTP_PORT", "587"))
    username = (
        os.getenv("INTERNAL_SMTP_USERNAME", "").strip()
        or os.getenv("PRODUCT_SMTP_USERNAME", "").strip()
    )
    password = (
        os.getenv("INTERNAL_SMTP_PASSWORD", "").strip()
        or os.getenv("PRODUCT_SMTP_PASSWORD", "").strip()
    )
    from_email = (
        os.getenv("INTERNAL_SMTP_FROM_EMAIL", "").strip()
        or os.getenv("PRODUCT_SMTP_FROM_EMAIL", "").strip()
    )
    from_name = (
        os.getenv("INTERNAL_SMTP_FROM_NAME", "").strip()
        or os.getenv("PRODUCT_SMTP_FROM_NAME", "prevIA").strip()
        or "prevIA"
    )
    recipient_email = (
        str(to_email or "").strip()
        or os.getenv("INTERNAL_NOTIFY_TO_EMAIL", "").strip()
        or os.getenv("PARTNER_APPLICATION_NOTIFY_EMAIL", "").strip()
        or _first_csv_value(os.getenv("INTERNAL_STAFF_ADMIN_EMAILS", ""))
    )
    use_tls = _bool_env("INTERNAL_SMTP_USE_TLS", _bool_env("PRODUCT_SMTP_USE_TLS", True))
    use_ssl = _bool_env("INTERNAL_SMTP_USE_SSL", _bool_env("PRODUCT_SMTP_USE_SSL", False))
    timeout_sec = float(
        os.getenv("INTERNAL_SMTP_TIMEOUT_SEC", "").strip()
        or os.getenv("PRODUCT_SMTP_TIMEOUT_SEC", "12")
    )

    if not host:
        raise ValueError("INTERNAL_SMTP_HOST or PRODUCT_SMTP_HOST not configured")
    if not from_email:
        raise ValueError("INTERNAL_SMTP_FROM_EMAIL or PRODUCT_SMTP_FROM_EMAIL not configured")
    if not recipient_email:
        raise ValueError("internal notification recipient not configured")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = recipient_email
    msg.set_content(text_body)

    if html_body:
        msg.add_alternative(html_body, subtype="html")

    if use_ssl:
        with smtplib.SMTP_SSL(host, port, timeout=timeout_sec) as server:
            if username:
                server.login(username, password)
            server.send_message(msg)
        return

    with smtplib.SMTP(host, port, timeout=timeout_sec) as server:
        server.ehlo()
        if use_tls:
            server.starttls()
            server.ehlo()
        if username:
            server.login(username, password)
        server.send_message(msg)