import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const lineMovementEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Movimento de linha: o que significa quando as odds mudam",
    seoDescription: "Entenda o que é movimento de linha, por que odds mudam antes do jogo e como interpretar alterações de preço no mercado.",
    intro: "Movimento de linha é a alteração das odds, handicaps ou totais ao longo do tempo. Ele pode refletir entrada de dinheiro, ajuste de risco, novas informações ou mudança na percepção do mercado.",
    sections: [
      {
        title: "Por que as odds se movimentam",
        body: [
          "As odds não são estáticas. Elas podem mudar por escalações, lesões, volume de apostas, notícias, comportamento de traders ou tentativa da casa de equilibrar exposição. Em mercados mais líquidos, movimentos fortes podem indicar informação relevante.",
          "Nem todo movimento significa que existe uma oportunidade. Às vezes o preço apenas se ajusta para uma região mais eficiente.",
        ],
      },
      {
        title: "Como interpretar o movimento",
        body: [
          "Uma queda de odd pode indicar aumento de confiança naquele lado ou correção de preço. Uma alta pode indicar perda de interesse, nova informação negativa ou busca de equilíbrio pela casa. A leitura correta depende do contexto.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é seguir qualquer movimento como se fosse sinal automático. Movimento de linha precisa ser analisado junto com probabilidade, valor, liquidez e momento do mercado.",
        ],
      },
    ],
    productNote: "No prevIA, a leitura de mercado ganha mais contexto quando preço, probabilidade e odds disponíveis são comparados em vez de analisados isoladamente.",
    faq: [
      {
        question: "Quando a odd cai, significa que a aposta é boa?",
        answer: "Não necessariamente. Pode significar que o mercado corrigiu o preço, mas a decisão ainda depende da probabilidade estimada e da odd disponível no momento.",
      },
      {
        question: "Movimento de linha sempre indica informação nova?",
        answer: "Não. Pode indicar informação nova, mas também pode refletir volume, gestão de risco ou ajuste comercial.",
      },
    ],
  },

  en: {
    seoTitle: "Line movement: what odds changes mean before a match",
    seoDescription:
      "Understand line movement, why odds change before events, and how to interpret market price shifts.",
    intro:
      "Line movement is the change in odds, handicaps, or totals over time. It can reflect money flow, new information, or risk adjustment.",
    sections: [
      {
        title: "Why odds move",
        body: [
          "Odds can move because of lineups, injuries, betting volume, news, trader adjustments, or bookmaker exposure.",
          "Not every movement means opportunity; sometimes the market is simply correcting price.",
        ],
      },
      {
        title: "How to interpret movement",
        body: [
          "A shortening price may indicate increased confidence or correction. A drifting price may indicate reduced demand or new negative information. Context matters.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is following every move as if it were an automatic signal.",
        ],
      },
    ],
    productNote:
      "In prevIA, market movement becomes more useful when combined with probability and available price.",
    faq: [
      {
        question: "Does falling odds mean a good bet?",
        answer:
          "Not necessarily. It may mean the value has already disappeared.",
      },
      {
        question: "Does movement always mean new information?",
        answer:
          "No. It can also reflect volume, risk management, or commercial adjustment.",
      },
    ],
  },

  es: {
    seoTitle: "Movimiento de línea: qué significa cuando cambian las cuotas",
    seoDescription:
      "Entiende movimiento de línea, por qué cambian las cuotas antes del evento y cómo interpretar cambios de precio.",
    intro:
      "Movimiento de línea es el cambio de cuotas, hándicaps o totales con el tiempo. Puede reflejar flujo de dinero, nueva información o ajuste de riesgo.",
    sections: [
      {
        title: "Por qué se mueven las cuotas",
        body: [
          "Las cuotas pueden moverse por alineaciones, lesiones, volumen, noticias, traders o exposición de la casa.",
          "No todo movimiento significa oportunidad; a veces el mercado simplemente corrige precio.",
        ],
      },
      {
        title: "Cómo interpretarlo",
        body: [
          "Una cuota que baja puede indicar más confianza o corrección. Una que sube puede indicar menor demanda o información negativa. El contexto importa.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es seguir cualquier movimiento como señal automática.",
        ],
      },
    ],
    productNote:
      "En prevIA, el movimiento de mercado es más útil cuando se combina con probabilidad y precio disponible.",
    faq: [
      {
        question: "¿Una cuota que baja significa buena apuesta?",
        answer:
          "No necesariamente. Puede significar que el valor ya desapareció.",
      },
      {
        question: "¿Movimiento siempre significa información nueva?",
        answer:
          "No. También puede reflejar volumen, gestión de riesgo o ajuste comercial.",
      },
    ],
  },
};
