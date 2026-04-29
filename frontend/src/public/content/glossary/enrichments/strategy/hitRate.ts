import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const hitRateEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Taxa de acerto em apostas: por que hit rate não conta tudo",
    seoDescription:
      "Entenda o que é taxa de acerto, como ela se relaciona com odds e por que acertar mais apostas não significa necessariamente lucrar mais.",
    intro:
      "Taxa de acerto, ou hit rate, mede o percentual de apostas vencedoras. É uma métrica intuitiva, mas incompleta: ela não diz se as odds pagavam o suficiente para compensar os riscos.",
    sections: [
      {
        title: "Como interpretar taxa de acerto",
        body: [
          "Se você faz 100 apostas e acerta 55, sua taxa de acerto é 55%. O número parece bom, mas só faz sentido quando comparado com a odd média. Acertar 55% em odds 1.50 pode ser ruim; acertar 45% em odds 2.40 pode ser ótimo.",
          "A taxa de acerto precisa ser comparada com a probabilidade implícita exigida pelas odds. Sem preço, o acerto isolado não responde se houve valor.",
        ],
      },
      {
        title: "Hit rate e perfil de estratégia",
        body: [
          "Estratégias em favoritos tendem a ter taxa de acerto maior e odds menores. Estratégias em underdogs tendem a ter taxa menor e odds maiores. Nenhuma das duas é automaticamente melhor; tudo depende de preço e valor esperado.",
          "Por isso, hit rate deve ser lido junto com ROI, yield, odd média e tamanho da amostra.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é buscar apenas alta taxa de acerto. Isso pode levar a odds muito baixas, pouca margem e decisões ruins mesmo com muitos bilhetes vencedores.",
        ],
      },
    ],
    productNote:
      "No prevIA, a leitura de uma aposta não se limita à chance de acerto. A comparação entre probabilidade estimada, odd justa e preço de mercado é mais importante para avaliar valor.",
    faq: [
      {
        question: "Taxa de acerto alta garante lucro?",
        answer:
          "Não. Se as odds forem baixas demais, uma taxa alta ainda pode gerar prejuízo.",
      },
      {
        question: "Taxa de acerto baixa sempre é ruim?",
        answer:
          "Não. Estratégias com odds altas podem ter hit rate menor e ainda serem lucrativas se o preço compensar.",
      },
    ],
  },

  en: {
    seoTitle: "Hit rate: what win percentage means in betting",
    seoDescription:
      "Understand hit rate, why win percentage alone is not enough, and how odds determine whether a hit rate is profitable.",
    intro:
      "Hit rate is the percentage of bets that win. It is easy to understand, but it can be misleading without odds context.",
    sections: [
      {
        title: "Why hit rate is not enough",
        body: [
          "A 60% hit rate can lose money if the odds are too low. A 40% hit rate can be profitable if the odds are high enough.",
          "Profitability depends on the relationship between win rate and average price.",
        ],
      },
      {
        title: "Break-even hit rate",
        body: [
          "Every odd has a required break-even probability. Comparing hit rate to that requirement gives better context.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is chasing high hit rate while accepting poor prices.",
        ],
      },
    ],
    productNote:
      "In prevIA, hit rate should be read together with odds, implied probability, and expected value.",
    faq: [
      {
        question: "Is higher hit rate always better?",
        answer:
          "No. It depends on the odds.",
      },
      {
        question: "Can low hit rate be profitable?",
        answer:
          "Yes, if the average odds are high enough and priced well.",
      },
    ],
  },

  es: {
    seoTitle: "Tasa de acierto: qué significa porcentaje de victorias",
    seoDescription:
      "Entiende tasa de acierto, por qué el porcentaje solo no basta y cómo las cuotas determinan rentabilidad.",
    intro:
      "Tasa de acierto es el porcentaje de apuestas ganadas. Es fácil de entender, pero puede engañar sin contexto de cuotas.",
    sections: [
      {
        title: "Por qué no basta",
        body: [
          "Una tasa de 60% puede perder dinero si las cuotas son muy bajas. Una de 40% puede ser rentable si las cuotas son suficientemente altas.",
          "La rentabilidad depende de la relación entre porcentaje de acierto y precio promedio.",
        ],
      },
      {
        title: "Tasa de equilibrio",
        body: [
          "Cada cuota tiene una probabilidad necesaria para equilibrio. Comparar la tasa con ese requisito da mejor contexto.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es perseguir alta tasa de acierto aceptando malos precios.",
        ],
      },
    ],
    productNote:
      "En prevIA, tasa de acierto debe leerse junto con cuota, probabilidad implícita y valor esperado.",
    faq: [
      {
        question: "¿Mayor tasa siempre es mejor?",
        answer:
          "No. Depende de las cuotas.",
      },
      {
        question: "¿Baja tasa puede ser rentable?",
        answer:
          "Sí, si las cuotas promedio son altas y bien precificadas.",
      },
    ],
  },
};
