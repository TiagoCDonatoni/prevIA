import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const roiEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "ROI em apostas: o que é retorno sobre investimento",
    seoDescription:
      "Entenda o que é ROI em apostas esportivas, como calcular retorno sobre o valor apostado e por que ele precisa ser lido com amostra e contexto.",
    intro:
      "ROI significa retorno sobre investimento. Em apostas, ele mede o resultado obtido em relação ao total apostado. É uma métrica útil para avaliar eficiência, mas pode ser enganosa em amostras pequenas.",
    sections: [
      {
        title: "Como calcular ROI em apostas",
        body: [
          "A fórmula básica é: ROI = lucro líquido dividido pelo total apostado. Se você apostou R$1.000 no total e terminou com R$100 de lucro, o ROI foi de 10%. Se perdeu R$100, o ROI foi de -10%.",
          "O ROI permite comparar estratégias com volumes diferentes, porque olha para retorno proporcional e não apenas para valor absoluto.",
        ],
      },
      {
        title: "Por que ROI precisa de contexto",
        body: [
          "Um ROI alto em poucas apostas pode ser apenas variância positiva. Um ROI baixo em uma amostra maior pode ser mais confiável do que um número espetacular em dez decisões. Por isso, ROI deve ser lido junto com número de apostas, mercados, odds médias e método usado.",
          "Também é importante separar ROI por tipo de mercado, liga ou estratégia para entender onde existe desempenho real.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é usar ROI isolado como prova definitiva. Sem tamanho de amostra e controle de risco, o número pode parecer melhor ou pior do que realmente é.",
        ],
      },
    ],
    productNote:
      "No prevIA, métricas futuras de validação e backtest podem usar ROI junto com indicadores como Brier Score, Log Loss e calibração para avaliar qualidade do modelo.",
    faq: [
      {
        question: "ROI positivo significa estratégia boa?",
        answer:
          "Pode indicar bom desempenho, mas precisa ser avaliado com amostra suficiente, consistência e controle de risco.",
      },
      {
        question: "ROI é igual a lucro?",
        answer:
          "Não. Lucro é valor absoluto; ROI é o retorno proporcional ao total apostado.",
      },
    ],
  },

  en: {
    seoTitle: "ROI in betting: how return on investment is interpreted",
    seoDescription:
      "Learn ROI, how it measures return relative to stake, and why it must be read together with sample size and risk.",
    intro:
      "ROI, or return on investment, measures return relative to the amount staked. It is useful, but only meaningful with context.",
    sections: [
      {
        title: "How ROI is interpreted",
        body: [
          "If total profit is 100 and total staked is 1,000, ROI is 10%. It shows efficiency relative to capital risked.",
          "ROI helps compare strategies, but it can be distorted by small samples or unusual variance.",
        ],
      },
      {
        title: "ROI and sample size",
        body: [
          "A high ROI over a few bets can be luck. A lower but stable ROI over many decisions can be more meaningful.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is looking at ROI without volume, market, odds range, or risk profile.",
        ],
      },
    ],
    productNote:
      "In prevIA, ROI is part of future validation and backtesting thinking, not a guarantee of future results.",
    faq: [
      {
        question: "Does high ROI mean a strategy is good?",
        answer:
          "Not by itself. Sample size and risk matter.",
      },
      {
        question: "Can ROI be negative with good decisions?",
        answer:
          "Temporarily yes, because variance can dominate short periods.",
      },
    ],
  },

  es: {
    seoTitle: "ROI en apuestas: cómo interpretar retorno sobre inversión",
    seoDescription:
      "Entiende ROI, cómo mide retorno relativo a stake y por qué debe leerse con muestra y riesgo.",
    intro:
      "ROI, retorno sobre inversión, mide el retorno relativo al total apostado. Es útil, pero solo con contexto.",
    sections: [
      {
        title: "Cómo se interpreta",
        body: [
          "Si el lucro total es 100 y el total apostado es 1.000, el ROI es 10%. Muestra eficiencia sobre capital arriesgado.",
          "Ayuda a comparar estrategias, pero puede distorsionarse por muestras pequeñas o varianza.",
        ],
      },
      {
        title: "ROI y muestra",
        body: [
          "Un ROI alto en pocas apuestas puede ser suerte. Uno menor pero estable en muchas decisiones puede ser más significativo.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es mirar ROI sin volumen, mercado, rango de cuotas o perfil de riesgo.",
        ],
      },
    ],
    productNote:
      "En prevIA, ROI forma parte de validación y backtesting futuros, no garantía de resultados.",
    faq: [
      {
        question: "¿ROI alto significa buena estrategia?",
        answer:
          "No por sí solo. Importan muestra y riesgo.",
      },
      {
        question: "¿Puede ser negativo con buenas decisiones?",
        answer:
          "Temporalmente sí, porque la varianza puede dominar periodos cortos.",
      },
    ],
  },
};
