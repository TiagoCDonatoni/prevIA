import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const asianTotalEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Total asiatico: como funcionam linhas de gols 2.25, 2.75 e similares",
    seoDescription:
      "Entenda o total asiatico, como linhas fracionadas dividem a stake e por que esse mercado pode gerar meia vitoria, meia derrota ou push.",
    intro:
      "Total asiatico e uma versao do mercado Over/Under com linhas que podem gerar devolucao total, meia vitoria ou meia derrota. Ele e comum em linhas como 2.0, 2.25, 2.75 e 3.0 gols.",
    sections: [
      {
        title: "Como funciona a divisao da linha",
        body: [
          "Uma linha 2.25 divide a stake entre 2.0 e 2.5. Uma linha 2.75 divide entre 2.5 e 3.0. Isso cria resultados parciais dependendo do numero final de gols.",
          "Essa estrutura permite ajustar risco e preco de forma mais granular do que uma linha simples como 2.5 gols.",
        ],
      },
      {
        title: "Por que usar total asiatico",
        body: [
          "O total asiatico pode oferecer protecao parcial em certos cenarios. Por exemplo, uma linha inteira pode devolver a stake se o total cair exatamente no numero da linha.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum e apostar em total asiatico sem saber como cada placar afeta a stake. Antes de avaliar valor, e preciso entender o payoff.",
        ],
      },
    ],
    productNote:
      "No prevIA, totais asiaticos podem ser analisados a partir da probabilidade de gols, odd justa e preco disponivel.",
    faq: [
      {
        question: "Total 2.25 e igual a 2.5?",
        answer:
          "Nao. O 2.25 divide a stake entre 2.0 e 2.5, enquanto o 2.5 e uma linha simples sem push.",
      },
      {
        question: "Total asiatico pode devolver parte da aposta?",
        answer:
          "Sim. Dependendo da linha e do placar, pode haver devolucao parcial ou total.",
      },
    ],
  },

  en: {
    seoTitle: "Asian total: how Asian goal lines work",
    seoDescription:
      "Understand Asian total lines such as 2.0, 2.25, and 2.75, including push and partial outcomes.",
    intro:
      "Asian total is a goals total market that uses whole, half, and quarter lines. It can create refunds or partial wins and losses.",
    sections: [
      {
        title: "How Asian totals work",
        body: [
          "A line of 2.0 can push if exactly two goals are scored. A line of 2.25 splits the stake between 2.0 and 2.5.",
          "This makes settlement more nuanced than simple Over/Under 2.5.",
        ],
      },
      {
        title: "Why use Asian totals",
        body: [
          "Asian totals allow more precise risk positioning and can protect or expose specific score ranges.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is treating 2.25 or 2.75 as if they were simple half-point lines.",
        ],
      },
    ],
    productNote:
      "In prevIA, Asian totals are important for advanced goal market pricing and fair odds comparison.",
    faq: [
      {
        question: "Can Asian totals push?",
        answer:
          "Yes. Whole-number lines can return the stake.",
      },
      {
        question: "What does 2.25 mean?",
        answer:
          "It usually splits the stake between Over/Under 2.0 and 2.5.",
      },
    ],
  },

  es: {
    seoTitle: "Total asiático: cómo funcionan líneas asiáticas de goles",
    seoDescription:
      "Entiende líneas como 2.0, 2.25 y 2.75, incluyendo push y resultados parciales.",
    intro:
      "Total asiático es un mercado de goles que usa líneas enteras, medias y de cuarto. Puede generar devoluciones o resultados parciales.",
    sections: [
      {
        title: "Cómo funciona",
        body: [
          "Una línea 2.0 puede hacer push si hay exactamente dos goles. Una línea 2.25 divide la stake entre 2.0 y 2.5.",
          "Esto hace la liquidación más matizada que un simple Over/Under 2.5.",
        ],
      },
      {
        title: "Por qué se usa",
        body: [
          "Los totales asiáticos permiten posicionar riesgo con más precisión y proteger o exponer ciertos rangos de marcador.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es tratar 2.25 o 2.75 como si fueran líneas simples de medio punto.",
        ],
      },
    ],
    productNote:
      "En prevIA, los totales asiáticos son importantes para precificación avanzada de goles y comparación con cuota justa.",
    faq: [
      {
        question: "¿Pueden hacer push?",
        answer:
          "Sí. Las líneas enteras pueden devolver la stake.",
      },
      {
        question: "¿Qué significa 2.25?",
        answer:
          "Normalmente divide la stake entre 2.0 y 2.5.",
      },
    ],
  },
};
