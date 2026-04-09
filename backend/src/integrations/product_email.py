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


def send_product_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    host = os.getenv("PRODUCT_SMTP_HOST", "").strip()
    port = int(os.getenv("PRODUCT_SMTP_PORT", "587"))
    username = os.getenv("PRODUCT_SMTP_USERNAME", "").strip()
    password = os.getenv("PRODUCT_SMTP_PASSWORD", "").strip()
    from_email = os.getenv("PRODUCT_SMTP_FROM_EMAIL", "").strip()
    from_name = os.getenv("PRODUCT_SMTP_FROM_NAME", "prevIA").strip() or "prevIA"
    use_tls = _bool_env("PRODUCT_SMTP_USE_TLS", True)
    use_ssl = _bool_env("PRODUCT_SMTP_USE_SSL", False)
    timeout_sec = float(os.getenv("PRODUCT_SMTP_TIMEOUT_SEC", "12"))

    to_email_clean = str(to_email or "").strip()
    if not host:
        raise ValueError("PRODUCT_SMTP_HOST not configured")
    if not from_email:
        raise ValueError("PRODUCT_SMTP_FROM_EMAIL not configured")
    if not to_email_clean:
        raise ValueError("to_email is required")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email_clean
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