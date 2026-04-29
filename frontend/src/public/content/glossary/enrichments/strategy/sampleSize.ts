import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const sampleSizeEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Tamanho de amostra: por que poucos jogos enganam na análise de apostas",
    seoDescription:
      "Entenda o que é tamanho de amostra, por que poucos resultados podem distorcer conclusões e como avaliar métricas com mais cautela.",
    intro:
      "Tamanho de amostra é a quantidade de observações usadas para tirar uma conclusão. Em apostas e análise esportiva, amostras pequenas podem gerar leituras enganosas porque são muito afetadas por variância.",
    sections: [
      {
        title: "Por que amostra importa",
        body: [
          "Um time pode vencer três jogos seguidos sem ter melhorado tanto. Uma estratégia pode acertar cinco apostas seguidas sem ter vantagem real. Com poucos dados, o acaso tem peso grande e pode criar falsas certezas.",
          "Amostras maiores ajudam a estabilizar métricas, reduzir ruído e avaliar se um padrão é consistente ou apenas momentâneo.",
        ],
      },
      {
        title: "Amostra em times, mercados e estratégias",
        body: [
          "Ao analisar um time, é importante separar recorte recente, temporada inteira, mando de campo e força dos adversários. Ao avaliar uma estratégia, é preciso volume suficiente para observar desempenho além de vitórias e derrotas pontuais.",
          "O tamanho ideal da amostra depende da pergunta. Alguns sinais aparecem rápido; outros precisam de muito mais dados.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é transformar um recorte curto em verdade. Frases como 'sempre acontece' ou 'nunca bate' muitas vezes vêm de amostras pequenas demais.",
        ],
      },
    ],
    productNote:
      "No prevIA, recortes estatísticos devem ser lidos com contexto. Métricas são mais úteis quando combinam volume, atualidade e qualidade dos dados.",
    faq: [
      {
        question: "Quantos jogos são suficientes para uma conclusão?",
        answer:
          "Depende da métrica e do objetivo. Em geral, quanto mais variável o evento, maior deve ser a amostra para reduzir ruído.",
      },
      {
        question: "Forma recente não importa?",
        answer:
          "Importa, mas deve ser tratada como um recorte contextual, não como verdade absoluta isolada.",
      },
    ],
  },
  en: {
    seoTitle: "Sample size: why one result is not enough to judge betting strategy",
    seoDescription:
      "Understand sample size, why betting results need enough observations, and how small samples can mislead analysis.",
    intro:
      "Sample size is the number of observations used to evaluate results. In betting, it determines how much confidence you can have in performance conclusions.",
    sections: [
      {
        title: "Why sample size matters",
        body: [
          "A few wins or losses can happen by chance. A larger sample helps separate luck from process quality.",
          "Small samples are noisy and can create false confidence or unnecessary panic.",
        ],
      },
      {
        title: "Sample size and metrics",
        body: [
          "Metrics such as ROI, hit rate, and CLV become more meaningful when measured over enough bets.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is declaring a strategy good or bad after a very small number of bets.",
        ],
      },
    ],
    productNote:
      "In prevIA, sample size is important for future validation, backtesting, and model evaluation.",
    faq: [
      {
        question: "How many bets are enough?",
        answer:
          "It depends on the market and strategy, but more observations generally improve confidence.",
      },
      {
        question: "Can small samples mislead?",
        answer:
          "Yes. They can be dominated by variance.",
      },
    ],
  },

  es: {
    seoTitle: "Tamaño de muestra: por qué un resultado no basta",
    seoDescription:
      "Entiende tamaño de muestra, por qué los resultados necesitan suficientes observaciones y cómo muestras pequeñas engañan.",
    intro:
      "Tamaño de muestra es la cantidad de observaciones usadas para evaluar resultados. En apuestas determina cuánta confianza tener en conclusiones.",
    sections: [
      {
        title: "Por qué importa",
        body: [
          "Pocas victorias o derrotas pueden ocurrir por azar. Una muestra mayor ayuda a separar suerte de calidad del proceso.",
          "Muestras pequeñas son ruidosas y pueden crear falsa confianza o pánico innecesario.",
        ],
      },
      {
        title: "Muestra y métricas",
        body: [
          "Métricas como ROI, tasa de acierto y CLV son más significativas con suficientes apuestas.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es declarar una estrategia buena o mala después de pocas apuestas.",
        ],
      },
    ],
    productNote:
      "En prevIA, tamaño de muestra es importante para validación, backtesting y evaluación de modelos.",
    faq: [
      {
        question: "¿Cuántas apuestas son suficientes?",
        answer:
          "Depende del mercado y estrategia, pero más observaciones suelen mejorar confianza.",
      },
      {
        question: "¿Una muestra pequeña engaña?",
        answer:
          "Sí. Puede estar dominada por varianza.",
      },
    ],
  },
};
