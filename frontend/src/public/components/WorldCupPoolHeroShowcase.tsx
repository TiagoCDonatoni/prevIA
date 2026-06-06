import React from "react";

import type { Lang } from "../../i18n";
import { trackPublicEvent } from "../../lib/analytics";

type Props = {
  lang: Lang;
};

type SlideKey = "admin" | "predictions" | "ranking";

const ORDER: SlideKey[] = ["admin", "predictions", "ranking"];
const AUTO_ADVANCE_MS = 3000;

const COPY = {
  pt: {
    eyebrow: "Veja por dentro",
    title: "Do convite ao ranking, tudo em um fluxo simples",
    body: "Mostre rapidamente ao visitante como o bolão funciona antes mesmo de ele preencher o formulário.",
    badge: "Mobile-first",
    tabs: {
      admin: "Admin",
      predictions: "Palpites",
      ranking: "Ranking",
    },
    footerStrong: "Crie, compartilhe e acompanhe.",
    footerBody: "Tudo pensado para grupo de WhatsApp, uso no celular e resenha durante a Copa.",
    admin: {
      label: "Painel do organizador",
      status: "Ao vivo",
      stat1Label: "Participantes",
      stat1Value: "12",
      stat2Label: "Palpites",
      stat2Value: "9/12",
      stat3Label: "Jogos",
      stat3Value: "64",
      item1: "Link de convite pronto para compartilhar",
      item2: "Lista de participantes e andamento do bolão",
      item3: "Atalho para ranking e gestão do grupo",
    },
    predictions: {
      label: "Tela de palpites",
      status: "Aberto",
      helper: "Cada participante salva seus placares antes do início dos jogos.",
      match1: "Brasil x Japão",
      match2: "França x México",
      match3: "Argentina x EUA",
    },
    ranking: {
      label: "Ranking do grupo",
      status: "Atualizado",
      helper: "O ranking deixa a competição clara e mantém o grupo engajado durante a Copa.",
      row1: "Gabriel",
      row2: "Natalia",
      row3: "Rafa",
      row4: "Marina",
    },
  },
  en: {
    eyebrow: "Inside the product",
    title: "From invite link to leaderboard in one simple flow",
    body: "Show visitors what they get before they even start filling out the form.",
    badge: "Mobile-first",
    tabs: {
      admin: "Admin",
      predictions: "Predictions",
      ranking: "Leaderboard",
    },
    footerStrong: "Create, share, and follow.",
    footerBody: "Built for WhatsApp groups, mobile usage, and World Cup banter.",
    admin: {
      label: "Organizer dashboard",
      status: "Live",
      stat1Label: "Participants",
      stat1Value: "12",
      stat2Label: "Predictions",
      stat2Value: "9/12",
      stat3Label: "Matches",
      stat3Value: "64",
      item1: "Invite link ready to share",
      item2: "Participants list and pool progress",
      item3: "Quick access to leaderboard and group management",
    },
    predictions: {
      label: "Predictions screen",
      status: "Open",
      helper: "Each participant saves score predictions before kickoff.",
      match1: "Brazil vs Japan",
      match2: "France vs Mexico",
      match3: "Argentina vs USA",
    },
    ranking: {
      label: "Group leaderboard",
      status: "Updated",
      helper: "The leaderboard keeps the competition visible and the group engaged.",
      row1: "Gabriel",
      row2: "Natalia",
      row3: "Rafa",
      row4: "Marina",
    },
  },
  es: {
    eyebrow: "Por dentro del producto",
    title: "De la invitación al ranking en un flujo simple",
    body: "Muestra al visitante lo que recibirá antes de empezar a completar el formulario.",
    badge: "Mobile-first",
    tabs: {
      admin: "Admin",
      predictions: "Pronósticos",
      ranking: "Ranking",
    },
    footerStrong: "Crea, comparte y acompaña.",
    footerBody: "Pensado para grupos de WhatsApp, uso en móvil y conversación durante el Mundial.",
    admin: {
      label: "Panel del organizador",
      status: "En vivo",
      stat1Label: "Participantes",
      stat1Value: "12",
      stat2Label: "Pronósticos",
      stat2Value: "9/12",
      stat3Label: "Partidos",
      stat3Value: "64",
      item1: "Enlace de invitación listo para compartir",
      item2: "Lista de participantes y avance de la porra",
      item3: "Acceso rápido al ranking y gestión del grupo",
    },
    predictions: {
      label: "Pantalla de pronósticos",
      status: "Abierto",
      helper: "Cada participante guarda sus marcadores antes del inicio de los partidos.",
      match1: "Brasil vs Japón",
      match2: "Francia vs México",
      match3: "Argentina vs EE. UU.",
    },
    ranking: {
      label: "Ranking del grupo",
      status: "Actualizado",
      helper: "El ranking mantiene visible la competencia y al grupo enganchado.",
      row1: "Gabriel",
      row2: "Natalia",
      row3: "Rafa",
      row4: "Marina",
    },
  },
} as const;

function ShowcaseAdmin({
  copy,
}: {
  copy: (typeof COPY)["pt"]["admin"];
}) {
  return (
    <div className="worldcup-pool-showcase-window">
      <div className="worldcup-pool-showcase-window-head">
        <span>{copy.label}</span>
        <strong>{copy.status}</strong>
      </div>

      <div className="worldcup-pool-showcase-stat-grid">
        <div className="worldcup-pool-showcase-stat-card">
          <span>{copy.stat1Label}</span>
          <strong>{copy.stat1Value}</strong>
        </div>

        <div className="worldcup-pool-showcase-stat-card">
          <span>{copy.stat2Label}</span>
          <strong>{copy.stat2Value}</strong>
        </div>

        <div className="worldcup-pool-showcase-stat-card">
          <span>{copy.stat3Label}</span>
          <strong>{copy.stat3Value}</strong>
        </div>
      </div>

      <div className="worldcup-pool-showcase-bullet-list">
        <div>{copy.item1}</div>
        <div>{copy.item2}</div>
        <div>{copy.item3}</div>
      </div>
    </div>
  );
}

function ShowcasePredictions({
  copy,
}: {
  copy: (typeof COPY)["pt"]["predictions"];
}) {
  return (
    <div className="worldcup-pool-showcase-window">
      <div className="worldcup-pool-showcase-window-head">
        <span>{copy.label}</span>
        <strong>{copy.status}</strong>
      </div>

      <p className="worldcup-pool-showcase-helper">{copy.helper}</p>

      <div className="worldcup-pool-showcase-match-list">
        <div className="worldcup-pool-showcase-match-card">
          <div className="worldcup-pool-showcase-match-row">
            <span>{copy.match1}</span>
            <strong>2 x 1</strong>
          </div>
        </div>

        <div className="worldcup-pool-showcase-match-card">
          <div className="worldcup-pool-showcase-match-row">
            <span>{copy.match2}</span>
            <strong>1 x 1</strong>
          </div>
        </div>

        <div className="worldcup-pool-showcase-match-card">
          <div className="worldcup-pool-showcase-match-row">
            <span>{copy.match3}</span>
            <strong>3 x 2</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShowcaseRanking({
  copy,
}: {
  copy: (typeof COPY)["pt"]["ranking"];
}) {
  return (
    <div className="worldcup-pool-showcase-window">
      <div className="worldcup-pool-showcase-window-head">
        <span>{copy.label}</span>
        <strong>{copy.status}</strong>
      </div>

      <p className="worldcup-pool-showcase-helper">{copy.helper}</p>

      <div className="worldcup-pool-showcase-ranking-list">
        <div className="worldcup-pool-showcase-ranking-row">
          <span>1</span>
          <strong>{copy.row1}</strong>
          <em>38 pts</em>
        </div>

        <div className="worldcup-pool-showcase-ranking-row">
          <span>2</span>
          <strong>{copy.row2}</strong>
          <em>35 pts</em>
        </div>

        <div className="worldcup-pool-showcase-ranking-row">
          <span>3</span>
          <strong>{copy.row3}</strong>
          <em>31 pts</em>
        </div>

        <div className="worldcup-pool-showcase-ranking-row">
          <span>4</span>
          <strong>{copy.row4}</strong>
          <em>29 pts</em>
        </div>
      </div>
    </div>
  );
}

export function WorldCupPoolHeroShowcase({ lang }: Props) {
  const copy = COPY[lang] ?? COPY.pt;
  const [activeSlide, setActiveSlide] = React.useState<SlideKey>("admin");

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setActiveSlide((currentSlide) => {
        const currentIndex = ORDER.indexOf(currentSlide);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % ORDER.length : 0;

        return ORDER[nextIndex];
      });
    }, AUTO_ADVANCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeSlide]);

  function selectSlide(nextSlide: SlideKey, origin: "tab" | "dot" = "tab") {
    setActiveSlide(nextSlide);

    trackPublicEvent("worldcup_pool_hero_showcase_select", {
      lang,
      slide: nextSlide,
      origin,
    });
  }

  return (
    <div className="worldcup-pool-showcase-card">
      <div className="worldcup-pool-showcase-top">
        <div>
          <div className="worldcup-pool-showcase-eyebrow">{copy.eyebrow}</div>
          <h3>{copy.title}</h3>
          <p>{copy.body}</p>
        </div>
      </div>

      <div className="worldcup-pool-showcase-tabs" role="tablist" aria-label={copy.eyebrow}>
        {ORDER.map((slide) => (
          <button
            key={slide}
            type="button"
            role="tab"
            aria-selected={activeSlide === slide}
            className={`worldcup-pool-showcase-tab${
              activeSlide === slide ? " is-active" : ""
            }`}
            onClick={() => selectSlide(slide, "tab")}
          >
            {copy.tabs[slide]}
          </button>
        ))}
      </div>

      {activeSlide === "admin" ? <ShowcaseAdmin copy={copy.admin} /> : null}
      {activeSlide === "predictions" ? <ShowcasePredictions copy={copy.predictions} /> : null}
      {activeSlide === "ranking" ? <ShowcaseRanking copy={copy.ranking} /> : null}

      <div className="worldcup-pool-showcase-footer">
        <strong>{copy.footerStrong}</strong>
        <span>{copy.footerBody}</span>
      </div>

      <div className="worldcup-pool-showcase-dots" aria-hidden="true">
        {ORDER.map((slide) => (
          <button
            key={slide}
            type="button"
            className={`worldcup-pool-showcase-dot${
              activeSlide === slide ? " is-active" : ""
            }`}
            onClick={() => selectSlide(slide, "dot")}
          />
        ))}
      </div>
    </div>
  );
}