import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const bttsEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Ambas marcam: o que é BTTS e como analisar esse mercado",
    seoDescription: "Entenda o mercado ambas marcam, também chamado de BTTS, e como avaliar se os dois times têm boa chance de marcar no jogo.",
    intro: "Both teams to score, ou ambas marcam, é um mercado que avalia se os dois times farão pelo menos um gol. Ele ignora quem vence e foca apenas na capacidade dos dois lados marcarem.",
    sections: [
      {
        title: "Como funciona o BTTS",
        body: [
          "BTTS Sim vence quando os dois times marcam ao menos uma vez. Um placar 1x1, 2x1 ou 3x2 vence. Já 1x0, 2x0 ou 0x0 não vence no BTTS Sim.",
          "O mercado é binário: sim ou não. Por isso, a análise precisa considerar ataque, defesa, estilo de jogo, mando, ritmo e contexto do confronto.",
        ],
      },
      {
        title: "O que observar na análise",
        body: [
          "Alguns fatores importantes são frequência de gols marcados e sofridos, qualidade ofensiva, fragilidade defensiva, necessidade de resultado e tendência de jogo aberto ou fechado.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é olhar apenas para médias gerais de gols. BTTS depende de distribuição: não basta o jogo ter muitos gols esperados se eles estiverem muito concentrados em apenas um lado.",
        ],
      },
    ],
    productNote: "No prevIA, mercados como ambas marcam podem ser analisados a partir de probabilidade estimada, leitura de gols e comparação com preço de mercado.",
    faq: [
      {
        question: "BTTS depende de quem vence?",
        answer: "Não. O que importa é se ambos os times marcam ao menos um gol.",
      },
      {
        question: "0x0 vence BTTS Não?",
        answer: "Sim. Se nenhum dos dois times marca, o mercado ambas marcam não acontece.",
      },
    ],
  },

  en: {
    seoTitle: "BTTS: what both teams to score means and how to analyze it",
    seoDescription:
      "Learn the both teams to score market, also called BTTS, and how to evaluate whether both sides are likely to score.",
    intro:
      "Both teams to score, or BTTS, asks whether each team will score at least one goal. It ignores the winner and focuses on goal distribution between both sides.",
    sections: [
      {
        title: "How BTTS works",
        body: [
          "BTTS Yes wins when both teams score at least once. Scores such as 1-1, 2-1, or 3-2 win. Scores such as 1-0, 2-0, or 0-0 do not.",
          "BTTS No wins when at least one team fails to score.",
        ],
      },
      {
        title: "What to analyze",
        body: [
          "Useful factors include attacking quality, defensive weaknesses, match tempo, incentives, lineups, and how goal expectation is distributed.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is looking only at total goals. BTTS needs goals from both sides, not just a high total.",
        ],
      },
    ],
    productNote:
      "In prevIA, BTTS can be read through goal probabilities, market odds, and estimated fair price.",
    faq: [
      {
        question: "Does BTTS depend on who wins?",
        answer:
          "No. It only depends on whether both teams score.",
      },
      {
        question: "Does 0-0 win BTTS No?",
        answer:
          "Yes. If both teams do not score, BTTS Yes does not happen.",
      },
    ],
  },

  es: {
    seoTitle: "Ambas marcan: qué es BTTS y cómo analizarlo",
    seoDescription:
      "Entiende el mercado ambas marcan, también llamado BTTS, y cómo evaluar si ambos equipos pueden anotar.",
    intro:
      "Both teams to score, o ambas marcan, pregunta si cada equipo marcará al menos un gol. Ignora el ganador y se enfoca en la distribución de goles.",
    sections: [
      {
        title: "Cómo funciona BTTS",
        body: [
          "BTTS Sí gana cuando ambos equipos anotan al menos una vez. Marcadores como 1-1, 2-1 o 3-2 ganan. 1-0, 2-0 o 0-0 no ganan.",
          "BTTS No gana cuando al menos un equipo no marca.",
        ],
      },
      {
        title: "Qué analizar",
        body: [
          "Factores útiles incluyen calidad ofensiva, debilidades defensivas, ritmo, incentivos, alineaciones y distribución de expectativa de gol.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es mirar solo el total de goles. BTTS necesita goles de ambos lados.",
        ],
      },
    ],
    productNote:
      "En prevIA, ambas marcan puede leerse con probabilidades de gol, cuotas de mercado y precio justo estimado.",
    faq: [
      {
        question: "¿BTTS depende de quién gana?",
        answer:
          "No. Solo importa si ambos equipos marcan.",
      },
      {
        question: "¿0-0 gana BTTS No?",
        answer:
          "Sí. Si no marcan ambos, BTTS Sí no ocurre.",
      },
    ],
  },
};
