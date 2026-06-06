import React, { useMemo, useState } from "react";
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

const PARTNER_CALCULATOR_DEFAULT_SUBSCRIBERS = 20;
const PARTNER_CALCULATOR_COMMISSION_RATE = 0.5;
const PARTNER_CALCULATOR_MONTHS = 3;

const PARTNER_PLAN_MIX = [
  {
    key: "basic",
    weight: 0.5,
    monthlyPrice: 14.9,
  },
  {
    key: "light",
    weight: 0.35,
    monthlyPrice: 39.9,
  },
  {
    key: "pro",
    weight: 0.15,
    monthlyPrice: 69.9,
  },
] as const;

function clampSubscriberEstimate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5000, Math.floor(value)));
}

function formatBrlCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function onlyDigits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function formatBrazilianWhatsapp(value: string): string {
  const digits = onlyDigits(value).slice(0, 13);

  if (!digits) return "";

  const hasBrazilCountryCode = digits.startsWith("55") && digits.length > 11;
  const nationalDigits = hasBrazilCountryCode ? digits.slice(2, 13) : digits.slice(0, 11);

  const ddd = nationalDigits.slice(0, 2);
  const firstPart =
    nationalDigits.length > 10 ? nationalDigits.slice(2, 7) : nationalDigits.slice(2, 6);
  const secondPart =
    nationalDigits.length > 10 ? nationalDigits.slice(7, 11) : nationalDigits.slice(6, 10);

  let formatted = hasBrazilCountryCode ? "+55" : "";

  if (ddd) {
    formatted += `${formatted ? " " : ""}(${ddd}`;
  }

  if (ddd.length === 2) {
    formatted += ")";
  }

  if (firstPart) {
    formatted += ` ${firstPart}`;
  }

  if (secondPart) {
    formatted += `-${secondPart}`;
  }

  return formatted;
}

function formatWhatsappInput(value: string): string {
  return formatBrazilianWhatsapp(value);
}

const PROMOTION_PLAN_MIN_LENGTH = 10;

const COPY = {
  pt: {
    seoTitle: "Ganhe dinheiro indicando o prevIA | Programa de Parceiros",
    seoDescription:
      "Se você cria conteúdo sobre futebol, odds ou apostas esportivas, candidate-se ao Programa de Parceiros prevIA e receba comissão por assinaturas confirmadas.",
    eyebrow: "Programa de Parceiros",
    title: "Ganhe dinheiro indicando o prevIA.",
    body:
      "Se você cria conteúdo sobre futebol, odds, estatísticas ou apostas esportivas, transforme sua audiência em renda extra indicando uma ferramenta séria de análise. Você divulga seu link oficial e pode receber comissão quando seus seguidores virarem assinantes confirmados.",
    cta: "Quero ser parceiro",
    heroBullets: [
      "Comissão por assinaturas confirmadas",
      "Link oficial para divulgar nas redes",
      "Painel para acompanhar suas indicações",
    ],
    sideKicker: "Renda extra com sua audiência",
    sideTitle: "Indique o prevIA nas suas redes e receba comissão por assinantes elegíveis.",
    sideBody:
      "Após aprovação e contrato, você recebe campanhas oficiais, link rastreável e acesso ao painel do parceiro. Sem promessa de aposta certa: o foco é análise, probabilidade e uso responsável.",
    stepsEyebrow: "Como funciona",
    stepsTitle: "Indique, acompanhe e receba comissão.",
    steps: [
      {
        title: "Você se candidata",
        body: "Conte sobre seu canal, sua audiência e como pretende divulgar o prevIA nas redes ou comunidades.",
      },
      {
        title: "Criamos seu link oficial",
        body: "Após aprovação manual, contrato e campanha oficial, você recebe um link rastreável para divulgar.",
      },
      {
        title: "Você ganha por assinaturas",
        body: "Quando alguém assina pelo seu link, a indicação é registrada e a comissão é apurada sobre pagamentos confirmados.",
      },
    ],
    formEyebrow: "Candidatura",
    formTitle: "Candidate-se para ganhar comissão indicando o prevIA",
    formHelper:
      "A candidatura não cria parceria automaticamente. A equipe prevIA avalia o perfil, a audiência e o alinhamento com divulgação responsável antes de liberar link oficial, contrato e painel do parceiro.",
    offerTitle: "Por que virar parceiro",
    offers: [
      "Possibilidade de renda extra com sua audiência esportiva",
      "Comissão por assinaturas elegíveis e pagamentos confirmados",
      "Link ou campanha oficial para divulgar nas redes",
      "Painel do parceiro para acompanhar indicações após aprovação",
    ],
    calculator: {
      eyebrow: "Simulação de ganhos",
      title: "Quanto você poderia ganhar indicando o prevIA?",
      body:
        "Preencha uma estimativa de assinantes que você acredita conseguir trazer. A simulação usa uma distribuição básica entre planos e considera comissão sobre pagamentos confirmados.",
      inputLabel: "Assinantes indicados estimados",
      inputSuffix: "assinantes",
      generatedRevenue: "Receita mensal estimada gerada",
      monthlyCommission: "Comissão estimada por mês",
      threeMonthCommission: "Estimativa nos 3 primeiros meses",
      planMixTitle: "Distribuição usada na simulação",
      planMixBody:
        "Mix ilustrativo: Basic 50%, Light 35% e Pro 15%, usando preços atuais em R$.",
      commissionNote: "Comissão simulada: 50% sobre pagamentos confirmados.",
      disclaimer:
        "Simulação meramente ilustrativa. Não representa promessa de ganho, renda garantida ou aprovação automática. Valores reais dependem do contrato vigente, assinaturas elegíveis, pagamentos confirmados, cancelamentos, reembolsos e período de validação.",
      plans: {
        basic: "Basic",
        light: "Light",
        pro: "Pro",
      },
    },
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
    validation: {
      promotionPlanMinLength:
        "Descreva como pretende divulgar o prevIA com pelo menos 10 caracteres.",
    },
    selectPlaceholder: "Selecione",
    privacy:
      "Usaremos esses dados apenas para avaliar a candidatura, entrar em contato e organizar o Programa de Parceiros prevIA.",
  },
  en: {
    seoTitle: "Earn money by recommending prevIA | Partner Program",
    seoDescription:
      "If you create content about football, odds, or sports betting, apply to the prevIA Partner Program and earn commission on confirmed subscriptions.",
    eyebrow: "Partner Program",
    title: "Earn money by recommending prevIA.",
    body:
      "If you create content about football, odds, stats, or sports betting, turn your audience into an extra revenue stream by recommending a serious analysis tool. Share your official link and you may earn commission when your followers become confirmed subscribers.",
    cta: "I want to partner",
    heroBullets: [
      "Commission on confirmed subscriptions",
      "Official link for your channels",
      "Partner Console to track referrals",
    ],
    sideKicker: "Extra income from your audience",
    sideTitle: "Recommend prevIA on your channels and earn commission from eligible subscribers.",
    sideBody:
      "After approval and contract, you receive official campaigns, a trackable link, and Partner Console access. No sure-bet promises: the focus is analysis, probability, and responsible use.",
    stepsEyebrow: "How it works",
    stepsTitle: "Recommend, track, and earn commission.",
    steps: [
      {
        title: "You apply",
        body: "Tell us about your channel, your audience, and how you plan to promote prevIA across your networks or communities.",
      },
      {
        title: "We create your official link",
        body: "After manual approval, contract, and official campaign setup, you receive a trackable link to share.",
      },
      {
        title: "You earn from subscriptions",
        body: "When someone subscribes through your link, the referral is registered and commission is calculated on confirmed payments.",
      },
    ],
    formEyebrow: "Application",
    formTitle: "Apply to earn commission by recommending prevIA",
    formHelper:
      "This application does not automatically create a partnership. The prevIA team reviews your profile, audience, and responsible promotion fit before enabling an official link, contract, and Partner Console.",
    offerTitle: "Why become a partner",
    offers: [
      "Potential extra income from your sports audience",
      "Commission on eligible subscriptions and confirmed payments",
      "Official link or campaign to share across your channels",
      "Partner Console to track referrals after approval",
    ],
    calculator: {
      eyebrow: "Earnings simulation",
      title: "How much could you earn by recommending prevIA?",
      body:
        "Enter an estimate of subscribers you believe you can bring. The simulation uses a basic plan distribution and considers commission on confirmed payments.",
      inputLabel: "Estimated referred subscribers",
      inputSuffix: "subscribers",
      generatedRevenue: "Estimated monthly revenue generated",
      monthlyCommission: "Estimated monthly commission",
      threeMonthCommission: "Estimated first 3 months",
      planMixTitle: "Plan distribution used",
      planMixBody:
        "Illustrative mix: Basic 50%, Light 35%, and Pro 15%, using current BRL prices.",
      commissionNote: "Simulated commission: 50% on confirmed payments.",
      disclaimer:
        "Illustrative simulation only. It is not a promise of earnings, guaranteed income, or automatic approval. Actual amounts depend on the active contract, eligible subscriptions, confirmed payments, cancellations, refunds, and validation period.",
      plans: {
        basic: "Basic",
        light: "Light",
        pro: "Pro",
      },
    },
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
    error: "We could not submit your application right now. Please try again.",
    validation: {
      promotionPlanMinLength:
        "Please describe how you plan to promote prevIA using at least 10 characters.",
    },
    selectPlaceholder: "Select",
    privacy:
      "We will use this information only to review your application, contact you, and organize the prevIA Partner Program.",
  },
  es: {
    seoTitle: "Gana dinero recomendando prevIA | Programa de Socios",
    seoDescription:
      "Si creas contenido sobre fútbol, odds o apuestas deportivas, postúlate al Programa de Socios prevIA y recibe comisión por suscripciones confirmadas.",
    eyebrow: "Programa de Socios",
    title: "Gana dinero recomendando prevIA.",
    body:
      "Si creas contenido sobre fútbol, odds, estadísticas o apuestas deportivas, transforma tu audiencia en una fuente de ingresos extra recomendando una herramienta seria de análisis. Divulga tu link oficial y puedes recibir comisión cuando tus seguidores se conviertan en suscriptores confirmados.",
    cta: "Quiero ser socio",
    heroBullets: [
      "Comisión por suscripciones confirmadas",
      "Link oficial para divulgar en tus redes",
      "Panel para seguir tus indicaciones",
    ],
    sideKicker: "Ingresos extra con tu audiencia",
    sideTitle: "Recomienda prevIA en tus redes y recibe comisión por suscriptores elegibles.",
    sideBody:
      "Después de la aprobación y el contrato, recibes campañas oficiales, link rastreable y acceso al panel del socio. Sin promesas de apuesta segura: el foco es análisis, probabilidad y uso responsable.",
    stepsEyebrow: "Cómo funciona",
    stepsTitle: "Recomienda, sigue y recibe comisión.",
    steps: [
      {
        title: "Te postulas",
        body: "Cuéntanos sobre tu canal, audiencia y cómo planeas divulgar prevIA en redes o comunidades.",
      },
      {
        title: "Creamos tu link oficial",
        body: "Después de aprobación manual, contrato y campaña oficial, recibes un link rastreable para divulgar.",
      },
      {
        title: "Ganas por suscripciones",
        body: "Cuando alguien se suscribe por tu link, la indicación queda registrada y la comisión se calcula sobre pagos confirmados.",
      },
    ],
    formEyebrow: "Candidatura",
    formTitle: "Postúlate para ganar comisión recomendando prevIA",
    formHelper:
      "La candidatura no crea una alianza automáticamente. El equipo de prevIA evalúa perfil, audiencia y alineación con divulgación responsable antes de liberar link oficial, contrato y panel del socio.",
    offerTitle: "Por qué ser socio",
    offers: [
      "Posibilidad de ingresos extra con tu audiencia deportiva",
      "Comisión por suscripciones elegibles y pagos confirmados",
      "Link o campaña oficial para divulgar en tus redes",
      "Panel del socio para seguir indicaciones después de la aprobación",
    ],
    calculator: {
      eyebrow: "Simulación de ingresos",
      title: "¿Cuánto podrías ganar recomendando prevIA?",
      body:
        "Ingresa una estimación de suscriptores que crees que puedes traer. La simulación usa una distribución básica entre planes y considera comisión sobre pagos confirmados.",
      inputLabel: "Suscriptores indicados estimados",
      inputSuffix: "suscriptores",
      generatedRevenue: "Ingresos mensuales estimados generados",
      monthlyCommission: "Comisión mensual estimada",
      threeMonthCommission: "Estimación en los 3 primeros meses",
      planMixTitle: "Distribución usada en la simulación",
      planMixBody:
        "Mix ilustrativo: Basic 50%, Light 35% y Pro 15%, usando precios actuales en R$.",
      commissionNote: "Comisión simulada: 50% sobre pagos confirmados.",
      disclaimer:
        "Simulación meramente ilustrativa. No representa promesa de ganancia, ingreso garantizado o aprobación automática. Los valores reales dependen del contrato vigente, suscripciones elegibles, pagos confirmados, cancelaciones, reembolsos y período de validación.",
      plans: {
        basic: "Basic",
        light: "Light",
        pro: "Pro",
      },
    },
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
    error: "No fue posible enviar tu candidatura ahora. Inténtalo nuevamente.",
    validation: {
      promotionPlanMinLength:
        "Describe cómo planeas divulgar prevIA con al menos 10 caracteres.",
    },
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

  const [subscriberEstimate, setSubscriberEstimate] = useState(
    PARTNER_CALCULATOR_DEFAULT_SUBSCRIBERS
  );

  const calculator = useMemo(() => {
    const subscribers = clampSubscriberEstimate(subscriberEstimate);

    const estimatedMonthlyRevenue = PARTNER_PLAN_MIX.reduce((total, plan) => {
      return total + subscribers * plan.weight * plan.monthlyPrice;
    }, 0);

    const estimatedMonthlyCommission =
      estimatedMonthlyRevenue * PARTNER_CALCULATOR_COMMISSION_RATE;

    return {
      subscribers,
      estimatedMonthlyRevenue,
      estimatedMonthlyCommission,
      estimatedThreeMonthCommission:
        estimatedMonthlyCommission * PARTNER_CALCULATOR_MONTHS,
      planRows: PARTNER_PLAN_MIX.map((plan) => ({
        ...plan,
        estimatedSubscribers: subscribers * plan.weight,
        estimatedMonthlyRevenue: subscribers * plan.weight * plan.monthlyPrice,
      })),
    };
  }, [subscriberEstimate]);

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

  const promotionPlanLength = form.promotion_plan.trim().length;
  const promotionPlanTooShort =
    promotionPlanLength > 0 && promotionPlanLength < PROMOTION_PLAN_MIN_LENGTH;

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
    promotionPlanLength < PROMOTION_PLAN_MIN_LENGTH ||
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

    if (form.promotion_plan.trim().length < PROMOTION_PLAN_MIN_LENGTH) {
      setSuccess(null);
      setError(copy.validation.promotionPlanMinLength);
      return;
    }

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
      const message = err instanceof Error ? err.message : "";

      if (message.includes("promotion_plan") && message.includes("string_too_short")) {
        setError(copy.validation.promotionPlanMinLength);
      } else {
        setError(copy.error);
      }

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

            <ul className="public-partners-hero-bullets">
              {copy.heroBullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

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

      <section className="landing-section public-partners-calculator-section">
        <div className="public-partners-calculator-card">
          <div className="public-partners-calculator-copy">
            <div className="public-eyebrow">{copy.calculator.eyebrow}</div>
            <h2 className="landing-section-title">{copy.calculator.title}</h2>
            <p className="landing-section-body">{copy.calculator.body}</p>

            <label className="public-partners-calculator-input">
              <span>{copy.calculator.inputLabel}</span>
              <div>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={1}
                  value={calculator.subscribers}
                  onChange={(e) =>
                    setSubscriberEstimate(clampSubscriberEstimate(Number(e.target.value)))
                  }
                />
                <small>{copy.calculator.inputSuffix}</small>
              </div>
            </label>

            <p className="public-partners-calculator-note">
              {copy.calculator.commissionNote}
            </p>
          </div>

          <div className="public-partners-calculator-results">
            <div className="public-partners-calculator-metric muted">
              <span>{copy.calculator.generatedRevenue}</span>
              <strong>{formatBrlCurrency(calculator.estimatedMonthlyRevenue)}</strong>
            </div>

            <div className="public-partners-calculator-metric">
              <span>{copy.calculator.monthlyCommission}</span>
              <strong>{formatBrlCurrency(calculator.estimatedMonthlyCommission)}</strong>
            </div>

            <div className="public-partners-calculator-metric highlight">
              <span>{copy.calculator.threeMonthCommission}</span>
              <strong>{formatBrlCurrency(calculator.estimatedThreeMonthCommission)}</strong>
            </div>

            <div className="public-partners-plan-mix">
              <h3>{copy.calculator.planMixTitle}</h3>
              <p>{copy.calculator.planMixBody}</p>

              <div className="public-partners-plan-mix-list">
                {calculator.planRows.map((plan) => (
                  <div key={plan.key} className="public-partners-plan-mix-row">
                    <div>
                      <strong>{copy.calculator.plans[plan.key]}</strong>
                      <span>
                        {formatPercent(plan.weight)} ·{" "}
                        {formatBrlCurrency(plan.monthlyPrice)}/mês
                      </span>
                    </div>
                    <b>{formatBrlCurrency(plan.estimatedMonthlyRevenue)}</b>
                  </div>
                ))}
              </div>
            </div>

            <p className="public-partners-calculator-disclaimer">
              {copy.calculator.disclaimer}
            </p>
          </div>
        </div>
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
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.whatsapp}
                onChange={(e) => updateField("whatsapp", formatWhatsappInput(e.target.value))}
                placeholder={copy.placeholders.whatsapp}
                maxLength={20}
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
              minLength={PROMOTION_PLAN_MIN_LENGTH}
              required
              aria-invalid={promotionPlanTooShort}
            />
            {promotionPlanTooShort ? (
              <small className="beta-field-hint beta-field-hint-error">
                {copy.validation.promotionPlanMinLength}
              </small>
            ) : (
              <small className="beta-field-hint">
                {promotionPlanLength}/{PROMOTION_PLAN_MIN_LENGTH} caracteres mínimos.
              </small>
            )}
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