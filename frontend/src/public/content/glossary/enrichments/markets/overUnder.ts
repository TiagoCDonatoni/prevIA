import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const overUnderEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Over/Under: o que é mercado de gols acima ou abaixo",
    seoDescription: "Entenda o que é Over/Under, como funcionam linhas como 2.5 gols e como analisar mercados de total no futebol.",
    intro: "Over/Under é um mercado baseado em totais. No futebol, o mais comum é total de gols: você aposta se o jogo terá mais ou menos gols do que uma linha definida.",
    sections: [
      {
        title: "Como funciona o Over/Under",
        body: [
          "Em Over 2.5 gols, a aposta vence se o jogo tiver 3 ou mais gols. Em Under 2.5, vence se tiver 0, 1 ou 2 gols. A linha 2.5 evita empate no mercado, porque o total de gols sempre será inteiro.",
          "Existem também linhas asiáticas como 2.0, 2.25 e 2.75, que podem gerar devolução ou resultado parcial dependendo do placar final.",
        ],
      },
      {
        title: "O que observar antes de apostar",
        body: [
          "A análise deve considerar ritmo de jogo, força ofensiva, fragilidade defensiva, necessidade de resultado, escalações, estilo dos técnicos e expectativa de gols.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é olhar apenas para a média de gols sem considerar adversários, contexto e distribuição. Uma média alta pode esconder jogos muito irregulares.",
        ],
      },
    ],
    productNote: "No prevIA, mercados de gols são tratados como parte central da leitura de probabilidade, preço justo e comparação com odds disponíveis.",
    faq: [
      {
        question: "Over 2.5 precisa de quantos gols?",
        answer: "Precisa de 3 ou mais gols no jogo.",
      },
      {
        question: "Under 2.5 vence com 2 gols?",
        answer: "Sim. Under 2.5 vence com 0, 1 ou 2 gols.",
      },
    ],
  },

  en: {
    seoTitle: "Over/Under: what totals markets mean in football betting",
    seoDescription:
      "Understand Over/Under lines such as 2.5 goals and how to analyze totals markets in football.",
    intro:
      "Over/Under is a totals market. In football, it usually asks whether the match will have more or fewer goals than a specific line.",
    sections: [
      {
        title: "How Over/Under works",
        body: [
          "Over 2.5 goals wins if the match has three or more goals. Under 2.5 wins if it has zero, one, or two goals.",
          "Asian totals such as 2.0, 2.25, or 2.75 can create refunds or partial outcomes.",
        ],
      },
      {
        title: "What to observe",
        body: [
          "Analysis should consider tempo, attacking strength, defensive fragility, motivation, lineups, coaching style, and goal expectation.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is using only raw goal averages without context or distribution.",
        ],
      },
    ],
    productNote:
      "In prevIA, goal markets are central to probability, fair price, and odds comparison.",
    faq: [
      {
        question: "How many goals does Over 2.5 need?",
        answer:
          "It needs three or more goals.",
      },
      {
        question: "Does Under 2.5 win with two goals?",
        answer:
          "Yes. Under 2.5 wins with zero, one, or two goals.",
      },
    ],
  },

  es: {
    seoTitle: "Over/Under: qué es mercado de goles arriba o abajo",
    seoDescription:
      "Entiende líneas como 2.5 goles y cómo analizar mercados de total en fútbol.",
    intro:
      "Over/Under es un mercado de totales. En fútbol normalmente pregunta si el partido tendrá más o menos goles que una línea definida.",
    sections: [
      {
        title: "Cómo funciona Over/Under",
        body: [
          "Over 2.5 goles gana si el partido tiene tres o más goles. Under 2.5 gana con cero, uno o dos goles.",
          "Totales asiáticos como 2.0, 2.25 o 2.75 pueden generar devolución o resultados parciales.",
        ],
      },
      {
        title: "Qué observar",
        body: [
          "El análisis debe considerar ritmo, fuerza ofensiva, fragilidad defensiva, motivación, alineaciones, estilo y expectativa de gol.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es usar solo promedios brutos de goles sin contexto ni distribución.",
        ],
      },
    ],
    productNote:
      "En prevIA, los mercados de goles son centrales para probabilidad, precio justo y comparación de cuotas.",
    faq: [
      {
        question: "¿Cuántos goles necesita Over 2.5?",
        answer:
          "Necesita tres o más goles.",
      },
      {
        question: "¿Under 2.5 gana con dos goles?",
        answer:
          "Sí. Gana con cero, uno o dos goles.",
      },
    ],
  },
};
