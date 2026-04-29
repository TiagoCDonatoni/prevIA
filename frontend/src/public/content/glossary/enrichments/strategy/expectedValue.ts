import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const expectedValueEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Expected value: o que é EV em apostas esportivas",
    seoDescription: "Entenda o que é expected value, como probabilidade e odd se combinam no longo prazo e por que EV positivo não garante acerto imediato.",
    intro: "Expected value, ou EV, é o valor esperado de uma decisão ao longo do tempo. Em apostas, ele ajuda a avaliar se a relação entre probabilidade estimada e preço disponível tende a ser favorável.",
    sections: [
      {
        title: "Como pensar em EV",
        body: [
          "Uma aposta pode perder hoje e ainda ter sido uma boa decisão se o preço pago era maior do que a chance real exigia. Da mesma forma, uma aposta pode ganhar hoje e ter sido ruim se o preço era desfavorável.",
          "O EV desloca o foco do resultado isolado para a qualidade repetida da decisão.",
        ],
      },
      {
        title: "EV positivo e EV negativo",
        body: [
          "Quando a odd paga mais do que deveria segundo a probabilidade estimada, o EV tende a ser positivo. Quando paga menos, o EV tende a ser negativo. O desafio está em estimar bem a probabilidade.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é avaliar EV pelo resultado de uma única aposta. EV é conceito de longo prazo e precisa de amostra para ser interpretado com seriedade.",
        ],
      },
    ],
    productNote: "No prevIA, a lógica de valor esperado aparece na comparação entre probabilidade estimada, odd justa e preço de mercado.",
    faq: [
      {
        question: "EV positivo garante lucro?",
        answer: "Não em uma aposta isolada. Ele indica uma relação favorável no longo prazo, desde que a estimativa seja consistente.",
      },
      {
        question: "Uma aposta vencedora sempre teve EV positivo?",
        answer: "Não. Ela pode ter vencido por variância, mesmo com preço ruim.",
      },
    ],
  },

  en: {
    seoTitle: "Expected value: what EV means in sports betting",
    seoDescription:
      "Understand expected value, how odds and probability combine over time, and why positive EV does not guarantee an immediate win.",
    intro:
      "Expected value, or EV, is the long-term value of a decision. In betting, it evaluates whether price and probability create a favorable relationship.",
    sections: [
      {
        title: "How to think about EV",
        body: [
          "A bet can lose today and still be a good decision if the price was better than the true chance required.",
          "Likewise, a winning bet can still have been a poor decision if the price was bad.",
        ],
      },
      {
        title: "Positive and negative EV",
        body: [
          "When odds pay more than they should according to estimated probability, EV tends to be positive. When they pay less, EV tends to be negative.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is judging EV by one result. EV is a long-term concept.",
        ],
      },
    ],
    productNote:
      "In prevIA, expected value logic appears in the comparison between probability, fair odds, and market price.",
    faq: [
      {
        question: "Does positive EV guarantee profit?",
        answer:
          "Not in a single bet. It indicates a favorable relationship over time.",
      },
      {
        question: "Was every winning bet positive EV?",
        answer:
          "No. It may have won through variance despite poor price.",
      },
    ],
  },

  es: {
    seoTitle: "Expected value: qué es EV en apuestas deportivas",
    seoDescription:
      "Entiende valor esperado, cómo cuota y probabilidad se combinan a largo plazo, y por qué EV positivo no garantiza acierto inmediato.",
    intro:
      "Expected value, o EV, es el valor de una decisión a largo plazo. En apuestas evalúa si precio y probabilidad crean una relación favorable.",
    sections: [
      {
        title: "Cómo pensar en EV",
        body: [
          "Una apuesta puede perder hoy y aun así haber sido buena decisión si el precio era mejor que la chance real requerida.",
          "Igualmente, una apuesta ganadora puede haber sido mala si el precio era desfavorable.",
        ],
      },
      {
        title: "EV positivo y negativo",
        body: [
          "Cuando la cuota paga más de lo que debería según la probabilidad estimada, el EV tiende a ser positivo. Si paga menos, tiende a ser negativo.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es juzgar EV por un resultado. EV es de largo plazo.",
        ],
      },
    ],
    productNote:
      "En prevIA, la lógica de valor esperado aparece al comparar probabilidad, cuota justa y precio de mercado.",
    faq: [
      {
        question: "¿EV positivo garantiza lucro?",
        answer:
          "No en una apuesta aislada. Indica relación favorable a largo plazo.",
      },
      {
        question: "¿Toda apuesta ganadora tuvo EV positivo?",
        answer:
          "No. Puede haber ganado por varianza pese a mal precio.",
      },
    ],
  },
};
