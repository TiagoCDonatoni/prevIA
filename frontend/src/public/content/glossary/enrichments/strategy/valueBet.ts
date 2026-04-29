import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const valueBetEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Value bet: o que é e como identificar valor em uma odd",
    seoDescription:
      "Entenda o conceito de value bet, por que uma aposta de valor não é aposta certa e como comparar odd de mercado com probabilidade estimada.",
    intro:
      "Value bet é uma aposta em que o preço oferecido pelo mercado parece melhor do que a probabilidade real estimada. É um conceito central para quem quer analisar odds com lógica de longo prazo, e não apenas tentar adivinhar resultados.",
    sections: [
      {
        title: "O que caracteriza uma value bet",
        body: [
          "Existe value quando a odd disponível paga mais do que deveria segundo uma estimativa de probabilidade. Se um evento tem 60% de chance, a odd justa seria aproximadamente 1.67. Se o mercado oferece 1.90, o preço está acima da referência teórica.",
          "Isso não significa que a aposta vai vencer. Significa que, se a estimativa estiver correta e situações semelhantes se repetirem muitas vezes, aquele tipo de preço tende a ser favorável.",
        ],
      },
      {
        title: "Value bet não é certeza",
        body: [
          "Uma aposta com valor pode perder. Uma aposta sem valor pode ganhar. O resultado isolado não valida nem invalida a análise. O conceito de value depende de amostra, consistência e comparação entre probabilidade e preço.",
          "Por isso, value betting é mais próximo de gestão de decisão do que de previsão perfeita. O foco é tomar decisões melhores repetidamente, não acertar todos os jogos.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro mais perigoso é chamar qualquer odd alta de value. Uma odd só tem valor quando paga mais do que a chance real exige. Sem estimativa de probabilidade, a palavra value vira apenas opinião.",
        ],
      },
    ],
    productNote:
      "No prevIA, a leitura de valor aparece quando probabilidade estimada, odd justa e preço de mercado são colocados lado a lado para apoiar uma decisão mais clara.",
    faq: [
      {
        question: "Value bet significa aposta garantida?",
        answer:
          "Não. Significa que a relação entre preço e probabilidade parece favorável. Ainda assim, o evento pode perder normalmente.",
      },
      {
        question: "Como saber se uma odd tem valor?",
        answer:
          "Você precisa comparar a probabilidade implícita da odd com uma estimativa de probabilidade real. Se a chance estimada for maior que a exigida pela odd, pode haver valor.",
      },
    ],
  },

  en: {
    seoTitle: "Value bet: what it is and how to identify value in odds",
    seoDescription:
      "Understand value betting, why a value bet is not a guaranteed bet, and how to compare market odds with estimated probability.",
    intro:
      "A value bet is a bet where the market price appears better than the estimated true probability. It is central for anyone who wants to analyze odds with long-term logic instead of simply trying to predict results.",
    sections: [
      {
        title: "What makes a value bet",
        body: [
          "Value exists when the available odds pay more than they should according to a probability estimate. If an event has a 60% chance, fair odds are roughly 1.67. If the market offers 1.90, the price is above the theoretical reference.",
          "This does not mean the bet will win. It means that, if the estimate is sound and similar situations repeat many times, that type of price may be favorable.",
        ],
      },
      {
        title: "Value betting is not certainty",
        body: [
          "A value bet can lose. A non-value bet can win. A single result does not prove or disprove the analysis. Value depends on sample size, consistency, and the relationship between probability and price.",
          "That is why value betting is closer to decision quality than perfect prediction. The goal is to make better decisions repeatedly, not to win every match.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "The most dangerous mistake is calling any high odd a value bet. Odds only have value when they pay more than the true chance requires. Without probability estimation, value becomes just an opinion.",
        ],
      },
    ],
    productNote:
      "In prevIA, value reading appears when estimated probability, fair odds, and market price are shown side by side to support a clearer decision.",
    faq: [
      {
        question: "Does value bet mean guaranteed bet?",
        answer:
          "No. It means the relationship between price and probability appears favorable. The event can still lose normally.",
      },
      {
        question: "How do I know if odds have value?",
        answer:
          "You need to compare the odds' implied probability with an estimate of true probability. If your estimated chance is higher than the chance required by the odds, there may be value.",
      },
    ],
  },

  es: {
    seoTitle: "Value bet: qué es y cómo identificar valor en una cuota",
    seoDescription:
      "Entiende el concepto de value bet, por qué una apuesta de valor no es una apuesta segura y cómo comparar cuota de mercado con probabilidad estimada.",
    intro:
      "Value bet es una apuesta en la que el precio ofrecido por el mercado parece mejor que la probabilidad real estimada. Es un concepto central para analizar cuotas con lógica de largo plazo, no solo para intentar adivinar resultados.",
    sections: [
      {
        title: "Qué caracteriza una value bet",
        body: [
          "Existe value cuando la cuota disponible paga más de lo que debería según una estimación de probabilidad. Si un evento tiene 60% de probabilidad, la cuota justa sería aproximadamente 1.67. Si el mercado ofrece 1.90, el precio está por encima de la referencia teórica.",
          "Esto no significa que la apuesta vaya a ganar. Significa que, si la estimación es correcta y situaciones similares se repiten muchas veces, ese tipo de precio puede ser favorable.",
        ],
      },
      {
        title: "Value bet no es certeza",
        body: [
          "Una apuesta con valor puede perder. Una apuesta sin valor puede ganar. El resultado aislado no valida ni invalida el análisis. El concepto de value depende de muestra, consistencia y comparación entre probabilidad y precio.",
          "Por eso, value betting está más cerca de la calidad de decisión que de la predicción perfecta. El objetivo es tomar mejores decisiones repetidamente, no acertar todos los partidos.",
        ],
      },
      {
        title: "Error común",
        body: [
          "El error más peligroso es llamar value a cualquier cuota alta. Una cuota solo tiene valor cuando paga más de lo que exige la probabilidad real. Sin estimación de probabilidad, la palabra value se vuelve solo opinión.",
        ],
      },
    ],
    productNote:
      "En prevIA, la lectura de valor aparece cuando probabilidad estimada, cuota justa y precio de mercado se muestran lado a lado para apoyar una decisión más clara.",
    faq: [
      {
        question: "¿Value bet significa apuesta garantizada?",
        answer:
          "No. Significa que la relación entre precio y probabilidad parece favorable. Aun así, el evento puede perder normalmente.",
      },
      {
        question: "¿Cómo saber si una cuota tiene valor?",
        answer:
          "Debes comparar la probabilidad implícita de la cuota con una estimación de probabilidad real. Si la probabilidad estimada es mayor que la exigida por la cuota, puede haber valor.",
      },
    ],
  },
};
