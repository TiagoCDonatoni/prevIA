import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const correctScoreEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Placar exato: o que é correct score e por que é difícil acertar",
    seoDescription:
      "Entenda o mercado de placar exato, por que as odds são altas e como pensar em probabilidade antes de apostar em correct score.",
    intro:
      "Placar exato é o mercado em que você aposta no resultado final específico do jogo, como 1x0, 2x1 ou 0x0. As odds costumam ser altas porque a probabilidade de acertar um placar único é baixa.",
    sections: [
      {
        title: "Como funciona o placar exato",
        body: [
          "Para vencer, o placar final precisa ser exatamente aquele escolhido. Se você aposta em 2x1 e o jogo termina 2x0, 1x1 ou 3x1, a aposta perde. Pequenas variações no jogo mudam totalmente o resultado do mercado.",
          "Por isso, placar exato é muito sensível à distribuição de gols, ritmo da partida, eficiência ofensiva e comportamento após o primeiro gol.",
        ],
      },
      {
        title: "Por que as odds são altas",
        body: [
          "Mesmo placares comuns como 1x0, 1x1 ou 2x1 representam apenas uma parte pequena de todos os cenários possíveis. A odd alta reflete essa baixa probabilidade específica, não necessariamente uma boa oportunidade.",
          "A análise precisa considerar se a odd paga mais do que a probabilidade real daquele placar específico, algo difícil de estimar sem modelo de placares.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é escolher placar exato por intuição narrativa, como 'vai ser 2x1', sem transformar essa leitura em probabilidade. Uma história plausível não é suficiente para justificar o preço.",
        ],
      },
    ],
    productNote:
      "No roadmap do prevIA, mercados como placar exato se conectam à matriz de placares e ao Score Engine, que permitem derivar probabilidades por resultado específico.",
    faq: [
      {
        question: "Placar exato é mais arriscado que 1x2?",
        answer:
          "Sim. Ele exige acertar um resultado específico, enquanto o 1x2 cobre grupos maiores de placares.",
      },
      {
        question: "Odd alta em placar exato significa valor?",
        answer:
          "Não necessariamente. A odd é alta porque o evento é específico e pouco provável. Valor depende da comparação com a probabilidade estimada.",
      },
    ],
  },

  en: {
    seoTitle: "Correct score: what exact score betting means",
    seoDescription:
      "Learn what correct score markets are, why odds are high, and why exact score requires careful probability thinking.",
    intro:
      "Correct score asks for the exact final score of a match. Because the outcome is very specific, odds are usually much higher than in broader markets.",
    sections: [
      {
        title: "How correct score works",
        body: [
          "A bet on 2-1 wins only if the match finishes exactly 2-1. A similar result such as 2-0 or 1-1 loses.",
          "This precision makes the market attractive in payout but difficult in probability.",
        ],
      },
      {
        title: "Why probability matters",
        body: [
          "Exact score probabilities are usually small. A high odd can still be poor value if the true probability is even lower.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is choosing a score that feels plausible without comparing it to its implied probability.",
        ],
      },
    ],
    productNote:
      "In prevIA, exact score is a future natural extension of score matrix and probability distribution analysis.",
    faq: [
      {
        question: "Why are correct score odds high?",
        answer:
          "Because each exact score has a relatively low probability.",
      },
      {
        question: "Is correct score good for long-term betting?",
        answer:
          "It can be difficult because probabilities are small and margins can be high.",
      },
    ],
  },

  es: {
    seoTitle: "Marcador exacto: qué significa apostar al resultado exacto",
    seoDescription:
      "Entiende qué es marcador exacto, por qué las cuotas son altas y por qué exige pensar en probabilidades.",
    intro:
      "Marcador exacto pide acertar el resultado final exacto de un partido. Como el evento es muy específico, las cuotas suelen ser altas.",
    sections: [
      {
        title: "Cómo funciona",
        body: [
          "Una apuesta a 2-1 gana solo si el partido termina exactamente 2-1. Un resultado parecido como 2-0 o 1-1 pierde.",
          "Esa precisión hace el mercado atractivo por pago, pero difícil por probabilidad.",
        ],
      },
      {
        title: "Por qué importa la probabilidad",
        body: [
          "Las probabilidades de marcador exacto suelen ser pequeñas. Una cuota alta puede no tener valor si la probabilidad real es aún menor.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es elegir un marcador que parece posible sin compararlo con su probabilidad implícita.",
        ],
      },
    ],
    productNote:
      "En prevIA, marcador exacto es una extensión natural futura de matriz de marcadores y distribución de probabilidades.",
    faq: [
      {
        question: "¿Por qué las cuotas son altas?",
        answer:
          "Porque cada marcador exacto tiene probabilidad relativamente baja.",
      },
      {
        question: "¿Es buen mercado a largo plazo?",
        answer:
          "Puede ser difícil porque las probabilidades son pequeñas y los márgenes pueden ser altos.",
      },
    ],
  },
};
