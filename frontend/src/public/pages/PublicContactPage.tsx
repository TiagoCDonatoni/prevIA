import React, { useState } from "react";
import { useParams } from "react-router-dom";

import { coercePublicLang } from "../lib/publicLang";
import { usePublicSeo } from "../lib/publicSeo";
import { submitContactMessage } from "../api/publicClient";

const COPY = {
  pt: {
    eyebrow: "Contato",
    title: "Fale com o prevIA",
    body:
      "Use o formulário abaixo para entrar em contato. Por enquanto, esta é a primeira versão da página de contato — simples, direta e pronta para evoluir depois.",
    helper: "Mensagem inicial de contato",
    privacy:
      "Usaremos essas informações apenas para responder seu contato e organizar o atendimento inicial.",
    name: "Nome",
    email: "Email",
    subject: "Assunto",
    message: "Mensagem",
    namePlaceholder: "Seu nome",
    emailPlaceholder: "voce@email.com",
    subjectPlaceholder: "Ex.: parceria, dúvida comercial, suporte inicial",
    messagePlaceholder: "Escreva sua mensagem",
    submit: "Enviar mensagem",
    sending: "Enviando...",
    success: "Mensagem enviada com sucesso. Retornaremos assim que possível.",
    error: "Não foi possível enviar agora. Tente novamente.",
    seoTitle: "Contato | prevIA",
    seoDescription:
      "Entre em contato com o prevIA para dúvidas, interesse comercial ou mensagens gerais.",
  },
  en: {
    eyebrow: "Contact",
    title: "Get in touch with prevIA",
    body:
      "Use the form below to contact us. For now, this is the first version of the contact page — simple, direct, and ready to evolve later.",
    helper: "Initial contact message",
    privacy:
      "We will only use this information to reply to your message and organize the initial contact flow.",
    name: "Name",
    email: "Email",
    subject: "Subject",
    message: "Message",
    namePlaceholder: "Your name",
    emailPlaceholder: "you@email.com",
    subjectPlaceholder: "Example: partnership, commercial question, early support",
    messagePlaceholder: "Write your message",
    submit: "Send message",
    sending: "Sending...",
    success: "Message sent successfully. We will get back to you as soon as possible.",
    error: "Could not send right now. Please try again.",
    seoTitle: "Contact | prevIA",
    seoDescription:
      "Contact prevIA for questions, commercial interest, or general messages.",
  },
  es: {
    eyebrow: "Contacto",
    title: "Habla con prevIA",
    body:
      "Usa el formulario de abajo para entrar en contacto. Por ahora, esta es la primera versión de la página de contacto: simple, directa y lista para evolucionar después.",
    helper: "Mensaje inicial de contacto",
    privacy:
      "Usaremos esta información solo para responder tu mensaje y organizar el flujo inicial de atención.",
    name: "Nombre",
    email: "Email",
    subject: "Asunto",
    message: "Mensaje",
    namePlaceholder: "Tu nombre",
    emailPlaceholder: "tu@email.com",
    subjectPlaceholder: "Ej.: alianza, duda comercial, soporte inicial",
    messagePlaceholder: "Escribe tu mensaje",
    submit: "Enviar mensaje",
    sending: "Enviando...",
    success: "Mensaje enviado con éxito. Responderemos tan pronto como sea posible.",
    error: "No fue posible enviar ahora. Inténtalo nuevamente.",
    seoTitle: "Contacto | prevIA",
    seoDescription:
      "Contacta con prevIA para dudas, interés comercial o mensajes generales.",
  },
} as const;

export function PublicContactPage() {
  const { lang } = useParams<{ lang: string }>();
  const currentLang = coercePublicLang(lang);
  const copy = COPY[currentLang] ?? COPY.pt;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled =
    busy || !name.trim() || !email.trim() || !subject.trim() || !message.trim();

  usePublicSeo({
    lang: currentLang,
    path: `/${currentLang}/contact`,
    title: copy.seoTitle,
    description: copy.seoDescription,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;

    setBusy(true);
    setSuccess(null);
    setError(null);

    try {
      await submitContactMessage({
        name: name.trim(),
        email: email.trim(),
        lang: currentLang,
        subject: subject.trim(),
        message: message.trim(),
        source: "landing_contact_form",
      });

      setSuccess(copy.success);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(copy.error);
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-contact-page">
      <section className="public-hero">
        <div className="public-hero-card public-contact-hero">
          <div className="public-eyebrow">{copy.eyebrow}</div>
          <h1 className="public-title">{copy.title}</h1>
          <p className="public-body">{copy.body}</p>
        </div>
      </section>

      <section className="landing-section">
        <form className="beta-form-card beta-form-card-strong public-contact-form" onSubmit={onSubmit}>
          <div className="beta-form-topbar">
            <div className="beta-form-helper">{copy.helper}</div>
          </div>

          <div className="beta-form-grid">
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

          <div className="beta-field beta-field-full">
            <span>{copy.subject}</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={copy.subjectPlaceholder}
            />
          </div>

          <div className="beta-field beta-field-full">
            <span>{copy.message}</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={copy.messagePlaceholder}
              rows={7}
            />
          </div>

          <div className="beta-form-actions">
            <button
              type="submit"
              className="public-btn public-btn-primary"
              disabled={disabled}
            >
              {busy ? copy.sending : copy.submit}
            </button>

            <div className="beta-form-privacy">{copy.privacy}</div>
          </div>

          {success ? <div className="beta-form-success">{success}</div> : null}
          {error ? <div className="beta-form-error">{error}</div> : null}
        </form>
      </section>
    </div>
  );
}