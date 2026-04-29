import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const impliedProbabilityEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle:
      "Probabilidade implícita: o que é e como calcular a partir da odd",
    seoDescription:
      "Entenda o que é probabilidade implícita, como converter odds em percentual e por que esse conceito é essencial para comparar preço e valor em apostas.",
    intro:
      "Probabilidade implícita é um dos primeiros conceitos que qualquer pessoa precisa entender para sair da leitura superficial de odds. Em vez de olhar apenas se uma odd parece alta ou baixa, ela mostra qual chance percentual está embutida naquele preço.",
    sections: [
      {
        title: "Como calcular probabilidade implícita",
        body: [
          "Em odds decimais, o cálculo básico é simples: probabilidade implícita = 1 dividido pela odd. Uma odd 2.00 representa 50% de probabilidade implícita. Uma odd 4.00 representa 25%. Uma odd 1.50 representa aproximadamente 66,7%.",
          "Esse cálculo não diz, sozinho, se a aposta é boa. Ele apenas traduz o preço para uma linguagem mais clara: percentual de chance. A partir daí, você consegue comparar a leitura do mercado com a sua própria estimativa ou com uma estimativa gerada por modelo.",
        ],
      },
      {
        title: "Por que isso importa para análise de odds",
        body: [
          "Sem converter odd em probabilidade, o apostador fica preso à sensação de preço. Uma odd 3.00 pode parecer atrativa, mas ela exige que o evento aconteça mais de 33,3% das vezes para fazer sentido no longo prazo. Se a chance real for menor que isso, o preço pode estar ruim mesmo parecendo alto.",
          "A probabilidade implícita também ajuda a entender margem da casa, comparar casas diferentes e identificar quando uma cotação está distante da probabilidade estimada.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro mais comum é tratar a probabilidade implícita como probabilidade real. A odd publicada carrega margem, liquidez, comportamento do mercado e ajustes da casa. Por isso, ela deve ser lida como uma referência de preço, não como verdade absoluta.",
        ],
      },
    ],
    productNote:
      "No prevIA, a probabilidade implícita ajuda a traduzir odds de mercado para uma leitura comparável com probabilidade estimada, odd justa e leitura de valor.",
    faq: [
      {
        question: "Probabilidade implícita é a mesma coisa que chance real?",
        answer:
          "Não. Ela mostra a chance embutida na odd, mas essa odd pode incluir margem da casa e distorções de mercado. A chance real depende de uma estimativa própria ou de modelo.",
      },
      {
        question: "Uma odd alta sempre significa boa oportunidade?",
        answer:
          "Não. Uma odd alta só é interessante se a chance real do evento for maior do que a probabilidade implícita exigida por aquele preço.",
      },
    ],
  },

  en: {
    seoTitle:
      "Implied probability: what it is and how to calculate it from odds",
    seoDescription:
      "Learn what implied probability means, how to convert odds into percentages, and why it matters when comparing price, probability, and value.",
    intro:
      "Implied probability is one of the first concepts to understand if you want to read odds beyond intuition. Instead of asking whether a price looks high or low, it shows the percentage chance embedded in that price.",
    sections: [
      {
        title: "How to calculate implied probability",
        body: [
          "With decimal odds, the basic calculation is simple: implied probability = 1 divided by the odds. Odds of 2.00 imply 50%. Odds of 4.00 imply 25%. Odds of 1.50 imply roughly 66.7%.",
          "This calculation does not tell you whether a bet is good by itself. It only translates the price into a clearer language: probability. From there, you can compare the market price with your own estimate or with a model-based estimate.",
        ],
      },
      {
        title: "Why it matters for odds analysis",
        body: [
          "Without converting odds into probability, bettors often rely on price perception alone. Odds of 3.00 may look attractive, but they require the event to happen more than 33.3% of the time to make long-term sense.",
          "Implied probability also helps with bookmaker margin, line comparison, and spotting prices that may be far from your estimated probability.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "The most common mistake is treating implied probability as true probability. Listed odds may include bookmaker margin, liquidity, market behavior, and pricing adjustments. They should be read as a price reference, not as absolute truth.",
        ],
      },
    ],
    productNote:
      "In prevIA, implied probability helps translate market odds into a format that can be compared with estimated probability, fair odds, and value reading.",
    faq: [
      {
        question: "Is implied probability the same as true probability?",
        answer:
          "No. It shows the probability embedded in the odds, but those odds may include bookmaker margin and market distortions. True probability depends on your own estimate or model.",
      },
      {
        question: "Does a high odd always mean a good opportunity?",
        answer:
          "No. A high odd is only interesting if the real chance of the event is higher than the implied probability required by that price.",
      },
    ],
  },

  es: {
    seoTitle:
      "Probabilidad implícita: qué es y cómo calcularla desde una cuota",
    seoDescription:
      "Entiende qué es la probabilidad implícita, cómo convertir cuotas en porcentajes y por qué importa al comparar precio, probabilidad y valor.",
    intro:
      "La probabilidad implícita es uno de los primeros conceptos para leer cuotas con más claridad. En vez de mirar solo si una cuota parece alta o baja, muestra qué probabilidad porcentual está incorporada en ese precio.",
    sections: [
      {
        title: "Cómo calcular la probabilidad implícita",
        body: [
          "En cuotas decimales, el cálculo básico es simple: probabilidad implícita = 1 dividido por la cuota. Una cuota 2.00 implica 50%. Una cuota 4.00 implica 25%. Una cuota 1.50 implica aproximadamente 66,7%.",
          "Este cálculo no dice por sí solo si una apuesta es buena. Solo traduce el precio a un lenguaje más claro: probabilidad. Desde ahí, puedes comparar la lectura del mercado con tu propia estimación o con una estimación de modelo.",
        ],
      },
      {
        title: "Por qué importa en el análisis de cuotas",
        body: [
          "Sin convertir cuotas en probabilidad, el apostador depende demasiado de la sensación de precio. Una cuota 3.00 puede parecer atractiva, pero exige que el evento ocurra más del 33,3% de las veces para tener sentido a largo plazo.",
          "La probabilidad implícita también ayuda a entender margen de la casa, comparar casas y detectar precios alejados de la probabilidad estimada.",
        ],
      },
      {
        title: "Error común",
        body: [
          "El error más común es tratar la probabilidad implícita como probabilidad real. La cuota publicada puede incluir margen, liquidez, comportamiento del mercado y ajustes de la casa. Debe leerse como referencia de precio, no como verdad absoluta.",
        ],
      },
    ],
    productNote:
      "En prevIA, la probabilidad implícita ayuda a traducir cuotas de mercado a una lectura comparable con probabilidad estimada, cuota justa y lectura de valor.",
    faq: [
      {
        question: "¿Probabilidad implícita es lo mismo que probabilidad real?",
        answer:
          "No. Muestra la probabilidad incorporada en la cuota, pero esa cuota puede incluir margen de la casa y distorsiones del mercado. La probabilidad real depende de una estimación propia o de modelo.",
      },
      {
        question: "¿Una cuota alta siempre significa una buena oportunidad?",
        answer:
          "No. Una cuota alta solo es interesante si la probabilidad real del evento es mayor que la probabilidad implícita exigida por ese precio.",
      },
    ],
  },
};
