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


def send_internal_email(
    *,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    """
    SMTP simples e provider-agnostic.
    Se faltar configuração, levanta ValueError.
    """

    host = os.getenv("INTERNAL_SMTP_HOST", "").strip()
    port = int(os.getenv("INTERNAL_SMTP_PORT", "587"))
    username = os.getenv("INTERNAL_SMTP_USERNAME", "").strip()
    password = os.getenv("INTERNAL_SMTP_PASSWORD", "").strip()
    from_email = os.getenv("INTERNAL_SMTP_FROM_EMAIL", "").strip()
    from_name = os.getenv("INTERNAL_SMTP_FROM_NAME", "prevIA").strip() or "prevIA"
    to_email = os.getenv("INTERNAL_NOTIFY_TO_EMAIL", "").strip()
    use_tls = _bool_env("INTERNAL_SMTP_USE_TLS", True)
    use_ssl = _bool_env("INTERNAL_SMTP_USE_SSL", False)
    timeout_sec = float(os.getenv("INTERNAL_SMTP_TIMEOUT_SEC", "12"))

    if not host:
        raise ValueError("INTERNAL_SMTP_HOST not configured")
    if not from_email:
        raise ValueError("INTERNAL_SMTP_FROM_EMAIL not configured")
    if not to_email:
        raise ValueError("INTERNAL_NOTIFY_TO_EMAIL not configured")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email
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