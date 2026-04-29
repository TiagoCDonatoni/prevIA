import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const trueProbabilityEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Probabilidade real: diferença entre chance estimada e odd",
    seoDescription: "Entenda o que é probabilidade real, por que ela não é igual à probabilidade implícita e como ela ajuda a avaliar valor em odds.",
    intro: "Probabilidade real é a melhor estimativa da chance de um evento acontecer, independentemente da odd publicada pela casa. Ela tenta responder uma pergunta central: qual é a chance verdadeira desse resultado?",
    sections: [
      {
        title: "Probabilidade real versus probabilidade implícita",
        body: [
          "A probabilidade implícita vem da odd. A probabilidade real vem de uma estimativa própria, estatística ou analítica. Comparar as duas é o que permite avaliar se o preço de mercado parece justo, caro ou barato.",
          "Se a odd exige 45% de chance para ser justa, mas sua estimativa aponta 52%, pode existir uma diferença favorável. Essa diferença é a base da leitura de valor.",
        ],
      },
      {
        title: "Por que é difícil estimar probabilidade real",
        body: [
          "A probabilidade real depende de dados, contexto, qualidade do modelo, notícias, escalações, estilo de jogo e incerteza natural do esporte. Por isso, ela nunca deve ser tratada como certeza absoluta.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é confundir opinião com probabilidade. Achar que um time deve vencer não é o mesmo que estimar uma chance percentual consistente.",
        ],
      },
    ],
    productNote: "No prevIA, a probabilidade estimada funciona como referência para comparar odds, calcular odd justa e apoiar uma leitura mais objetiva de valor.",
    faq: [
      {
        question: "Probabilidade real pode ser conhecida com certeza?",
        answer: "Não. Ela é sempre uma estimativa. O objetivo é melhorar a qualidade dessa estimativa, não eliminar totalmente a incerteza.",
      },
      {
        question: "Probabilidade real é igual à odd da casa?",
        answer: "Não. A odd da casa traz preço de mercado e margem. A probabilidade real é uma leitura estimada da chance do evento.",
      },
    ],
  },

  en: {
    seoTitle: "True probability: estimated chance versus market odds",
    seoDescription:
      "Understand true probability, why it differs from implied probability, and how it helps evaluate value in odds.",
    intro:
      "True probability is the best estimate of how likely an event really is, independent of the bookmaker’s listed odds.",
    sections: [
      {
        title: "True probability versus implied probability",
        body: [
          "Implied probability comes from the odds. True probability comes from analysis, data, or a model. Comparing the two helps judge whether a price is fair.",
          "If the odds imply 45% but your estimate is 52%, there may be a favorable gap.",
        ],
      },
      {
        title: "Why it is hard",
        body: [
          "True probability depends on data quality, context, lineups, tactical factors, and sports uncertainty. It is always an estimate.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is treating opinion as probability. Saying a team should win is not the same as estimating a percentage.",
        ],
      },
    ],
    productNote:
      "In prevIA, estimated probability is used as a reference for fair odds and value reading.",
    faq: [
      {
        question: "Can true probability be known exactly?",
        answer:
          "No. It is always an estimate.",
      },
      {
        question: "Is it the same as bookmaker odds?",
        answer:
          "No. Odds include market price and margin.",
      },
    ],
  },

  es: {
    seoTitle: "Probabilidad real: diferencia entre chance estimada y cuota",
    seoDescription:
      "Entiende probabilidad real, por qué difiere de probabilidad implícita y cómo ayuda a evaluar valor.",
    intro:
      "Probabilidad real es la mejor estimación de la chance de que un evento ocurra, independiente de la cuota publicada.",
    sections: [
      {
        title: "Probabilidad real versus implícita",
        body: [
          "La probabilidad implícita viene de la cuota. La real viene de análisis, datos o modelo. Compararlas ayuda a juzgar si un precio es justo.",
          "Si la cuota implica 45% pero tu estimación es 52%, puede existir una brecha favorable.",
        ],
      },
      {
        title: "Por qué es difícil",
        body: [
          "Depende de calidad de datos, contexto, alineaciones, táctica e incertidumbre del deporte. Siempre es una estimación.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es tratar opinión como probabilidad. Decir que un equipo debería ganar no es estimar un porcentaje.",
        ],
      },
    ],
    productNote:
      "En prevIA, la probabilidad estimada sirve como referencia para cuota justa y lectura de valor.",
    faq: [
      {
        question: "¿Puede conocerse exactamente?",
        answer:
          "No. Siempre es una estimación.",
      },
      {
        question: "¿Es igual a la cuota de la casa?",
        answer:
          "No. La cuota incluye precio de mercado y margen.",
      },
    ],
  },
};
