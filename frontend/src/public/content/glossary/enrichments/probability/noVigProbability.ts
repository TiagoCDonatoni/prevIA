import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const noVigProbabilityEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Probabilidade sem vigorish: como remover a margem da casa",
    seoDescription: "Entenda o que é probabilidade sem vigorish, como ela ajusta a visão do mercado e por que ajuda a comparar odds com mais clareza.",
    intro: "Probabilidade sem vigorish é uma tentativa de remover a margem da casa das odds para reconstruir uma visão mais limpa do mercado. Ela ajuda a separar preço comercial de probabilidade de referência.",
    sections: [
      {
        title: "Por que remover a margem",
        body: [
          "As odds publicadas normalmente carregam margem. Quando você converte todas as odds de um mercado em probabilidade implícita, a soma costuma passar de 100%. A probabilidade sem vigorish ajusta esse excesso para voltar a uma base mais comparável.",
          "Isso não revela a verdade absoluta do evento, mas cria uma referência melhor do que usar a odd bruta diretamente.",
        ],
      },
      {
        title: "Quando esse conceito é útil",
        body: [
          "A probabilidade sem vigorish é útil para comparar mercados, entender a visão média das casas e avaliar se sua própria estimativa está muito distante ou próxima da leitura de mercado sem margem.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é tratar a probabilidade sem vigorish como probabilidade real. Ela remove margem, mas ainda parte do preço de mercado.",
        ],
      },
    ],
    productNote: "No prevIA, esse conceito ajuda a explicar por que odd de mercado, probabilidade implícita e probabilidade estimada não são a mesma coisa.",
    faq: [
      {
        question: "Probabilidade sem vigorish é igual à chance real?",
        answer: "Não. Ela é uma referência de mercado ajustada pela margem, mas não substitui uma estimativa própria ou de modelo.",
      },
      {
        question: "Por que a soma das probabilidades passa de 100%?",
        answer: "Porque as casas embutem margem nas odds. Essa diferença acima de 100% é parte do overround.",
      },
    ],
  },

  en: {
    seoTitle: "No-vig probability: how to remove bookmaker margin",
    seoDescription:
      "Learn no-vig probability, how it adjusts market view by removing margin, and why it helps compare prices more clearly.",
    intro:
      "No-vig probability attempts to remove bookmaker margin from odds to reconstruct a cleaner view of the market.",
    sections: [
      {
        title: "Why remove margin",
        body: [
          "Listed odds usually include margin. When all implied probabilities are summed, the total often exceeds 100%. No-vig adjustment scales that excess back toward a comparable base.",
          "It does not reveal absolute truth, but it is cleaner than raw odds.",
        ],
      },
      {
        title: "When it is useful",
        body: [
          "It helps compare markets, estimate a margin-adjusted market view, and compare your own model against the market.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is treating no-vig probability as true probability. It still starts from market prices.",
        ],
      },
    ],
    productNote:
      "In prevIA, no-vig concepts help explain the difference between odds, implied probability, and estimated probability.",
    faq: [
      {
        question: "Is no-vig probability true probability?",
        answer:
          "No. It is a margin-adjusted market reference.",
      },
      {
        question: "Why do probabilities exceed 100%?",
        answer:
          "Because bookmakers embed margin in their odds.",
      },
    ],
  },

  es: {
    seoTitle: "Probabilidad sin vigorish: cómo remover el margen de la casa",
    seoDescription:
      "Entiende probabilidad sin vigorish, cómo ajusta la visión del mercado y por qué ayuda a comparar precios.",
    intro:
      "La probabilidad sin vigorish intenta remover el margen de la casa para reconstruir una visión más limpia del mercado.",
    sections: [
      {
        title: "Por qué remover margen",
        body: [
          "Las cuotas publicadas suelen incluir margen. Al sumar probabilidades implícitas, el total pasa de 100%. El ajuste sin vigorish escala ese exceso a una base comparable.",
          "No revela verdad absoluta, pero es más limpio que la cuota bruta.",
        ],
      },
      {
        title: "Cuándo es útil",
        body: [
          "Ayuda a comparar mercados, estimar una visión de mercado ajustada y comparar tu modelo con el mercado.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es tratarla como probabilidad real. Sigue partiendo de precios de mercado.",
        ],
      },
    ],
    productNote:
      "En prevIA, este concepto ayuda a explicar diferencias entre cuota, probabilidad implícita y estimada.",
    faq: [
      {
        question: "¿Es probabilidad real?",
        answer:
          "No. Es una referencia de mercado ajustada por margen.",
      },
      {
        question: "¿Por qué la suma supera 100%?",
        answer:
          "Porque las casas incorporan margen en las cuotas.",
      },
    ],
  },
};
