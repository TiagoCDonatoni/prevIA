import React, { useState } from "react";
import type { Lang } from "../../i18n";
import { submitBetaLead } from "../api/publicClient";

type Props = {
  lang: Lang;
};

const COPY = {
  pt: {
    eyebrow: "Beta testers",
    title: "Entre para a beta do prevIA.",
    body: "O acesso ao beta é gratuito. Os primeiros convites estão previstos para os próximos 30 dias. Quem entrar agora fica no grupo inicial e pode receber condição exclusiva no lançamento, caso queira assinar no futuro.",
    points: [
      "Beta 100% gratuito",
      "Primeiros convites em até 30 dias",
      "Condição exclusiva no lançamento",
    ],
    helper: "Cadastro rápido, leva menos de 1 minuto.",
    privacy: "Sem spam. Usaremos seu contato apenas para novidades do beta, convites e acompanhamento inicial.",
    name: "Nome",
    email: "Email",
    country: "País",
    profile: "Perfil",
    level: "Experiência",
    usesTipsters: "Você usa tipsters hoje?",
    note: "Interesse / contexto",
    namePlaceholder: "Seu nome",
    emailPlaceholder: "voce@email.com",
    countryPlaceholder: "Brasil",
    notePlaceholder: "Conte rapidamente como você aposta hoje ou por que quer testar o prevIA.",
    selectPlaceholder: "Selecione",
    yes: "Sim",
    no: "Não",
    submit: "Enviar cadastro",
    sending: "Enviando...",
    success: "Cadastro enviado com sucesso. Você já entrou na lista beta.",
    error: "Não foi possível enviar agora. Tente novamente.",
    profileOptions: {
      recreational: "Apostador recreativo",
      regular: "Apostador frequente",
      semiPro: "Semi-profissional",
      content: "Criador de conteúdo / tipster",
      other: "Outro",
    },
    levelOptions: {
      beginner: "Iniciante",
      intermediate: "Intermediário",
      advanced: "Avançado",
    },
  },
  en: {
    eyebrow: "Beta testers",
    title: "Join the prevIA beta.",
    body: "Beta access is free. The first invites are planned for the next 30 days. Users who join now enter the early group and may receive an exclusive launch condition if they choose to subscribe later.",
    points: [
      "100% free beta",
      "First invites within 30 days",
      "Exclusive launch condition",
    ],
    helper: "Quick signup, takes less than a minute.",
    privacy: "No spam. We will only use your contact for beta news, invites, and early follow-up.",
    name: "Name",
    email: "Email",
    country: "Country",
    profile: "Profile",
    level: "Experience",
    usesTipsters: "Do you currently use tipsters?",
    note: "Interest / context",
    namePlaceholder: "Your name",
    emailPlaceholder: "you@email.com",
    countryPlaceholder: "United States",
    notePlaceholder: "Briefly tell us how you currently bet or why you want to test prevIA.",
    selectPlaceholder: "Select",
    yes: "Yes",
    no: "No",
    submit: "Submit signup",
    sending: "Sending...",
    success: "Successfully submitted. You are now on the beta list.",
    error: "Could not submit right now. Please try again.",
    profileOptions: {
      recreational: "Recreational bettor",
      regular: "Frequent bettor",
      semiPro: "Semi-professional",
      content: "Content creator / tipster",
      other: "Other",
    },
    levelOptions: {
      beginner: "Beginner",
      intermediate: "Intermediate",
      advanced: "Advanced",
    },
  },
  es: {
    eyebrow: "Beta testers",
    title: "Entra en la beta de prevIA.",
    body: "El acceso a la beta es gratuito. Las primeras invitaciones están previstas para los próximos 30 días. Quien entre ahora queda en el grupo inicial y puede recibir una condición exclusiva de lanzamiento si decide suscribirse después.",
    points: [
      "Beta 100% gratuita",
      "Primeras invitaciones en 30 días",
      "Condición exclusiva de lanzamiento",
    ],
    helper: "Registro rápido, tarda menos de 1 minuto.",
    privacy: "Sin spam. Solo usaremos tu contacto para novedades de la beta, invitaciones y seguimiento inicial.",
    name: "Nombre",
    email: "Email",
    country: "País",
    profile: "Perfil",
    level: "Experiencia",
    usesTipsters: "¿Usas tipsters actualmente?",
    note: "Interés / contexto",
    namePlaceholder: "Tu nombre",
    emailPlaceholder: "tu@email.com",
    countryPlaceholder: "España",
    notePlaceholder: "Cuéntanos brevemente cómo apuestas hoy o por qué quieres probar prevIA.",
    selectPlaceholder: "Selecciona",
    yes: "Sí",
    no: "No",
    submit: "Enviar registro",
    sending: "Enviando...",
    success: "Registro enviado con éxito. Ya estás en la lista beta.",
    error: "No se pudo enviar ahora. Inténtalo nuevamente.",
    profileOptions: {
      recreational: "Apostador recreativo",
      regular: "Apostador frecuente",
      semiPro: "Semi-profesional",
      content: "Creador de contenido / tipster",
      other: "Otro",
    },
    levelOptions: {
      beginner: "Principiante",
      intermediate: "Intermedio",
      advanced: "Avanzado",
    },
  },
} as const;

export function BetaLeadForm({ lang }: Props) {
  const copy = COPY[lang] ?? COPY.pt;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [bettorProfile, setBettorProfile] = useState("recreational");
  const [experienceLevel, setExperienceLevel] = useState("beginner");
  const [usesTipsters, setUsesTipsters] = useState<boolean | "">("");
  const [interestNote, setInterestNote] = useState("");

  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = busy || !name.trim() || !email.trim() || usesTipsters === "";

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
        country: country.trim() || undefined,
        bettor_profile: bettorProfile,
        experience_level: experienceLevel,
        uses_tipsters: Boolean(usesTipsters),
        interest_note: interestNote.trim() || undefined,
        source: "landing_beta_form",
      });

      setSuccess(copy.success);
      setName("");
      setEmail("");
      setCountry("");
      setBettorProfile("recreational");
      setExperienceLevel("beginner");
      setUsesTipsters("");
      setInterestNote("");
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
        <p className="landing-section-body">{copy.body}</p>
      </div>

      <form className="beta-form-card beta-form-card-strong" onSubmit={onSubmit}>
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

          <label className="beta-field">
            <span>{copy.country}</span>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder={copy.countryPlaceholder}
            />
          </label>

          <label className="beta-field">
            <span>{copy.profile}</span>
            <select value={bettorProfile} onChange={(e) => setBettorProfile(e.target.value)}>
              <option value="recreational">{copy.profileOptions.recreational}</option>
              <option value="regular">{copy.profileOptions.regular}</option>
              <option value="semi_pro">{copy.profileOptions.semiPro}</option>
              <option value="content_creator">{copy.profileOptions.content}</option>
              <option value="other">{copy.profileOptions.other}</option>
            </select>
          </label>

          <label className="beta-field">
            <span>{copy.level}</span>
            <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)}>
              <option value="beginner">{copy.levelOptions.beginner}</option>
              <option value="intermediate">{copy.levelOptions.intermediate}</option>
              <option value="advanced">{copy.levelOptions.advanced}</option>
            </select>
          </label>

          <label className="beta-field">
            <span>{copy.usesTipsters}</span>
            <select
              value={String(usesTipsters)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") setUsesTipsters("");
                else setUsesTipsters(v === "true");
              }}
            >
              <option value="">{copy.selectPlaceholder}</option>
              <option value="true">{copy.yes}</option>
              <option value="false">{copy.no}</option>
            </select>
          </label>
        </div>

        <label className="beta-field beta-field-full">
          <span>{copy.note}</span>
          <textarea
            rows={4}
            value={interestNote}
            onChange={(e) => setInterestNote(e.target.value)}
            placeholder={copy.notePlaceholder}
          />
        </label>

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