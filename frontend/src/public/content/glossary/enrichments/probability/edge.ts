import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const edgeEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Edge em apostas: o que é vantagem matemática sobre o mercado",
    seoDescription: "Entenda o que é edge, como ele aparece na comparação entre probabilidade estimada e odd de mercado, e por que não significa aposta garantida.",
    intro: "Edge é a vantagem matemática que aparece quando sua estimativa de probabilidade é melhor do que o preço oferecido pelo mercado. Ele mede a diferença entre o que você acredita ser a chance real e o que a odd exige.",
    sections: [
      {
        title: "Como o edge aparece",
        body: [
          "Se uma odd exige 50% de chance para ser justa, mas sua estimativa aponta 56%, existe uma diferença favorável. Essa diferença pode ser interpretada como edge, desde que a estimativa seja bem construída.",
          "O edge não está no palpite. Ele está na relação entre probabilidade estimada, odd disponível e preço justo.",
        ],
      },
      {
        title: "Edge e longo prazo",
        body: [
          "Mesmo apostas com edge podem perder no curto prazo. O conceito só faz sentido dentro de uma amostra maior, com gestão de banca e processo consistente de decisão.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é confundir confiança subjetiva com edge. Gostar muito de um time não significa ter vantagem matemática sobre o preço.",
        ],
      },
    ],
    productNote: "No prevIA, o edge aparece como leitura de diferença entre probabilidade estimada, odd justa e preço de mercado, ajudando o usuário a decidir com mais clareza.",
    faq: [
      {
        question: "Edge significa que a aposta vai ganhar?",
        answer: "Não. Significa que a relação entre chance estimada e preço parece favorável, mas o resultado individual continua incerto.",
      },
      {
        question: "Como encontrar edge?",
        answer: "Comparando uma estimativa de probabilidade confiável com a probabilidade implícita da odd disponível.",
      },
    ],
  },

  en: {
    seoTitle: "Edge in betting: what mathematical advantage over the market means",
    seoDescription:
      "Understand edge, how it appears when estimated probability differs from market odds, and why it does not mean certainty.",
    intro:
      "Edge is the mathematical advantage that appears when your estimated probability is better than the market price.",
    sections: [
      {
        title: "How edge appears",
        body: [
          "If odds require 50% to be fair but your estimate is 56%, the gap may be an edge.",
          "The edge is not the pick itself; it is the relationship between probability, odds, and price.",
        ],
      },
      {
        title: "Edge and long term",
        body: [
          "Even bets with edge can lose. The concept only makes sense over a larger sample with disciplined risk management.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is confusing subjective confidence with mathematical edge.",
        ],
      },
    ],
    productNote:
      "In prevIA, edge is read through estimated probability, fair odds, and market price.",
    faq: [
      {
        question: "Does edge mean the bet will win?",
        answer:
          "No. It means the price-probability relationship appears favorable.",
      },
      {
        question: "How do you find edge?",
        answer:
          "By comparing a reliable probability estimate with the odds’ implied probability.",
      },
    ],
  },

  es: {
    seoTitle: "Edge en apuestas: qué es ventaja matemática sobre el mercado",
    seoDescription:
      "Entiende edge, cómo aparece al comparar probabilidad estimada y cuota, y por qué no significa certeza.",
    intro:
      "Edge es la ventaja matemática que aparece cuando tu probabilidad estimada es mejor que el precio de mercado.",
    sections: [
      {
        title: "Cómo aparece",
        body: [
          "Si una cuota exige 50% para ser justa pero tu estimación es 56%, la diferencia puede ser edge.",
          "El edge no está en el pick, sino en la relación entre probabilidad, cuota y precio.",
        ],
      },
      {
        title: "Edge y largo plazo",
        body: [
          "Incluso apuestas con edge pueden perder. El concepto solo tiene sentido en muestra mayor y con gestión de riesgo.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es confundir confianza subjetiva con ventaja matemática.",
        ],
      },
    ],
    productNote:
      "En prevIA, el edge se lee con probabilidad estimada, cuota justa y precio de mercado.",
    faq: [
      {
        question: "¿Edge significa que la apuesta gana?",
        answer:
          "No. Significa que la relación precio-probabilidad parece favorable.",
      },
      {
        question: "¿Cómo encontrar edge?",
        answer:
          "Comparando una estimación confiable con la probabilidad implícita de la cuota.",
      },
    ],
  },
};
