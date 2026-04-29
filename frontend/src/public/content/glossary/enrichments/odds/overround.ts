import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const overroundEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Overround: o que é a margem da casa nas odds",
    seoDescription: "Entenda o que é overround, como ele mostra a margem embutida da casa e por que isso afeta o preço real das apostas.",
    intro: "Overround é a margem embutida em um mercado de apostas. Ele aparece quando a soma das probabilidades implícitas de todos os resultados possíveis ultrapassa 100%.",
    sections: [
      {
        title: "Como o overround aparece nas odds",
        body: [
          "Em um mercado justo, a soma das probabilidades de todos os resultados deveria ficar próxima de 100%. Mas as casas adicionam margem para proteger o negócio. Por isso, ao converter todas as odds em probabilidade implícita, o total costuma passar de 100%.",
          "Se um mercado soma 106%, por exemplo, existe cerca de 6% de margem bruta embutida. Quanto maior essa margem, pior tende a ser o preço oferecido ao usuário.",
        ],
      },
      {
        title: "Por que isso importa para comparar odds",
        body: [
          "Dois mercados podem parecer parecidos, mas ter margens muito diferentes. Um apostador que compara apenas a odd final pode não perceber que está operando em um mercado com preço mais pesado e menos eficiente.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é comparar odds sem considerar margem. Às vezes a diferença entre casas não está só na opinião sobre o jogo, mas na margem que cada uma aplica sobre o mercado.",
        ],
      },
    ],
    productNote: "No prevIA, a leitura de odds considera a relação entre preço de mercado, probabilidade implícita e referência de valor, ajudando a evitar decisões baseadas apenas na cotação aparente.",
    faq: [
      {
        question: "Overround é a mesma coisa que lucro da casa?",
        answer: "Não exatamente. Ele representa a margem embutida no mercado, mas o lucro real depende de volume, exposição, gestão de risco e comportamento dos apostadores.",
      },
      {
        question: "Quanto menor o overround, melhor?",
        answer: "Em geral, sim. Margens menores tendem a oferecer preços mais competitivos para o apostador.",
      },
    ],
  },

  en: {
    seoTitle: "Overround: what bookmaker margin means in odds",
    seoDescription:
      "Understand overround, how it reveals bookmaker margin, and why it affects the real price of betting markets.",
    intro:
      "Overround is the margin embedded in a betting market. It appears when the sum of implied probabilities across all outcomes exceeds 100%.",
    sections: [
      {
        title: "How overround appears",
        body: [
          "In a fair market, the probabilities of all possible outcomes would add up to roughly 100%. Bookmakers add margin, so the total often goes above 100%.",
          "For example, a market totaling 106% has roughly 6% gross margin embedded.",
        ],
      },
      {
        title: "Why it matters",
        body: [
          "Markets with higher overround usually offer worse prices. Comparing margins helps identify more efficient markets.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is comparing odds without considering margin. Different bookmakers can apply different margins to similar markets.",
        ],
      },
    ],
    productNote:
      "In prevIA, margin awareness supports clearer comparison between market price and estimated probability.",
    faq: [
      {
        question: "Is overround the bookmaker’s exact profit?",
        answer:
          "No. It is embedded margin, but real profit depends on volume, exposure, and risk management.",
      },
      {
        question: "Is lower overround better?",
        answer:
          "Generally yes, because prices tend to be more competitive.",
      },
    ],
  },

  es: {
    seoTitle: "Overround: qué es el margen de la casa en las cuotas",
    seoDescription:
      "Entiende overround, cómo muestra el margen incorporado de la casa y por qué afecta el precio real.",
    intro:
      "Overround es el margen incorporado en un mercado de apuestas. Aparece cuando la suma de probabilidades implícitas supera 100%.",
    sections: [
      {
        title: "Cómo aparece",
        body: [
          "En un mercado justo, las probabilidades de todos los resultados sumarían cerca de 100%. Las casas agregan margen, por eso el total suele pasar de 100%.",
          "Por ejemplo, un mercado que suma 106% tiene cerca de 6% de margen bruto incorporado.",
        ],
      },
      {
        title: "Por qué importa",
        body: [
          "Mercados con overround mayor suelen ofrecer peores precios. Comparar márgenes ayuda a identificar mercados más eficientes.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es comparar cuotas sin considerar margen. Diferentes casas pueden aplicar márgenes distintos.",
        ],
      },
    ],
    productNote:
      "En prevIA, entender margen ayuda a comparar precio de mercado y probabilidad estimada.",
    faq: [
      {
        question: "¿Overround es el lucro exacto de la casa?",
        answer:
          "No. Es margen incorporado, pero el lucro real depende de volumen, exposición y gestión de riesgo.",
      },
      {
        question: "¿Menor overround es mejor?",
        answer:
          "Generalmente sí, porque los precios tienden a ser más competitivos.",
      },
    ],
  },
};
