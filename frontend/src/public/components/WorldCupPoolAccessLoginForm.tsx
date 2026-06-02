import React from "react";
import { useNavigate } from "react-router-dom";

import type { Lang } from "../../i18n";
import {
  loginWorldCupPoolAccess,
  resetWorldCupPoolAccessSession,
  type WorldCupPoolMyPool,
} from "../api/publicClient";

type Props = {
  lang: Lang;
};

const COPY = {
  pt: {
    title: "Entrar no meu bolão",
    body: "Use seu e-mail e PIN. Se você participa de mais de um bolão, mostramos a lista para escolher.",
    email: "Seu e-mail",
    emailPlaceholder: "voce@email.com",
    pin: "PIN de 4 dígitos",
    pinPlaceholder: "1234",
    submit: "Entrar",
    loading: "Entrando...",
    error: "Não encontramos um bolão ativo para esse e-mail e PIN.",
  },
  en: {
    title: "Open my pool",
    body: "Use your email and PIN. If you are in more than one pool, we will show the list.",
    email: "Your email",
    emailPlaceholder: "you@email.com",
    pin: "4-digit PIN",
    pinPlaceholder: "1234",
    submit: "Sign in",
    loading: "Signing in...",
    error: "We could not find an active pool for this email and PIN.",
  },
  es: {
    title: "Entrar en mi porra",
    body: "Usa tu email y PIN. Si estás en más de una porra, mostraremos la lista.",
    email: "Tu email",
    emailPlaceholder: "tu@email.com",
    pin: "PIN de 4 dígitos",
    pinPlaceholder: "1234",
    submit: "Entrar",
    loading: "Entrando...",
    error: "No encontramos una porra activa para este email y PIN.",
  },
} as const;

function participantPath(lang: Lang, pool: WorldCupPoolMyPool) {
  return `/${lang}/bolao/copa/painel/${encodeURIComponent(pool.invite_token)}`;
}

function adminPath(lang: Lang, pool: WorldCupPoolMyPool) {
  return `/${lang}/bolao/copa/admin/${encodeURIComponent(pool.slug)}`;
}

export function WorldCupPoolAccessLoginForm({ lang }: Props) {
  const navigate = useNavigate();
  const copy = COPY[lang] ?? COPY.pt;

  const [email, setEmail] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const pinIsValid = /^\d{4}$/.test(pin);
  const disabled = busy || !email.trim() || !pinIsValid;

  function onPinChange(value: string) {
    setPin(value.replace(/\D/g, "").slice(0, 4));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (disabled) return;

    setBusy(true);
    setError("");

    try {
      await resetWorldCupPoolAccessSession();

      const response = await loginWorldCupPoolAccess({
        email: email.trim(),
        pin,
      });

      if (response.pools.length === 1) {
        const onlyPool = response.pools[0];
        navigate(
          onlyPool.primary_role === "organizer"
            ? adminPath(lang, onlyPool)
            : participantPath(lang, onlyPool),
          { replace: true }
        );
        return;
      }

      if (response.pools.length > 1) {
        navigate(`/${lang}/bolao/copa/meus-boloes`, { replace: true });
        return;
      }

      setError(copy.error);
    } catch (err) {
      console.error("failed to login to world cup pool access", err);
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="worldcup-pool-form worldcup-pool-access-login-form" onSubmit={onSubmit}>
      <div>
        <h3 className="worldcup-pool-form-title">{copy.title}</h3>
        <p className="worldcup-pool-form-body">{copy.body}</p>
      </div>

      <label className="product-field">
        <span>{copy.email}</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={copy.emailPlaceholder}
          autoComplete="email"
          disabled={busy}
        />
      </label>

      <label className="product-field">
        <span>{copy.pin}</span>
        <input
          type="text"
          inputMode="numeric"
          value={pin}
          onChange={(event) => onPinChange(event.target.value)}
          placeholder={copy.pinPlaceholder}
          autoComplete="one-time-code"
          disabled={busy}
        />
      </label>

      {error ? <p className="worldcup-pool-form-error">{error}</p> : null}

      <button type="submit" className="public-btn public-btn-primary" disabled={disabled}>
        {busy ? copy.loading : copy.submit}
      </button>
    </form>
  );
}