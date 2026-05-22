import React, { useState } from "react";
import { useParams } from "react-router-dom";

import { coercePublicLang } from "../lib/publicLang";
import { usePublicSeo } from "../lib/publicSeo";
import { submitPartnerApplication } from "../api/publicClient";

type AudienceSizeRange =
  | "up_to_5k"
  | "5k_20k"
  | "20k_50k"
  | "50k_100k"
  | "100k_plus";

type ContentType =
  | "football_analysis"
  | "responsible_sports_betting"
  | "sports_data_stats"
  | "fantasy_trading"
  | "sports_community"
  | "other";

type FormState = {
  full_name: string;
  public_name: string;
  email: string;
  whatsapp: string;
  main_social_platform: string;
  main_social_url: string;
  audience_size_range: AudienceSizeRange | "";
  content_type: ContentType | "";
  promotion_plan: string;
  other_social_urls: string;
  city_state: string;
  media_kit_url: string;
  notes: string;
  accepted_responsible_disclosure: boolean;
  accepted_no_profit_promises: boolean;
  accepted_not_guaranteed_approval: boolean;
  accepted_contact: boolean;
  website: string;
};

const INITIAL_FORM: FormState = {
  full_name: "",
  public_name: "",
  email: "",
  whatsapp: "",
  main_social_platform: "instagram",
  main_social_url: "",
  audience_size_range: "",
  content_type: "",
  promotion_plan: "",
  other_social_urls: "",
  city_state: "",
  media_kit_url: "",
  notes: "",
  accepted_responsible_disclosure: false,
  accepted_no_profit_promises: false,
  accepted_not_guaranteed_approval: false,
  accepted_contact: false,
  website: "",
};

const COPY = {
  pt: {
    seoTitle: "Programa de Parceiros prevIA | Parcerias responsáveis",
    seoDescription:
      "Candidate-se ao Programa de Parceiros prevIA e divulgue análise esportiva responsável para sua audiência.",
    eyebrow: "Programa de Parceiros",
    title: "Divulgue análise esportiva responsável para sua audiência.",
    body:
      "Estamos selecionando criadores, comunidades e perfis de futebol para divulgar o prevIA com responsabilidade. O prevIA não vende palpites, sinais, certeza de resultado ou promessa de lucro — trabalha com dados, contexto e probabilidades.",
    cta: "Enviar candidatura",
    sideKicker: "Parceiros fundadores",
    sideTitle: "Links oficiais, acompanhamento e comissão sobre assinaturas elegíveis.",
    sideBody:
      "Após aprovação e contrato, criamos suas campanhas oficiais e liberamos o painel do parceiro para acompanhar resultados.",
    stepsEyebrow: "Como funciona",
    stepsTitle: "Uma jornada simples, com aprovação manual.",
    steps: [
      {
        title: "Você envia sua candidatura",
        body: "Conte quem você é, quais canais usa e como pretende apresentar o prevIA.",
      },
      {
        title: "Avaliamos o alinhamento",
        body: "Verificamos perfil, audiência, linguagem e aderência à comunicação responsável.",
      },
      {
        title: "Criamos seus links oficiais",
        body: "Com aprovação e contrato, você recebe campanhas oficiais e acesso ao painel do parceiro.",
      },
    ],
    formEyebrow: "Candidatura",
    formTitle: "Envie seus dados para avaliação",
    formHelper:
      "A candidatura não cria conta, parceiro, campanha ou contrato automaticamente. A equipe prevIA avalia e entra em contato se houver alinhamento.",
    offerTitle: "O que o parceiro recebe",
    offers: [
      "Link ou campanha oficial",
      "Acompanhamento de cadastros e assinantes",
      "Comissão sobre assinaturas elegíveis",
      "Painel do parceiro após aprovação",
    ],
    complianceTitle: "Comunicação responsável",
    allowedTitle: "Pode comunicar",
    allowed: [
      "Ferramenta auxiliar de análise esportiva",
      "Dados, contexto e probabilidades",
      "Uso responsável e sem garantia de resultado",
    ],
    forbiddenTitle: "Não pode prometer",
    forbidden: [
      "Aposta certa, sinal ou green garantido",
      "Lucro garantido ou método infalível",
      "Incentivo a recuperar perdas ou cancelar após 3 meses",
    ],
    fields: {
      full_name: "Nome completo",
      public_name: "Nome público ou canal",
      email: "Email",
      whatsapp: "WhatsApp",
      main_social_platform: "Principal canal",
      main_social_url: "Link do principal canal",
      audience_size_range: "Tamanho aproximado da audiência",
      content_type: "Tipo de conteúdo",
      promotion_plan: "Como pretende divulgar o prevIA?",
      other_social_urls: "Outras redes",
      city_state: "Cidade/estado",
      media_kit_url: "Mídia kit ou apresentação",
      notes: "Observações",
    },
    placeholders: {
      full_name: "Seu nome completo",
      public_name: "Ex.: Canal Futebol Inteligente",
      email: "voce@email.com",
      whatsapp: "+55 11 99999-9999",
      main_social_url: "https://instagram.com/seucanal",
      promotion_plan: "Ex.: vídeos semanais, stories, comunidade fechada, newsletter...",
      other_social_urls: "Instagram, YouTube, TikTok, comunidade, newsletter...",
      city_state: "São Paulo/SP",
      media_kit_url: "https://...",
      notes: "Conte algo relevante sobre sua audiência ou proposta.",
    },
    platforms: {
      instagram: "Instagram",
      youtube: "YouTube",
      tiktok: "TikTok",
      x: "X / Twitter",
      telegram: "Telegram/Comunidade",
      site: "Site/Newsletter",
      other: "Outro",
    },
    audienceOptions: {
      up_to_5k: "Até 5 mil",
      "5k_20k": "5 mil a 20 mil",
      "20k_50k": "20 mil a 50 mil",
      "50k_100k": "50 mil a 100 mil",
      "100k_plus": "100 mil+",
    },
    contentOptions: {
      football_analysis: "Análise de futebol",
      responsible_sports_betting: "Apostas esportivas com responsabilidade",
      sports_data_stats: "Estatística/dados esportivos",
      fantasy_trading: "Fantasy/trading esportivo",
      sports_community: "Comunidade esportiva",
      other: "Outro",
    },
    checks: {
      responsible:
        "Entendo que o prevIA é uma ferramenta auxiliar de análise, não um serviço de palpite, sinal ou garantia.",
      noProfit:
        "Comprometo-me a não prometer lucro, green garantido, aposta certa ou resultado garantido.",
      noApproval: "Entendo que enviar candidatura não garante aprovação no programa.",
      contact: "Aceito ser contatado pela equipe prevIA sobre esta candidatura.",
    },
    terms: {
      acceptedLabel: "Li e aceito os termos do Programa de Parceiros prevIA.",
      open: "Ver termos",
      title: "Termos do Programa de Parceiros",
      closeAria: "Fechar",
      intro:
        "Ao enviar sua candidatura, você declara ciência e concordância com os compromissos básicos de comunicação responsável do Programa de Parceiros prevIA.",
      review:
        "A aprovação é manual e depende da avaliação do perfil, canais, linguagem, aderência à marca e alinhamento com divulgação responsável.",
      acceptButton: "Li e aceito os termos",
      closeButton: "Fechar",
    },
    submit: "Enviar candidatura",
    sending: "Enviando...",
    success:
      "Candidatura recebida com sucesso. Vamos avaliar os dados e entraremos em contato se houver alinhamento.",
    error: "Não foi possível enviar a candidatura agora. Tente novamente.",
    selectPlaceholder: "Selecione",
    privacy:
      "Usaremos esses dados apenas para avaliar a candidatura, entrar em contato e organizar o Programa de Parceiros prevIA.",
  },
  en: {
    seoTitle: "prevIA Partner Program | Responsible partnerships",
    seoDescription:
      "Apply to the prevIA Partner Program and promote responsible sports analysis to your audience.",
    eyebrow: "Partner Program",
    title: "Promote responsible sports analysis to your audience.",
    body:
      "We are selecting creators and football communities to promote prevIA responsibly. prevIA does not sell picks, signals, certainty, or profit promises — it works with data, context, and probabilities.",
    cta: "Apply now",
    sideKicker: "Founding partners",
    sideTitle: "Official links, tracking, and commission on eligible subscriptions.",
    sideBody:
      "After approval and contract, we create your official campaigns and enable the Partner Console.",
    stepsEyebrow: "How it works",
    stepsTitle: "A simple journey, with manual approval.",
    steps: [
      {
        title: "You submit your application",
        body: "Tell us who you are, your channels, and how you plan to present prevIA.",
      },
      {
        title: "We review the fit",
        body: "We evaluate profile, audience, language, and responsible communication alignment.",
      },
      {
        title: "We create your official links",
        body: "After approval and contract, you receive official campaigns and Partner Console access.",
      },
    ],
    formEyebrow: "Application",
    formTitle: "Send your details for review",
    formHelper:
      "This application does not automatically create an account, partner, campaign, or contract. The prevIA team reviews it and contacts you if there is a fit.",
    offerTitle: "What partners get",
    offers: [
      "Official link or campaign",
      "Signup and subscriber tracking",
      "Commission on eligible subscriptions",
      "Partner Console after approval",
    ],
    complianceTitle: "Responsible communication",
    allowedTitle: "Allowed messaging",
    allowed: [
      "Sports analysis assistant",
      "Data, context, and probabilities",
      "Responsible use with no result guarantee",
    ],
    forbiddenTitle: "Do not promise",
    forbidden: [
      "Sure bet, signal, or guaranteed green",
      "Guaranteed profit or infallible method",
      "Loss recovery or cancellation after 3 months",
    ],
    fields: {
      full_name: "Full name",
      public_name: "Public name or channel",
      email: "Email",
      whatsapp: "WhatsApp",
      main_social_platform: "Main channel",
      main_social_url: "Main channel link",
      audience_size_range: "Approximate audience size",
      content_type: "Content type",
      promotion_plan: "How do you plan to promote prevIA?",
      other_social_urls: "Other channels",
      city_state: "City/state",
      media_kit_url: "Media kit or presentation",
      notes: "Notes",
    },
    placeholders: {
      full_name: "Your full name",
      public_name: "Example: Smart Football Channel",
      email: "you@email.com",
      whatsapp: "+1 555 000 0000",
      main_social_url: "https://instagram.com/yourchannel",
      promotion_plan: "Example: weekly videos, stories, private community, newsletter...",
      other_social_urls: "Instagram, YouTube, TikTok, community, newsletter...",
      city_state: "Toronto/ON",
      media_kit_url: "https://...",
      notes: "Tell us anything relevant about your audience or proposal.",
    },
    platforms: {
      instagram: "Instagram",
      youtube: "YouTube",
      tiktok: "TikTok",
      x: "X / Twitter",
      telegram: "Telegram/Community",
      site: "Website/Newsletter",
      other: "Other",
    },
    audienceOptions: {
      up_to_5k: "Up to 5k",
      "5k_20k": "5k to 20k",
      "20k_50k": "20k to 50k",
      "50k_100k": "50k to 100k",
      "100k_plus": "100k+",
    },
    contentOptions: {
      football_analysis: "Football analysis",
      responsible_sports_betting: "Responsible sports betting",
      sports_data_stats: "Sports data/stats",
      fantasy_trading: "Fantasy/sports trading",
      sports_community: "Sports community",
      other: "Other",
    },
    checks: {
      responsible:
        "I understand prevIA is an analysis assistant, not a pick, signal, or guarantee service.",
      noProfit:
        "I commit not to promise profit, guaranteed green, sure bets, or guaranteed results.",
      noApproval: "I understand applying does not guarantee approval.",
      contact: "I agree to be contacted by the prevIA team about this application.",
    },
    terms: {
      acceptedLabel: "I have read and accept the prevIA Partner Program terms.",
      open: "View terms",
      title: "Partner Program Terms",
      closeAria: "Close",
      intro:
        "By submitting your application, you acknowledge and agree to the basic responsible communication commitments of the prevIA Partner Program.",
      review:
        "Approval is manual and depends on the review of your profile, channels, language, brand fit, and alignment with responsible promotion.",
      acceptButton: "I have read and accept the terms",
      closeButton: "Close",
    },
    submit: "Submit application",
    sending: "Submitting...",
    success:
      "Application received successfully. We will review it and contact you if there is a fit.",
    error: "Could not submit the application right now. Please try again.",
    selectPlaceholder: "Select",
    privacy:
      "We will use this information only to review your application, contact you, and organize the prevIA Partner Program.",
  },
  es: {
    seoTitle: "Programa de Socios prevIA | Alianzas responsables",
    seoDescription:
      "Postúlate al Programa de Socios prevIA y divulga análisis deportivo responsable para tu audiencia.",
    eyebrow: "Programa de Socios",
    title: "Divulga análisis deportivo responsable para tu audiencia.",
    body:
      "Estamos seleccionando creadores y comunidades de fútbol para divulgar prevIA con responsabilidad. prevIA no vende picks, señales, certeza de resultado ni promesa de lucro: trabaja con datos, contexto y probabilidades.",
    cta: "Enviar candidatura",
    sideKicker: "Socios fundadores",
    sideTitle: "Links oficiales, seguimiento y comisión sobre suscripciones elegibles.",
    sideBody:
      "Después de la aprobación y el contrato, creamos tus campañas oficiales y habilitamos el panel del socio.",
    stepsEyebrow: "Cómo funciona",
    stepsTitle: "Una jornada simple, con aprobación manual.",
    steps: [
      {
        title: "Envías tu candidatura",
        body: "Cuéntanos quién eres, qué canales usas y cómo planeas presentar prevIA.",
      },
      {
        title: "Evaluamos el alineamiento",
        body: "Revisamos perfil, audiencia, lenguaje y comunicación responsable.",
      },
      {
        title: "Creamos tus links oficiales",
        body: "Con aprobación y contrato, recibes campañas oficiales y acceso al panel del socio.",
      },
    ],
    formEyebrow: "Candidatura",
    formTitle: "Envía tus datos para evaluación",
    formHelper:
      "La candidatura no crea cuenta, socio, campaña o contrato automáticamente. El equipo de prevIA evalúa y contacta si hay alineamiento.",
    offerTitle: "Qué recibe el socio",
    offers: [
      "Link o campaña oficial",
      "Seguimiento de registros y suscriptores",
      "Comisión sobre suscripciones elegibles",
      "Panel del socio después de la aprobación",
    ],
    complianceTitle: "Comunicación responsable",
    allowedTitle: "Puede comunicar",
    allowed: [
      "Herramienta auxiliar de análisis deportivo",
      "Datos, contexto y probabilidades",
      "Uso responsable y sin garantía de resultado",
    ],
    forbiddenTitle: "No puede prometer",
    forbidden: [
      "Apuesta segura, señal o green garantizado",
      "Lucro garantizado o método infalible",
      "Recuperar pérdidas o cancelar después de 3 meses",
    ],
    fields: {
      full_name: "Nombre completo",
      public_name: "Nombre público o canal",
      email: "Email",
      whatsapp: "WhatsApp",
      main_social_platform: "Canal principal",
      main_social_url: "Link del canal principal",
      audience_size_range: "Tamaño aproximado de audiencia",
      content_type: "Tipo de contenido",
      promotion_plan: "¿Cómo planeas divulgar prevIA?",
      other_social_urls: "Otras redes",
      city_state: "Ciudad/estado",
      media_kit_url: "Media kit o presentación",
      notes: "Observaciones",
    },
    placeholders: {
      full_name: "Tu nombre completo",
      public_name: "Ej.: Canal Fútbol Inteligente",
      email: "tu@email.com",
      whatsapp: "+54 11 0000-0000",
      main_social_url: "https://instagram.com/tucanal",
      promotion_plan: "Ej.: videos semanales, stories, comunidad privada, newsletter...",
      other_social_urls: "Instagram, YouTube, TikTok, comunidad, newsletter...",
      city_state: "Buenos Aires/AR",
      media_kit_url: "https://...",
      notes: "Cuéntanos algo relevante sobre tu audiencia o propuesta.",
    },
    platforms: {
      instagram: "Instagram",
      youtube: "YouTube",
      tiktok: "TikTok",
      x: "X / Twitter",
      telegram: "Telegram/Comunidad",
      site: "Sitio/Newsletter",
      other: "Otro",
    },
    audienceOptions: {
      up_to_5k: "Hasta 5 mil",
      "5k_20k": "5 mil a 20 mil",
      "20k_50k": "20 mil a 50 mil",
      "50k_100k": "50 mil a 100 mil",
      "100k_plus": "100 mil+",
    },
    contentOptions: {
      football_analysis: "Análisis de fútbol",
      responsible_sports_betting: "Apuestas deportivas responsables",
      sports_data_stats: "Datos/estadísticas deportivas",
      fantasy_trading: "Fantasy/trading deportivo",
      sports_community: "Comunidad deportiva",
      other: "Otro",
    },
    checks: {
      responsible:
        "Entiendo que prevIA es una herramienta auxiliar de análisis, no un servicio de pick, señal o garantía.",
      noProfit:
        "Me comprometo a no prometer lucro, green garantizado, apuesta segura o resultado garantizado.",
      noApproval: "Entiendo que enviar la candidatura no garantiza aprobación.",
      contact: "Acepto ser contactado por el equipo de prevIA sobre esta candidatura.",
    },
    terms: {
      acceptedLabel: "Leí y acepto los términos del Programa de Socios prevIA.",
      open: "Ver términos",
      title: "Términos del Programa de Socios",
      closeAria: "Cerrar",
      intro:
        "Al enviar tu candidatura, declaras que conoces y aceptas los compromisos básicos de comunicación responsable del Programa de Socios prevIA.",
      review:
        "La aprobación es manual y depende de la evaluación del perfil, canales, lenguaje, alineación con la marca y comunicación responsable.",
      acceptButton: "Leí y acepto los términos",
      closeButton: "Cerrar",
    },
    submit: "Enviar candidatura",
    sending: "Enviando...",
    success:
      "Candidatura recibida con éxito. Vamos a evaluar los datos y contactaremos si hay alineamiento.",
    error: "No fue posible enviar la candidatura ahora. Inténtalo nuevamente.",
    selectPlaceholder: "Selecciona",
    privacy:
      "Usaremos estos datos solo para evaluar la candidatura, contactarte y organizar el Programa de Socios prevIA.",
  },
} as const;

const PLATFORM_OPTIONS = ["instagram", "youtube", "tiktok", "x", "telegram", "site", "other"] as const;

const AUDIENCE_OPTIONS: AudienceSizeRange[] = [
  "up_to_5k",
  "5k_20k",
  "20k_50k",
  "50k_100k",
  "100k_plus",
];

const CONTENT_OPTIONS: ContentType[] = [
  "football_analysis",
  "responsible_sports_betting",
  "sports_data_stats",
  "fantasy_trading",
  "sports_community",
  "other",
];

export function PublicPartnersPage() {
  const { lang } = useParams<{ lang: string }>();
  const currentLang = coercePublicLang(lang);
  const copy = COPY[currentLang] ?? COPY.pt;

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

  const acceptedTerms =
    form.accepted_responsible_disclosure &&
    form.accepted_no_profit_promises &&
    form.accepted_not_guaranteed_approval &&
    form.accepted_contact;

  function updateTermsAccepted(value: boolean) {
    setForm((current) => ({
      ...current,
      accepted_responsible_disclosure: value,
      accepted_no_profit_promises: value,
      accepted_not_guaranteed_approval: value,
      accepted_contact: value,
    }));
  }

  const disabled =
    busy ||
    !form.full_name.trim() ||
    !form.public_name.trim() ||
    !form.email.trim() ||
    !form.whatsapp.trim() ||
    !form.main_social_platform.trim() ||
    !form.main_social_url.trim() ||
    !form.audience_size_range ||
    !form.content_type ||
    !form.promotion_plan.trim() ||
    !acceptedTerms;

  usePublicSeo({
    lang: currentLang,
    path:
      currentLang === "pt"
        ? `/${currentLang}/parceiros`
        : currentLang === "es"
        ? `/${currentLang}/socios`
        : `/${currentLang}/partners`,
    title: copy.seoTitle,
    description: copy.seoDescription,
  });

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;

    setBusy(true);
    setSuccess(null);
    setError(null);

    try {
      await submitPartnerApplication({
        full_name: form.full_name.trim(),
        public_name: form.public_name.trim(),
        email: form.email.trim(),
        whatsapp: form.whatsapp.trim(),
        lang: currentLang,
        main_social_platform: form.main_social_platform.trim(),
        main_social_url: form.main_social_url.trim(),
        audience_size_range: form.audience_size_range as AudienceSizeRange,
        content_type: form.content_type as ContentType,
        promotion_plan: form.promotion_plan.trim(),
        other_social_urls: form.other_social_urls.trim() || undefined,
        city_state: form.city_state.trim() || undefined,
        media_kit_url: form.media_kit_url.trim() || undefined,
        notes: form.notes.trim() || undefined,
        accepted_responsible_disclosure: form.accepted_responsible_disclosure,
        accepted_no_profit_promises: form.accepted_no_profit_promises,
        accepted_not_guaranteed_approval: form.accepted_not_guaranteed_approval,
        accepted_contact: form.accepted_contact,
        source: "public_partner_application_form",
        website: form.website.trim() || undefined,
      });

      setSuccess(copy.success);
      setForm(INITIAL_FORM);
    } catch (err) {
      setError(copy.error);
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-partners-page">
      <section className="public-hero public-hero-compact-top">
        <div className="public-hero-card public-hero-card-split public-partners-hero">
          <div className="public-hero-main">
            <div className="public-eyebrow">{copy.eyebrow}</div>
            <h1 className="public-title">{copy.title}</h1>
            <p className="public-body">{copy.body}</p>

            <div className="public-actions public-partners-hero-actions">
              <a href="#partner-application-form" className="public-btn public-btn-primary">
                {copy.cta}
              </a>
            </div>
          </div>

          <aside className="public-hero-sidecard public-partners-sidecard">
            <p className="public-hero-sidecard-kicker">{copy.sideKicker}</p>
            <h2 className="public-hero-sidecard-title">{copy.sideTitle}</h2>
            <p className="public-hero-sidecard-body">{copy.sideBody}</p>
          </aside>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head compact">
          <div className="public-eyebrow">{copy.stepsEyebrow}</div>
          <h2 className="landing-section-title">{copy.stepsTitle}</h2>
        </div>

        <div className="landing-step-grid public-partners-step-grid">
          {copy.steps.map((item, index) => (
            <article key={item.title} className="landing-step-card landing-step-card-compact">
              <div className="landing-step-number">{index + 1}</div>
              <h3 className="landing-card-title">{item.title}</h3>
              <p className="landing-card-body">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section public-partners-two-col">
        <article className="public-info-card public-partners-offer-card">
          <h2 className="public-info-card-title">{copy.offerTitle}</h2>
          <ul className="public-partners-check-list">
            {copy.offers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="public-info-card public-partners-compliance-card">
          <h2 className="public-info-card-title">{copy.complianceTitle}</h2>

          <div className="public-partners-compliance-grid">
            <div>
              <h3>{copy.allowedTitle}</h3>
              <ul>
                {copy.allowed.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3>{copy.forbiddenTitle}</h3>
              <ul>
                {copy.forbidden.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </section>

      <section id="partner-application-form" className="landing-section public-partners-form-section">
        <div className="landing-section-head compact">
          <div className="public-eyebrow">{copy.formEyebrow}</div>
          <h2 className="landing-section-title">{copy.formTitle}</h2>
          <p className="landing-section-body">{copy.formHelper}</p>
        </div>

        <form className="beta-form-card beta-form-card-strong public-partners-form" onSubmit={onSubmit}>
          <label className="partner-application-honeypot" aria-hidden="true">
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(e) => updateField("website", e.target.value)}
            />
          </label>

          <div className="beta-form-grid">
            <label className="beta-field">
              <span>{copy.fields.full_name}</span>
              <input
                value={form.full_name}
                onChange={(e) => updateField("full_name", e.target.value)}
                placeholder={copy.placeholders.full_name}
              />
            </label>

            <label className="beta-field">
              <span>{copy.fields.public_name}</span>
              <input
                value={form.public_name}
                onChange={(e) => updateField("public_name", e.target.value)}
                placeholder={copy.placeholders.public_name}
              />
            </label>

            <label className="beta-field">
              <span>{copy.fields.email}</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder={copy.placeholders.email}
              />
            </label>

            <label className="beta-field">
              <span>{copy.fields.whatsapp}</span>
              <input
                value={form.whatsapp}
                onChange={(e) => updateField("whatsapp", e.target.value)}
                placeholder={copy.placeholders.whatsapp}
              />
            </label>

            <label className="beta-field">
              <span>{copy.fields.main_social_platform}</span>
              <select
                value={form.main_social_platform}
                onChange={(e) => updateField("main_social_platform", e.target.value)}
              >
                {PLATFORM_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {copy.platforms[item]}
                  </option>
                ))}
              </select>
            </label>

            <label className="beta-field">
              <span>{copy.fields.main_social_url}</span>
              <input
                type="url"
                value={form.main_social_url}
                onChange={(e) => updateField("main_social_url", e.target.value)}
                placeholder={copy.placeholders.main_social_url}
              />
            </label>

            <label className="beta-field">
              <span>{copy.fields.audience_size_range}</span>
              <select
                value={form.audience_size_range}
                onChange={(e) =>
                  updateField("audience_size_range", e.target.value as AudienceSizeRange | "")
                }
              >
                <option value="">{copy.selectPlaceholder}</option>
                {AUDIENCE_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {copy.audienceOptions[item]}
                  </option>
                ))}
              </select>
            </label>

            <label className="beta-field">
              <span>{copy.fields.content_type}</span>
              <select
                value={form.content_type}
                onChange={(e) => updateField("content_type", e.target.value as ContentType | "")}
              >
                <option value="">{copy.selectPlaceholder}</option>
                {CONTENT_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {copy.contentOptions[item]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="beta-field beta-field-full">
            <span>{copy.fields.promotion_plan}</span>
            <textarea
              value={form.promotion_plan}
              onChange={(e) => updateField("promotion_plan", e.target.value)}
              placeholder={copy.placeholders.promotion_plan}
              rows={5}
            />
          </label>

          <div className="beta-form-grid public-partners-optional-grid">
            <label className="beta-field">
              <span>{copy.fields.other_social_urls}</span>
              <textarea
                value={form.other_social_urls}
                onChange={(e) => updateField("other_social_urls", e.target.value)}
                placeholder={copy.placeholders.other_social_urls}
                rows={3}
              />
            </label>

            <label className="beta-field">
              <span>{copy.fields.notes}</span>
              <textarea
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder={copy.placeholders.notes}
                rows={3}
              />
            </label>

            <label className="beta-field">
              <span>{copy.fields.city_state}</span>
              <input
                value={form.city_state}
                onChange={(e) => updateField("city_state", e.target.value)}
                placeholder={copy.placeholders.city_state}
              />
            </label>

            <label className="beta-field">
              <span>{copy.fields.media_kit_url}</span>
              <input
                type="url"
                value={form.media_kit_url}
                onChange={(e) => updateField("media_kit_url", e.target.value)}
                placeholder={copy.placeholders.media_kit_url}
              />
            </label>
          </div>

          <div className="public-partners-checks public-partners-terms-compact">
            <label>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => updateTermsAccepted(e.target.checked)}
              />
              <span>
                {copy.terms.acceptedLabel}{" "}
                <button
                  type="button"
                  className="public-partners-terms-link"
                  onClick={() => setTermsOpen(true)}
                >
                  {copy.terms.open}
                </button>
              </span>
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
      {termsOpen ? (
        <div
          className="public-partners-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="partner-terms-title"
          onClick={() => setTermsOpen(false)}
        >
          <div className="public-partners-modal" onClick={(e) => e.stopPropagation()}>
            <div className="public-partners-modal-head">
              <h2 id="partner-terms-title">{copy.terms.title}</h2>
              <button
                type="button"
                className="public-partners-modal-close"
                onClick={() => setTermsOpen(false)}
                aria-label={copy.terms.closeAria}
              >
                ×
              </button>
            </div>

            <div className="public-partners-modal-body">
              <p>{copy.terms.intro}</p>

              <ul>
                <li>{copy.checks.responsible}</li>
                <li>{copy.checks.noProfit}</li>
                <li>{copy.checks.noApproval}</li>
                <li>{copy.checks.contact}</li>
              </ul>

              <p>{copy.terms.review}</p>
            </div>

            <div className="public-partners-modal-actions">
              <button
                type="button"
                className="public-btn public-btn-primary"
                onClick={() => {
                  updateTermsAccepted(true);
                  setTermsOpen(false);
                }}
              >
                {copy.terms.acceptButton}
              </button>

              <button
                type="button"
                className="public-btn public-btn-secondary"
                onClick={() => setTermsOpen(false)}
              >
                {copy.terms.closeButton}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}