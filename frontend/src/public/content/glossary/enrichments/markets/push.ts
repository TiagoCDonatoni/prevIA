import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const pushEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Push em apostas: quando a aposta e anulada e a stake volta",
    seoDescription:
      "Entenda o que e push, quando uma aposta e devolvida e por que esse conceito aparece em handicaps e totais asiaticos.",
    intro:
      "Push e a situacao em que a aposta nao vence nem perde. O resultado cai exatamente na linha do mercado, e a stake e devolvida ao usuario.",
    sections: [
      {
        title: "Quando ocorre um push",
        body: [
          "Um exemplo simples e o total 2.0 gols. Se o jogo termina com exatamente 2 gols, a aposta em Over 2.0 ou Under 2.0 pode ser devolvida, dependendo da regra do mercado.",
          "O mesmo pode acontecer em handicaps inteiros, como time -1.0. Se o time vence por exatamente um gol, a linha empata e a stake volta.",
        ],
      },
      {
        title: "Por que o push e importante",
        body: [
          "Linhas com possibilidade de push mudam o perfil de risco da aposta. Elas podem reduzir a chance de perda total, mas tambem costumam ter preco diferente de linhas sem devolucao.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum e nao entender a regra da linha antes de apostar. Em mercados asiaticos, saber quando existe push e essencial para avaliar risco.",
        ],
      },
    ],
    productNote:
      "No prevIA, mercados com push devem ser avaliados pela relacao entre protecao, preco e probabilidade estimada.",
    faq: [
      {
        question: "Push significa que ganhei metade?",
        answer:
          "Nao. Push normalmente significa devolucao da stake naquela parte da aposta. Meia vitoria e outro conceito.",
      },
      {
        question: "Toda linha asiatica tem push?",
        answer:
          "Nao. Linhas inteiras podem ter push; linhas como 2.5 nao geram devolucao porque o total de gols nao pode ser meio gol.",
      },
    ],
  },

  en: {
    seoTitle: "Push in betting: what a returned stake means",
    seoDescription:
      "Understand push, when a bet is void or returned, and why some lines can end without win or loss.",
    intro:
      "A push happens when a bet lands exactly on a line that returns the stake instead of winning or losing.",
    sections: [
      {
        title: "How push works",
        body: [
          "In a total of 2.0 goals, exactly two goals can push, returning the stake. In a handicap of -1.0, winning by exactly one goal can also push.",
          "Push rules depend on the market and line format.",
        ],
      },
      {
        title: "Why push matters",
        body: [
          "Push changes risk because some outcomes do not lose. That protection affects the price compared with half-point lines.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is treating all lines as win-or-lose. Whole-number Asian lines often include push scenarios.",
        ],
      },
    ],
    productNote:
      "In prevIA, understanding push is important when comparing Asian lines, totals, and fair prices.",
    faq: [
      {
        question: "Does push count as a loss?",
        answer:
          "No. The stake is normally returned.",
      },
      {
        question: "Can every market push?",
        answer:
          "No. It depends on the line and market rules.",
      },
    ],
  },

  es: {
    seoTitle: "Push en apuestas: qué significa stake devuelta",
    seoDescription:
      "Entiende push, cuándo una apuesta se anula o devuelve, y por qué algunas líneas pueden no ganar ni perder.",
    intro:
      "Push ocurre cuando una apuesta cae exactamente en una línea que devuelve la stake en vez de ganar o perder.",
    sections: [
      {
        title: "Cómo funciona push",
        body: [
          "En total 2.0 goles, exactamente dos goles pueden generar push y devolver la stake. En hándicap -1.0, ganar por un gol también puede ser push.",
          "Las reglas dependen del mercado y formato de línea.",
        ],
      },
      {
        title: "Por qué importa",
        body: [
          "Push cambia el riesgo porque algunos resultados no pierden. Esa protección afecta el precio frente a líneas con medio punto.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es tratar todas las líneas como ganar o perder. Líneas asiáticas enteras suelen incluir push.",
        ],
      },
    ],
    productNote:
      "En prevIA, entender push es importante para comparar líneas asiáticas, totales y precios justos.",
    faq: [
      {
        question: "¿Push cuenta como pérdida?",
        answer:
          "No. Normalmente la stake se devuelve.",
      },
      {
        question: "¿Todo mercado puede tener push?",
        answer:
          "No. Depende de la línea y las reglas.",
      },
    ],
  },
};
