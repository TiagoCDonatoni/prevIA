import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const closingLineValueEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Closing line value: o que é CLV e por que ele importa",
    seoDescription: "Entenda o que é closing line value, como comparar a odd que você pegou com a odd de fechamento e por que isso mede qualidade de preço.",
    intro: "Closing line value, ou CLV, compara a odd que você pegou com a odd de fechamento do mercado. É uma métrica usada para avaliar se você conseguiu capturar um preço melhor do que o mercado final.",
    sections: [
      {
        title: "Como funciona o CLV",
        body: [
          "Se você apostou em uma odd 2.10 e o mercado fechou em 1.95, você capturou um preço melhor do que o fechamento. Isso é chamado de CLV positivo. Se você pegou 1.85 e o mercado fechou em 1.95, o CLV tende a ser negativo.",
          "O CLV não garante lucro em uma aposta isolada, mas pode indicar se sua leitura de preço está consistentemente à frente do mercado.",
        ],
      },
      {
        title: "Por que CLV é relevante no longo prazo",
        body: [
          "Bater a linha de fechamento de forma recorrente costuma ser visto como sinal de boa qualidade de decisão. Isso acontece porque o preço de fechamento tende a incorporar mais informações do que o preço inicial.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é julgar uma aposta apenas pelo resultado final. Uma aposta pode perder e ainda ter sido bem precificada se capturou valor antes do fechamento.",
        ],
      },
    ],
    productNote: "No prevIA, CLV é um conceito importante para evoluir a análise futura de qualidade de preço, especialmente quando comparado com probabilidade estimada e histórico de mercado.",
    faq: [
      {
        question: "CLV positivo garante lucro?",
        answer: "Não. Ele não garante lucro em cada aposta, mas pode ser um bom indicador de qualidade de preço ao longo de uma amostra maior.",
      },
      {
        question: "Por que comparar com a odd de fechamento?",
        answer: "Porque o fechamento geralmente reflete mais informação acumulada pelo mercado antes do evento começar.",
      },
    ],
  },

  en: {
    seoTitle: "Closing line value: what CLV means and why it matters",
    seoDescription:
      "Understand closing line value, how to compare your taken odds with closing odds, and why it can indicate price quality.",
    intro:
      "Closing line value, or CLV, compares the price you took with the market’s closing price. It is often used to judge whether you captured a better number.",
    sections: [
      {
        title: "How CLV works",
        body: [
          "If you bet at 2.10 and the market closes at 1.95, you captured a better price than the close. That is positive CLV.",
          "If you took 1.85 and the market closed at 1.95, the CLV is likely negative.",
        ],
      },
      {
        title: "Why it matters",
        body: [
          "Consistently beating the closing line is often viewed as a signal of good price quality because closing prices tend to include more information.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is judging a bet only by the final result. A losing bet can still have been well priced.",
        ],
      },
    ],
    productNote:
      "In prevIA, CLV is an important future concept for price-quality analysis.",
    faq: [
      {
        question: "Does positive CLV guarantee profit?",
        answer:
          "No. It is a price-quality indicator, not certainty.",
      },
      {
        question: "Why compare to closing odds?",
        answer:
          "Closing odds often reflect more accumulated market information.",
      },
    ],
  },

  es: {
    seoTitle: "Closing line value: qué es CLV y por qué importa",
    seoDescription:
      "Entiende CLV, cómo comparar la cuota tomada con la cuota de cierre y por qué indica calidad de precio.",
    intro:
      "Closing line value, o CLV, compara el precio que tomaste con el precio de cierre del mercado. Se usa para juzgar si capturaste un mejor número.",
    sections: [
      {
        title: "Cómo funciona",
        body: [
          "Si apostaste a 2.10 y el mercado cerró en 1.95, capturaste mejor precio que el cierre. Es CLV positivo.",
          "Si tomaste 1.85 y cerró en 1.95, el CLV probablemente es negativo.",
        ],
      },
      {
        title: "Por qué importa",
        body: [
          "Batir la línea de cierre consistentemente suele verse como señal de buena calidad de precio, porque el cierre incorpora más información.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es juzgar una apuesta solo por el resultado final. Una apuesta perdida pudo estar bien precificada.",
        ],
      },
    ],
    productNote:
      "En prevIA, CLV es un concepto futuro importante para analizar calidad de precio.",
    faq: [
      {
        question: "¿CLV positivo garantiza lucro?",
        answer:
          "No. Es indicador de calidad de precio, no certeza.",
      },
      {
        question: "¿Por qué comparar con cierre?",
        answer:
          "Porque el cierre suele reflejar más información acumulada del mercado.",
      },
    ],
  },
};
