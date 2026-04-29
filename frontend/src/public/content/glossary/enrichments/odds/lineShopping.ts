import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const lineShoppingEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Line shopping: por que comparar odds entre casas importa",
    seoDescription: "Entenda o que é line shopping, como pequenas diferenças de odd afetam o longo prazo e por que comparar preços é parte da análise de valor.",
    intro: "Line shopping é o hábito de comparar diferentes casas ou fontes para encontrar o melhor preço disponível para a mesma aposta. Parece um detalhe pequeno, mas pode mudar muito o resultado no longo prazo.",
    sections: [
      {
        title: "Por que pequenas diferenças de odd importam",
        body: [
          "Uma odd 1.90 e uma odd 1.95 podem parecer quase iguais, mas ao longo de muitas apostas essa diferença se acumula. Quanto melhor o preço que você captura, menor a probabilidade real necessária para aquela decisão fazer sentido.",
          "Line shopping não melhora a chance do evento acontecer, mas melhora o preço da sua decisão. Isso é central em qualquer leitura séria de valor.",
        ],
      },
      {
        title: "Line shopping e valor esperado",
        body: [
          "Quando duas casas oferecem preços diferentes para o mesmo mercado, a melhor odd pode transformar uma aposta marginal em uma aposta com leitura de valor. Por isso, comparar preço é tão importante quanto analisar o jogo.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é usar uma única casa como referência absoluta de mercado. Isso limita a comparação e pode fazer o usuário aceitar preços piores sem perceber.",
        ],
      },
    ],
    productNote: "No prevIA, a comparação de odds ajuda o usuário a enxergar diferenças de preço e entender quando uma cotação está mais próxima ou mais distante da leitura de valor.",
    faq: [
      {
        question: "Line shopping é só procurar a maior odd?",
        answer: "Não. Procurar a maior odd é parte do processo, mas ela ainda precisa ser comparada com a probabilidade estimada e o contexto do mercado.",
      },
      {
        question: "Diferenças pequenas de odd fazem diferença?",
        answer: "Sim. No curto prazo parecem pequenas, mas no longo prazo impactam retorno esperado e eficiência da gestão de banca.",
      },
    ],
  },

  en: {
    seoTitle: "Line shopping: why comparing odds across bookmakers matters",
    seoDescription:
      "Learn line shopping, why small odds differences matter, and how better prices can affect long-term expected value.",
    intro:
      "Line shopping is the habit of comparing bookmakers or sources to find the best available price for the same bet.",
    sections: [
      {
        title: "Why small differences matter",
        body: [
          "Odds of 1.90 and 1.95 may look close, but over many bets the difference compounds. Better prices reduce the probability required to break even.",
          "Line shopping does not change the chance of the event; it improves the price of the decision.",
        ],
      },
      {
        title: "Line shopping and value",
        body: [
          "A better available odd can turn a marginal bet into a value-looking position, depending on your estimated probability.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is using one bookmaker as the entire market reference.",
        ],
      },
    ],
    productNote:
      "In prevIA, comparing odds helps users see price differences and value signals more clearly.",
    faq: [
      {
        question: "Is line shopping just finding the highest odd?",
        answer:
          "Partly, but the best odd still needs to be compared with estimated probability.",
      },
      {
        question: "Do small odds differences matter?",
        answer:
          "Yes, especially over a larger number of decisions.",
      },
    ],
  },

  es: {
    seoTitle: "Line shopping: por qué comparar cuotas entre casas importa",
    seoDescription:
      "Entiende line shopping, por qué pequeñas diferencias de cuota importan y cómo mejor precio afecta el valor esperado.",
    intro:
      "Line shopping es el hábito de comparar casas o fuentes para encontrar el mejor precio disponible para la misma apuesta.",
    sections: [
      {
        title: "Por qué importan diferencias pequeñas",
        body: [
          "Cuotas 1.90 y 1.95 parecen cercanas, pero en muchas apuestas la diferencia se acumula. Mejor precio reduce la probabilidad necesaria para equilibrio.",
          "Line shopping no cambia la probabilidad del evento; mejora el precio de la decisión.",
        ],
      },
      {
        title: "Line shopping y valor",
        body: [
          "Una mejor cuota disponible puede transformar una apuesta marginal en una posición con apariencia de valor, según tu probabilidad estimada.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es usar una sola casa como referencia total de mercado.",
        ],
      },
    ],
    productNote:
      "En prevIA, comparar cuotas ayuda a ver diferencias de precio y señales de valor con más claridad.",
    faq: [
      {
        question: "¿Es solo buscar la cuota más alta?",
        answer:
          "En parte, pero la mejor cuota aún debe compararse con la probabilidad estimada.",
      },
      {
        question: "¿Diferencias pequeñas importan?",
        answer:
          "Sí, especialmente en muchas decisiones.",
      },
    ],
  },
};
