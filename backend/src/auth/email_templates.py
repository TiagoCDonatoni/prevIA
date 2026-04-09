from __future__ import annotations


def _coerce_lang(lang: str | None) -> str:
    raw = str(lang or "").strip().lower()
    if raw.startswith("pt"):
        return "pt"
    if raw.startswith("es"):
        return "es"
    return "en"


def _greeting(lang: str, full_name: str | None) -> str:
    name = str(full_name or "").strip()
    if lang == "pt":
        return f"Olá, {name}" if name else "Olá,"
    if lang == "es":
        return f"Hola, {name}" if name else "Hola,"
    return f"Hello, {name}" if name else "Hello,"


def build_password_reset_email(
    *,
    lang: str,
    full_name: str | None,
    reset_url: str,
    expires_minutes: int,
) -> dict[str, str]:
    lang_key = _coerce_lang(lang)
    greet = _greeting(lang_key, full_name)

    if lang_key == "pt":
        subject = "Redefina sua senha no prevIA"
        text_body = (
            f"{greet}\n\n"
            "Recebemos um pedido para redefinir a senha da sua conta no prevIA.\n\n"
            f"Use o link abaixo para continuar:\n{reset_url}\n\n"
            f"Este link expira em {expires_minutes} minutos.\n\n"
            "Se você não fez esse pedido, ignore este email.\n"
        )
        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #111;">
            <p>{greet}</p>
            <p>Recebemos um pedido para redefinir a senha da sua conta no <strong>prevIA</strong>.</p>
            <p>
              <a href="{reset_url}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111;color:#fff;text-decoration:none;">
                Redefinir senha
              </a>
            </p>
            <p>Este link expira em <strong>{expires_minutes} minutos</strong>.</p>
            <p>Se você não fez esse pedido, ignore este email.</p>
          </body>
        </html>
        """.strip()
        return {
            "subject": subject,
            "text_body": text_body,
            "html_body": html_body,
        }

    if lang_key == "es":
        subject = "Restablece tu contraseña en prevIA"
        text_body = (
            f"{greet}\n\n"
            "Recibimos una solicitud para restablecer la contraseña de tu cuenta en prevIA.\n\n"
            f"Usa el siguiente enlace para continuar:\n{reset_url}\n\n"
            f"Este enlace expira en {expires_minutes} minutos.\n\n"
            "Si no hiciste esta solicitud, ignora este correo.\n"
        )
        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #111;">
            <p>{greet}</p>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>prevIA</strong>.</p>
            <p>
              <a href="{reset_url}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111;color:#fff;text-decoration:none;">
                Restablecer contraseña
              </a>
            </p>
            <p>Este enlace expira en <strong>{expires_minutes} minutos</strong>.</p>
            <p>Si no hiciste esta solicitud, ignora este correo.</p>
          </body>
        </html>
        """.strip()
        return {
            "subject": subject,
            "text_body": text_body,
            "html_body": html_body,
        }

    subject = "Reset your prevIA password"
    text_body = (
        f"{greet}\n\n"
        "We received a request to reset the password for your prevIA account.\n\n"
        f"Use the link below to continue:\n{reset_url}\n\n"
        f"This link expires in {expires_minutes} minutes.\n\n"
        "If you did not request this, you can ignore this email.\n"
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #111;">
        <p>{greet}</p>
        <p>We received a request to reset the password for your <strong>prevIA</strong> account.</p>
        <p>
          <a href="{reset_url}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111;color:#fff;text-decoration:none;">
            Reset password
          </a>
        </p>
        <p>This link expires in <strong>{expires_minutes} minutes</strong>.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </body>
    </html>
    """.strip()
    return {
        "subject": subject,
        "text_body": text_body,
        "html_body": html_body,
    }


def build_password_changed_email(
    *,
    lang: str,
    full_name: str | None,
    changed_at_utc: str,
) -> dict[str, str]:
    lang_key = _coerce_lang(lang)
    greet = _greeting(lang_key, full_name)

    if lang_key == "pt":
        subject = "Sua senha do prevIA foi alterada"
        text_body = (
            f"{greet}\n\n"
            "A senha da sua conta no prevIA foi alterada com sucesso.\n\n"
            f"Horário (UTC): {changed_at_utc}\n\n"
            "Se não foi você, recupere o acesso imediatamente e revise a segurança da conta.\n"
        )
        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #111;">
            <p>{greet}</p>
            <p>A senha da sua conta no <strong>prevIA</strong> foi alterada com sucesso.</p>
            <p><strong>Horário (UTC):</strong> {changed_at_utc}</p>
            <p>Se não foi você, recupere o acesso imediatamente e revise a segurança da conta.</p>
          </body>
        </html>
        """.strip()
        return {
            "subject": subject,
            "text_body": text_body,
            "html_body": html_body,
        }

    if lang_key == "es":
        subject = "Tu contraseña de prevIA fue cambiada"
        text_body = (
            f"{greet}\n\n"
            "La contraseña de tu cuenta en prevIA fue cambiada con éxito.\n\n"
            f"Hora (UTC): {changed_at_utc}\n\n"
            "Si no fuiste tú, recupera el acceso de inmediato y revisa la seguridad de la cuenta.\n"
        )
        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #111;">
            <p>{greet}</p>
            <p>La contraseña de tu cuenta en <strong>prevIA</strong> fue cambiada con éxito.</p>
            <p><strong>Hora (UTC):</strong> {changed_at_utc}</p>
            <p>Si no fuiste tú, recupera el acceso de inmediato y revisa la seguridad de la cuenta.</p>
          </body>
        </html>
        """.strip()
        return {
            "subject": subject,
            "text_body": text_body,
            "html_body": html_body,
        }

    subject = "Your prevIA password was changed"
    text_body = (
        f"{greet}\n\n"
        "The password for your prevIA account was changed successfully.\n\n"
        f"Time (UTC): {changed_at_utc}\n\n"
        "If this was not you, recover access immediately and review your account security.\n"
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #111;">
        <p>{greet}</p>
        <p>The password for your <strong>prevIA</strong> account was changed successfully.</p>
        <p><strong>Time (UTC):</strong> {changed_at_utc}</p>
        <p>If this was not you, recover access immediately and review your account security.</p>
      </body>
    </html>
    """.strip()
    return {
        "subject": subject,
        "text_body": text_body,
        "html_body": html_body,
    }