import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const drawNoBetEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Draw no bet: o que é aposta sem empate",
    seoDescription: "Entenda o que é draw no bet, como funciona a devolução em caso de empate e quando esse mercado pode fazer sentido na análise de futebol.",
    intro: "Draw no bet, ou aposta sem empate, é um mercado em que você escolhe um time para vencer, mas recebe a stake de volta se o jogo terminar empatado.",
    sections: [
      {
        title: "Como funciona o draw no bet",
        body: [
          "Se você aposta no mandante em draw no bet e ele vence, a aposta ganha. Se empata, a stake é devolvida. Se perde, a aposta é perdida.",
          "Esse mercado remove o empate da equação, mas por isso normalmente paga menos do que o 1x2 tradicional.",
        ],
      },
      {
        title: "Quando esse mercado é útil",
        body: [
          "Draw no bet pode ser útil quando você vê vantagem em um time, mas considera o empate um risco relevante. Ele funciona como uma proteção parcial em comparação ao mercado seco de vitória.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é achar que draw no bet é sempre mais seguro e, portanto, sempre melhor. A proteção tem custo: a odd costuma ser menor.",
        ],
      },
    ],
    productNote: "No prevIA, a leitura de draw no bet deve considerar se a proteção contra empate compensa o preço menor em relação ao mercado principal.",
    faq: [
      {
        question: "Draw no bet devolve em qualquer empate?",
        answer: "Sim, nesse mercado o empate normalmente anula a aposta e devolve a stake.",
      },
      {
        question: "Draw no bet paga menos que vitória simples?",
        answer: "Geralmente sim, porque oferece proteção contra o empate.",
      },
    ],
  },

  en: {
    seoTitle: "Draw no bet: what it is and how the draw refund works",
    seoDescription:
      "Understand draw no bet, how stake is returned when the match ends in a draw, and when this market can make sense.",
    intro:
      "Draw no bet is a market where you choose a team to win, but your stake is returned if the match ends in a draw.",
    sections: [
      {
        title: "How draw no bet works",
        body: [
          "If you back the home team and it wins, the bet wins. If the match draws, the stake is returned. If the team loses, the bet loses.",
          "Because the draw is protected, the odds are usually lower than a simple win bet.",
        ],
      },
      {
        title: "When it may be useful",
        body: [
          "It can be useful when you see an advantage for one side but consider the draw a relevant risk.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is assuming draw no bet is always better because it is safer. Protection has a price.",
        ],
      },
    ],
    productNote:
      "In prevIA, draw no bet should be judged by whether draw protection is worth the lower price.",
    faq: [
      {
        question: "Does draw no bet refund every draw?",
        answer:
          "Yes, in this market the draw normally voids the bet and returns the stake.",
      },
      {
        question: "Does it pay less than a straight win?",
        answer:
          "Usually yes, because it adds protection against the draw.",
      },
    ],
  },

  es: {
    seoTitle: "Draw no bet: qué es apuesta sin empate",
    seoDescription:
      "Entiende draw no bet, cómo se devuelve la stake en caso de empate y cuándo puede tener sentido.",
    intro:
      "Draw no bet es un mercado en el que eliges un equipo para ganar, pero la stake se devuelve si el partido termina empatado.",
    sections: [
      {
        title: "Cómo funciona draw no bet",
        body: [
          "Si apuestas por el local y gana, la apuesta gana. Si empata, la stake se devuelve. Si pierde, la apuesta pierde.",
          "Como el empate está protegido, la cuota suele ser menor que en una victoria simple.",
        ],
      },
      {
        title: "Cuándo puede ser útil",
        body: [
          "Puede ser útil cuando ves ventaja en un lado, pero consideras que el empate es un riesgo relevante.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es pensar que draw no bet siempre es mejor por ser más seguro. La protección tiene precio.",
        ],
      },
    ],
    productNote:
      "En prevIA, draw no bet debe evaluarse según si la protección contra empate compensa la cuota menor.",
    faq: [
      {
        question: "¿Draw no bet devuelve en cualquier empate?",
        answer:
          "Sí, normalmente el empate anula la apuesta y devuelve la stake.",
      },
      {
        question: "¿Paga menos que victoria simple?",
        answer:
          "Generalmente sí, porque protege contra el empate.",
      },
    ],
  },
};
