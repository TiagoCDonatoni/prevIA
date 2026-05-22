import React from "react";
import { useParams } from "react-router-dom";

import "../worldcup-pool.css";

import type { Lang } from "../../i18n";
import { ENABLE_WORLDCUP_POOL } from "../../config";
import { coercePublicLang } from "../lib/publicLang";
import { usePublicSeo } from "../lib/publicSeo";
import {
  fetchWorldCupPoolStatus,
  type WorldCupPoolStatusResponse,
} from "../api/publicClient";
import { WorldCupPoolCreateForm } from "../components/WorldCupPoolCreateForm";

const COPY = {
  pt: {
    seoTitle: "Bolão da Copa 2026 grátis | Crie seu bolão online | prevIA",
    seoDescription:
      "Crie um Bolão da Copa 2026 grátis, compartilhe o link com amigos, receba palpites com e-mail e PIN e acompanhe o ranking do grupo pelo celular.",
    unavailableTitle: "Bolão temporariamente indisponível",
    unavailableBody:
      "A criação de novos bolões está temporariamente pausada. Os bolões já criados continuam acessíveis pelos links de convite e painel.",
    eyebrow: "Bolão da Copa 2026",
    fallbackTitle: "Crie seu Bolão da Copa 2026 grátis",
    fallbackSubtitle:
      "Monte seu bolão online, compartilhe o link no grupo e acompanhe os palpites da Copa em um ranking simples, leve e feito para celular.",
    primaryCta: "Criar bolão grátis",
    secondaryCta: "Ver como funciona",
    heroNote:
      "Ideal para grupos de WhatsApp, família, empresa, bar, turma da faculdade e comunidades de futebol.",
    chips: ["Grátis para criar", "Link de convite", "Ranking automático", "Sem aposta financeira"],
    audienceTitle: "Perfeito para qualquer grupo",
    audienceItems: [
      "Grupo de WhatsApp",
      "Bolão da firma",
      "Família e amigos",
      "Turma da faculdade",
      "Bar ou comunidade de futebol",
      "Grupo de clientes ou parceiros",
    ],
    previewTitle: "Como funciona",
    previewItems: [
      {
        title: "1. Crie o bolão",
        body: "Defina o nome do bolão, informe seus dados e gere o painel do organizador.",
      },
      {
        title: "2. Compartilhe o convite",
        body: "Envie o link para o grupo. Cada participante entra com nome, e-mail e PIN.",
      },
      {
        title: "3. Todo mundo palpita",
        body: "Os jogos disponíveis aparecem no painel e cada pessoa salva seus placares antes do início das partidas.",
      },
      {
        title: "4. Acompanhe o ranking",
        body: "O ranking do bolão ajuda o grupo a acompanhar a competição e manter a resenha viva durante a Copa.",
      },
    ],
    scoringTitle: "Pontuação simples para todo mundo entender",
    scoringBody:
      "A regra foi pensada para ser fácil de explicar no grupo: placar exato vale mais, resultado correto mantém a disputa aberta e acertos parciais ajudam a diferenciar os participantes.",
    scoringExamples: [
      "Placar exato: 5 pontos",
      "Resultado correto: 3 pontos",
      "Gol exato de um time: ponto parcial",
      "Ranking organizado por pontos",
    ],
    trustTitle: "Bolão recreativo, sem aposta financeira",
    trustBody:
      "O Bolão da Copa prevIA é uma ferramenta de diversão e ranking entre amigos. Não envolve dinheiro, prêmios financeiros, intermediação de pagamentos ou promessa de ganho.",
    viralTitle: "Feito para compartilhar",
    viralCards: [
      {
        title: "Organizador no controle",
        body: "O criador do bolão acessa um painel próprio para ver participantes, convite, ranking e andamento do grupo.",
      },
      {
        title: "Participação simples",
        body: "Nada de conta complexa: o participante usa e-mail e PIN para voltar ao próprio painel quando quiser.",
      },
      {
        title: "Experiência leve",
        body: "A interface foi pensada para celular, compartilhamento rápido e uso direto pelo link recebido no grupo.",
      },
    ],
    faqTitle: "Dúvidas frequentes",
    faqs: [
      {
        question: "O Bolão da Copa é grátis?",
        answer:
          "Sim. Você pode criar um bolão gratuitamente, gerar o link de convite e compartilhar com seu grupo.",
      },
      {
        question: "Preciso instalar aplicativo?",
        answer:
          "Não. O bolão funciona pelo navegador, no celular ou computador, usando o link de convite.",
      },
      {
        question: "Como os participantes entram no bolão?",
        answer:
          "Cada participante entra pelo link do bolão, informa nome, e-mail e cria um PIN de 4 dígitos para voltar depois.",
      },
      {
        question: "O bolão envolve aposta financeira?",
        answer:
          "Não. É uma experiência recreativa de palpites e ranking. Não há aposta financeira, pagamento, prêmio em dinheiro ou promessa de ganho.",
      },
      {
        question: "Posso criar um bolão para empresa?",
        answer:
          "Sim. O bolão é uma boa opção para empresas, times internos, clientes, parceiros e grupos de trabalho.",
      },
      {
        question: "Posso compartilhar pelo WhatsApp?",
        answer:
          "Sim. Depois de criar o bolão, você recebe um link para copiar e compartilhar com o grupo.",
      },
    ],
    productCtaTitle: "O bolão é diversão. O prevIA é análise com dados.",
    productCtaBody:
      "O Bolão da Copa é uma experiência recreativa, sem aposta financeira. Para quem quer analisar futebol com odds, probabilidade, preço justo e contexto de mercado, o prevIA continua sendo o produto principal.",
  },
  en: {
    seoTitle: "Free World Cup 2026 pool | Create an online football pool | prevIA",
    seoDescription:
      "Create a free World Cup 2026 pool, share the invite link with friends, collect predictions with email and PIN, and follow the group leaderboard on mobile.",
    unavailableTitle: "Pool temporarily unavailable",
    unavailableBody:
      "New pool creation is temporarily paused. Existing pools remain accessible through their invite and dashboard links.",
    eyebrow: "World Cup 2026 pool",
    fallbackTitle: "Create your free World Cup 2026 Pool",
    fallbackSubtitle:
      "Launch an online pool, share the invite link with your group, and follow World Cup predictions through a simple mobile-first leaderboard.",
    primaryCta: "Create free pool",
    secondaryCta: "See how it works",
    heroNote:
      "Built for WhatsApp groups, families, offices, college groups, bars, and football communities.",
    chips: ["Free to create", "Invite link", "Automatic ranking", "No financial betting"],
    audienceTitle: "Perfect for any group",
    audienceItems: [
      "WhatsApp groups",
      "Office pools",
      "Family and friends",
      "College groups",
      "Bars and football communities",
      "Client or partner groups",
    ],
    previewTitle: "How it works",
    previewItems: [
      {
        title: "1. Create the pool",
        body: "Choose a pool name, enter your details, and generate the organizer dashboard.",
      },
      {
        title: "2. Share the invite",
        body: "Send the link to the group. Each participant joins with name, email, and PIN.",
      },
      {
        title: "3. Everyone predicts",
        body: "Available matches appear in the dashboard and each person saves scores before kickoff.",
      },
      {
        title: "4. Follow the leaderboard",
        body: "The pool leaderboard helps the group follow the competition and keep the banter alive during the World Cup.",
      },
    ],
    scoringTitle: "Simple scoring everyone can understand",
    scoringBody:
      "The scoring system is easy to explain: exact scores matter most, correct outcomes keep the game open, and partial hits help separate participants.",
    scoringExamples: [
      "Exact score: 5 points",
      "Correct outcome: 3 points",
      "Exact team goals: partial point",
      "Leaderboard sorted by points",
    ],
    trustTitle: "A recreational pool with no financial betting",
    trustBody:
      "The prevIA World Cup Pool is a fun ranking tool for friends and groups. It does not involve money, financial prizes, payment handling, or any promise of profit.",
    viralTitle: "Built to share",
    viralCards: [
      {
        title: "Organizer in control",
        body: "The pool creator gets a dedicated dashboard to view participants, invite links, rankings, and group progress.",
      },
      {
        title: "Simple participation",
        body: "No complex account flow: each participant uses email and PIN to return to their own dashboard.",
      },
      {
        title: "Lightweight experience",
        body: "The interface is designed for mobile use, fast sharing, and direct access from the group invite link.",
      },
    ],
    faqTitle: "Frequently asked questions",
    faqs: [
      {
        question: "Is the World Cup Pool free?",
        answer:
          "Yes. You can create a pool for free, generate an invite link, and share it with your group.",
      },
      {
        question: "Do I need to install an app?",
        answer:
          "No. The pool works in the browser, on mobile or desktop, through the invite link.",
      },
      {
        question: "How do participants join?",
        answer:
          "Each participant opens the pool link, enters their name and email, and creates a 4-digit PIN to return later.",
      },
      {
        question: "Does the pool involve financial betting?",
        answer:
          "No. It is a recreational prediction and ranking experience. There is no financial betting, payment, cash prize, or promise of profit.",
      },
      {
        question: "Can I create a pool for my company?",
        answer:
          "Yes. It works well for companies, internal teams, clients, partners, and work groups.",
      },
      {
        question: "Can I share it on WhatsApp?",
        answer:
          "Yes. After creating the pool, you get an invite link to copy and share with the group.",
      },
    ],
    productCtaTitle: "The pool is for fun. prevIA is for data-driven analysis.",
    productCtaBody:
      "The World Cup Pool is a recreational experience with no financial betting. For users who want football analysis with odds, probability, fair price, and market context, prevIA remains the main product.",
  },
  es: {
    seoTitle: "Porra del Mundial 2026 gratis | Crea tu porra online | prevIA",
    seoDescription:
      "Crea una Porra del Mundial 2026 gratis, comparte el enlace con amigos, recibe pronósticos con email y PIN y sigue el ranking del grupo desde el móvil.",
    unavailableTitle: "Porra temporalmente no disponible",
    unavailableBody:
      "La creación de nuevas porras está temporalmente pausada. Las porras ya creadas siguen accesibles por sus enlaces de invitación y panel.",
    eyebrow: "Porra del Mundial 2026",
    fallbackTitle: "Crea tu Porra del Mundial 2026 gratis",
    fallbackSubtitle:
      "Lanza una porra online, comparte el enlace con tu grupo y sigue los pronósticos del Mundial en un ranking simple y pensado para móvil.",
    primaryCta: "Crear porra gratis",
    secondaryCta: "Ver cómo funciona",
    heroNote:
      "Pensado para grupos de WhatsApp, familia, oficina, universidad, bares y comunidades de fútbol.",
    chips: ["Gratis para crear", "Enlace de invitación", "Ranking automático", "Sin apuesta financiera"],
    audienceTitle: "Perfecto para cualquier grupo",
    audienceItems: [
      "Grupos de WhatsApp",
      "Porra de la oficina",
      "Familia y amigos",
      "Grupos de universidad",
      "Bares y comunidades de fútbol",
      "Clientes o socios",
    ],
    previewTitle: "Cómo funciona",
    previewItems: [
      {
        title: "1. Crea la porra",
        body: "Define el nombre de la porra, informa tus datos y genera el panel del organizador.",
      },
      {
        title: "2. Comparte la invitación",
        body: "Envía el enlace al grupo. Cada participante entra con nombre, email y PIN.",
      },
      {
        title: "3. Todos pronostican",
        body: "Los partidos disponibles aparecen en el panel y cada persona guarda marcadores antes del inicio.",
      },
      {
        title: "4. Sigue el ranking",
        body: "El ranking de la porra ayuda al grupo a seguir la competencia y mantener la conversación durante el Mundial.",
      },
    ],
    scoringTitle: "Puntuación simple para que todos entiendan",
    scoringBody:
      "La regla está pensada para ser fácil de explicar: el marcador exacto vale más, el resultado correcto mantiene la disputa abierta y los aciertos parciales ayudan a diferenciar participantes.",
    scoringExamples: [
      "Marcador exacto: 5 puntos",
      "Resultado correcto: 3 puntos",
      "Goles exactos de un equipo: punto parcial",
      "Ranking ordenado por puntos",
    ],
    trustTitle: "Porra recreativa, sin apuesta financiera",
    trustBody:
      "La Porra del Mundial prevIA es una herramienta de diversión y ranking entre amigos. No implica dinero, premios financieros, intermediación de pagos ni promesa de ganancias.",
    viralTitle: "Hecho para compartir",
    viralCards: [
      {
        title: "Organizador en control",
        body: "El creador de la porra accede a un panel propio para ver participantes, invitación, ranking y avance del grupo.",
      },
      {
        title: "Participación simple",
        body: "Sin flujo complejo de cuenta: el participante usa email y PIN para volver a su propio panel.",
      },
      {
        title: "Experiencia ligera",
        body: "La interfaz está pensada para móvil, compartir rápido y entrar directo desde el enlace del grupo.",
      },
    ],
    faqTitle: "Preguntas frecuentes",
    faqs: [
      {
        question: "¿La Porra del Mundial es gratis?",
        answer:
          "Sí. Puedes crear una porra gratis, generar el enlace de invitación y compartirlo con tu grupo.",
      },
      {
        question: "¿Necesito instalar una aplicación?",
        answer:
          "No. La porra funciona en el navegador, en móvil o computadora, usando el enlace de invitación.",
      },
      {
        question: "¿Cómo entran los participantes?",
        answer:
          "Cada participante entra por el enlace de la porra, informa nombre y email, y crea un PIN de 4 dígitos para volver después.",
      },
      {
        question: "¿La porra implica apuesta financiera?",
        answer:
          "No. Es una experiencia recreativa de pronósticos y ranking. No hay apuesta financiera, pago, premio en dinero ni promesa de ganancia.",
      },
      {
        question: "¿Puedo crear una porra para empresa?",
        answer:
          "Sí. Funciona bien para empresas, equipos internos, clientes, socios y grupos de trabajo.",
      },
      {
        question: "¿Puedo compartirla por WhatsApp?",
        answer:
          "Sí. Después de crear la porra, recibes un enlace para copiar y compartir con el grupo.",
      },
    ],
    productCtaTitle: "La porra es diversión. prevIA es análisis con datos.",
    productCtaBody:
      "La Porra del Mundial es una experiencia recreativa, sin apuesta financiera. Para quien quiere analizar fútbol con cuotas, probabilidad, precio justo y contexto de mercado, prevIA sigue siendo el producto principal.",
  },
} as const;

function asLang(value: string | undefined): Lang {
  return coercePublicLang(value);
}

export function WorldCupPoolLandingPage() {
  const { lang } = useParams<{ lang: string }>();
  const currentLang = asLang(lang);
  const copy = COPY[currentLang];

  usePublicSeo({
    lang: currentLang,
    path: `/${currentLang}/bolao/copa`,
    title: copy.seoTitle,
    description: copy.seoDescription,
  });

  const [status, setStatus] = React.useState<WorldCupPoolStatusResponse | null>(null);
  const [statusError, setStatusError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!ENABLE_WORLDCUP_POOL) return;

      try {
        const data = await fetchWorldCupPoolStatus();
        if (!cancelled) {
          setStatus(data);
          setStatusError(false);
        }
      } catch (err) {
        console.error("failed to load world cup pool status", err);
        if (!cancelled) {
          setStatusError(true);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const remoteCopy = status?.copy?.[currentLang];

  const title = remoteCopy?.title || copy.fallbackTitle;
  const subtitle = remoteCopy?.subtitle || copy.fallbackSubtitle;
  const scoringSummary = remoteCopy?.scoring_summary;

  const isUnavailable =
    !ENABLE_WORLDCUP_POOL || statusError || (status !== null && !status.enabled);

  if (isUnavailable) {
    return (
      <div className="worldcup-pool-page">
        <section className="worldcup-pool-hero">
          <div className="worldcup-pool-hero-card worldcup-pool-placeholder-card">
            <div className="worldcup-pool-hero-card-main">
              <div className="public-eyebrow">{copy.eyebrow}</div>
              <h1 className="public-title">{copy.unavailableTitle}</h1>
              <p className="public-body">{copy.unavailableBody}</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="worldcup-pool-page">
      <section className="worldcup-pool-hero">
        <div className="worldcup-pool-hero-card">
          <div className="worldcup-pool-hero-copy">
            <div className="public-eyebrow">{copy.eyebrow}</div>
            <h1 className="public-title">{title}</h1>
            <p className="public-body">{subtitle}</p>

            <div className="worldcup-pool-actions">
              <a className="public-btn public-btn-primary" href="#worldcup-pool-create">
                {copy.primaryCta}
              </a>
              <a className="public-btn public-btn-secondary" href="#worldcup-pool-how-it-works">
                {copy.secondaryCta}
              </a>
            </div>

            <p className="worldcup-pool-hero-note">{copy.heroNote}</p>

            <div className="worldcup-pool-chip-row">
              {copy.chips.map((chip) => (
                <span key={chip} className="worldcup-pool-chip">
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div id="worldcup-pool-create" className="worldcup-pool-hero-form-card">
            <WorldCupPoolCreateForm
              lang={currentLang}
              canCreate={Boolean(status?.public_create_enabled)}
            />
          </div>
        </div>
      </section>

      <section className="worldcup-pool-section worldcup-pool-audience">
        <div>
          <h2 className="landing-section-title">{copy.audienceTitle}</h2>
        </div>

        <div className="worldcup-pool-audience-list">
          {copy.audienceItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section id="worldcup-pool-how-it-works" className="worldcup-pool-section">
        <div className="landing-section-head compact">
          <h2 className="landing-section-title">{copy.previewTitle}</h2>
        </div>

        <div className="worldcup-pool-grid">
          {copy.previewItems.map((item) => (
            <article key={item.title} className="worldcup-pool-card">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="worldcup-pool-section worldcup-pool-scoring">
        <div>
          <h2 className="landing-section-title">{copy.scoringTitle}</h2>
          <p className="landing-section-body">{scoringSummary || copy.scoringBody}</p>
        </div>

        <div className="worldcup-pool-score-list">
          {copy.scoringExamples.map((item) => (
            <div key={item} className="worldcup-pool-score-item">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="worldcup-pool-trust-card">
        <div className="worldcup-pool-trust-icon" aria-hidden="true">
          ✓
        </div>
        <div>
          <h2>{copy.trustTitle}</h2>
          <p>{copy.trustBody}</p>
        </div>
      </section>

      <section className="worldcup-pool-section">
        <div className="landing-section-head compact">
          <h2 className="landing-section-title">{copy.viralTitle}</h2>
        </div>

        <div className="worldcup-pool-grid worldcup-pool-grid-three">
          {copy.viralCards.map((card) => (
            <article key={card.title} className="worldcup-pool-card worldcup-pool-card-highlight">
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="worldcup-pool-section worldcup-pool-faq">
        <div className="landing-section-head compact">
          <h2 className="landing-section-title">{copy.faqTitle}</h2>
        </div>

        <div className="worldcup-pool-faq-list">
          {copy.faqs.map((faq) => (
            <article key={faq.question} className="worldcup-pool-faq-item">
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="worldcup-pool-product-cta">
        <h2>{copy.productCtaTitle}</h2>
        <p>{copy.productCtaBody}</p>
      </section>
    </div>
  );
}