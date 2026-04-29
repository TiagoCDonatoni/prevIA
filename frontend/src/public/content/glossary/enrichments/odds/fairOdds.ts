import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const fairOddsEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Odd justa: o que é, como calcular e comparar com o mercado",
    seoDescription:
      "Entenda o que é odd justa, como ela se relaciona com probabilidade real e como comparar esse preço teórico com as odds oferecidas pelo mercado.",
    intro:
      "Odd justa é o preço teórico de uma aposta quando você remove margem, comissão e distorções comerciais. Ela representa quanto uma odd deveria pagar se refletisse exatamente a probabilidade estimada de um evento.",
    sections: [
      {
        title: "Como calcular odd justa",
        body: [
          "Em odds decimais, a odd justa é o inverso da probabilidade estimada. Se você estima que um evento tem 50% de chance, a odd justa é 2.00. Se estima 25%, a odd justa é 4.00. Se estima 60%, a odd justa é aproximadamente 1.67.",
          "O ponto central é que a odd justa nasce da probabilidade, não da cotação publicada pela casa. Por isso, ela funciona como uma referência independente para avaliar se o mercado está caro, barato ou próximo do equilíbrio.",
        ],
      },
      {
        title: "Como comparar odd justa com a odd de mercado",
        body: [
          "Se a sua odd justa é 1.67 e o mercado oferece 1.90, o mercado está pagando mais do que o preço teórico estimado. Isso pode indicar valor. Se a sua odd justa é 1.67 e o mercado oferece 1.50, o preço pode estar ruim, mesmo que o evento pareça provável.",
          "Essa comparação não transforma uma aposta em certeza. Ela apenas organiza a relação entre chance estimada e preço disponível.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "Um erro comum é achar que odd justa é uma previsão exata. Na prática, ela depende da qualidade da probabilidade estimada. Se a probabilidade estiver mal calculada, a odd justa também estará.",
        ],
      },
    ],
    productNote:
      "No prevIA, a odd justa é usada como ponte entre probabilidade estimada e preço de mercado, ajudando o usuário a entender se uma cotação parece acima, abaixo ou próxima do preço teórico.",
    faq: [
      {
        question: "Odd justa garante que existe valor?",
        answer:
          "Não. Ela ajuda a comparar preço e probabilidade, mas depende da qualidade da estimativa usada. Valor real exige boa leitura de probabilidade e preço disponível.",
      },
      {
        question: "Odd justa é igual à odd da casa?",
        answer:
          "Não necessariamente. A odd da casa inclui margem, ajustes comerciais e movimento de mercado. A odd justa é uma referência teórica sem margem.",
      },
    ],
  },

  en: {
    seoTitle:
      "Fair odds: what they are and how to compare them with market odds",
    seoDescription:
      "Understand fair odds, how they relate to true probability, and how to compare theoretical price with market odds.",
    intro:
      "Fair odds are the theoretical price of a bet after removing bookmaker margin, commission, and commercial distortions. They represent what odds should pay if they reflected the estimated probability exactly.",
    sections: [
      {
        title: "How to calculate fair odds",
        body: [
          "In decimal format, fair odds are the inverse of your estimated probability. If you estimate a 50% chance, fair odds are 2.00. If you estimate 25%, fair odds are 4.00. If you estimate 60%, fair odds are roughly 1.67.",
          "The key point is that fair odds come from probability, not from the price listed by the bookmaker. This makes them an independent reference for evaluating whether the market price looks expensive, cheap, or balanced.",
        ],
      },
      {
        title: "How to compare fair odds with market odds",
        body: [
          "If your fair odds are 1.67 and the market offers 1.90, the market is paying more than your theoretical price. That may indicate value. If your fair odds are 1.67 and the market offers 1.50, the price may be poor even if the event looks likely.",
          "This comparison does not make a bet certain. It only organizes the relationship between estimated chance and available price.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is treating fair odds as an exact prediction. In practice, fair odds depend on the quality of the probability estimate. If the probability is weak, the fair odds will also be weak.",
        ],
      },
    ],
    productNote:
      "In prevIA, fair odds connect estimated probability with market price, helping users understand whether a listed price looks above, below, or close to theoretical value.",
    faq: [
      {
        question: "Do fair odds guarantee value?",
        answer:
          "No. They help compare price and probability, but they depend on the quality of the estimate. Real value requires both a sound probability estimate and an available market price.",
      },
      {
        question: "Are fair odds the same as bookmaker odds?",
        answer:
          "Not necessarily. Bookmaker odds include margin, commercial adjustments, and market movement. Fair odds are a theoretical no-margin reference.",
      },
    ],
  },

  es: {
    seoTitle:
      "Cuota justa: qué es, cómo calcularla y compararla con el mercado",
    seoDescription:
      "Entiende qué es cuota justa, cómo se relaciona con probabilidad real y cómo comparar ese precio teórico con las cuotas del mercado.",
    intro:
      "La cuota justa es el precio teórico de una apuesta cuando se elimina margen, comisión y distorsiones comerciales. Representa cuánto debería pagar una cuota si reflejara exactamente la probabilidad estimada de un evento.",
    sections: [
      {
        title: "Cómo calcular la cuota justa",
        body: [
          "En formato decimal, la cuota justa es el inverso de la probabilidad estimada. Si estimas 50% de probabilidad, la cuota justa es 2.00. Si estimas 25%, es 4.00. Si estimas 60%, es aproximadamente 1.67.",
          "La idea central es que la cuota justa nace de la probabilidad, no de la cotización publicada por la casa. Por eso funciona como referencia independiente para evaluar si el mercado está caro, barato o equilibrado.",
        ],
      },
      {
        title: "Cómo comparar cuota justa con cuota de mercado",
        body: [
          "Si tu cuota justa es 1.67 y el mercado ofrece 1.90, el mercado paga más que tu precio teórico. Eso puede indicar valor. Si tu cuota justa es 1.67 y el mercado ofrece 1.50, el precio puede ser malo aunque el evento parezca probable.",
          "Esta comparación no convierte una apuesta en certeza. Solo organiza la relación entre probabilidad estimada y precio disponible.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es pensar que la cuota justa es una predicción exacta. En la práctica, depende de la calidad de la probabilidad estimada. Si la probabilidad está mal calculada, la cuota justa también lo estará.",
        ],
      },
    ],
    productNote:
      "En prevIA, la cuota justa conecta probabilidad estimada y precio de mercado, ayudando a entender si una cotización parece por encima, por debajo o cerca del precio teórico.",
    faq: [
      {
        question: "¿La cuota justa garantiza que hay valor?",
        answer:
          "No. Ayuda a comparar precio y probabilidad, pero depende de la calidad de la estimación usada. El valor real exige buena lectura de probabilidad y precio disponible.",
      },
      {
        question: "¿La cuota justa es igual a la cuota de la casa?",
        answer:
          "No necesariamente. La cuota de la casa incluye margen, ajustes comerciales y movimiento de mercado. La cuota justa es una referencia teórica sin margen.",
      },
    ],
  },
};
