import React, { useState } from "react";
import type { Lang } from "../../i18n";
import { submitBetaLead } from "../api/publicClient";

type Props = {
  lang: Lang;
};

const COPY = {
  pt: {
    eyebrow: "Novidades do produto",
    title: "Receba novidades do prevIA e acompanhe a evolução.",
    body: "",
    points: [
      "Cadastro opcional",
      "Sem spam",
      "Novidades e lançamento",
    ],
    helper: "Receba novidades, melhorias e avisos de lançamento.",
    privacy:
      "Usaremos seu contato apenas para novidades do produto, avisos de lançamento e acompanhamento inicial.",
    name: "Nome",
    email: "Email",
    namePlaceholder: "Seu nome",
    emailPlaceholder: "voce@email.com",
    submit: "Receber novidades",
    sending: "Enviando...",
    success: "Contato enviado com sucesso. Você agora receberá novidades do prevIA.",
    error: "Não foi possível enviar agora. Tente novamente.",
  },
  en: {
    eyebrow: "Product updates",
    title: "Get prevIA updates and follow the product evolution.",
    body: "",
    points: [
      "Optional signup",
      "No spam",
      "Launch and product updates",
    ],
    helper: "Get product updates, improvements, and launch notices.",
    privacy:
      "We will only use your contact for product updates, launch notices, and early follow-up.",
    name: "Name",
    email: "Email",
    namePlaceholder: "Your name",
    emailPlaceholder: "you@email.com",
    submit: "Get updates",
    sending: "Sending...",
    success: "Submitted successfully. You will now receive prevIA updates.",
    error: "Could not submit right now. Please try again.",
  },
  es: {
    eyebrow: "Novedades del producto",
    title: "Recibe novedades de prevIA y sigue la evolución del producto.",
    body: "",
    points: [
      "Registro opcional",
      "Sin spam",
      "Novedades y lanzamiento",
    ],
    helper: "Recibe novedades del producto, mejoras y avisos de lanzamiento.",
    privacy:
      "Usaremos tu contacto solo para novedades del producto, avisos de lanzamiento y seguimiento inicial.",
    name: "Nombre",
    email: "Email",
    namePlaceholder: "Tu nombre",
    emailPlaceholder: "tu@email.com",
    submit: "Recibir novedades",
    sending: "Enviando...",
    success: "Contacto enviado con éxito. Ahora recibirás novedades de prevIA.",
    error: "No fue posible enviar ahora. Inténtalo nuevamente.",
  },
} as const;

export function BetaLeadForm({ lang }: Props) {
  const copy = COPY[lang] ?? COPY.pt;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = busy || !name.trim() || !email.trim();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;

    setBusy(true);
    setSuccess(null);
    setError(null);

    try {
      await submitBetaLead({
        name: name.trim(),
        email: email.trim(),
        lang,
        source: "landing_updates_form",
      });

      setSuccess(copy.success);
      setName("");
      setEmail("");
    } catch (err: any) {
      setError(copy.error);
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="landing-section">
      <div className="landing-section-head compact">
        <div className="public-eyebrow">{copy.eyebrow}</div>
        <h2 className="landing-section-title">{copy.title}</h2>
        {null}
      </div>

      <form className="beta-form-card beta-form-card-strong beta-form-card-compact" onSubmit={onSubmit}>
        <div className="beta-form-topbar">
          <div className="beta-form-helper">{copy.helper}</div>

          <div className="beta-form-points">
            {copy.points.map((item) => (
              <span key={item} className="beta-form-point">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="beta-form-grid beta-form-grid-compact">
          <label className="beta-field">
            <span>{copy.name}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={copy.namePlaceholder}
            />
          </label>

          <label className="beta-field">
            <span>{copy.email}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={copy.emailPlaceholder}
            />
          </label>
        </div>

        <div className="beta-form-actions">
          <button type="submit" className="public-btn public-btn-primary" disabled={disabled}>
            {busy ? copy.sending : copy.submit}
          </button>

          <div className="beta-form-privacy">{copy.privacy}</div>
        </div>

        {success ? <div className="beta-form-success">{success}</div> : null}
        {error ? <div className="beta-form-error">{error}</div> : null}
      </form>
    </section>
  );
}