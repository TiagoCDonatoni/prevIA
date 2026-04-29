import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const unitEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Unidade em apostas: o que é e como usar na gestão de banca",
    seoDescription:
      "Entenda o que é unidade em apostas, como ela ajuda a padronizar stakes e por que facilita medir desempenho sem depender do valor em reais.",
    intro:
      "Unidade é uma forma de padronizar o tamanho das apostas. Em vez de falar apenas em reais, o apostador define uma unidade como uma fração da banca e usa esse padrão para controlar risco e comparar resultados.",
    sections: [
      {
        title: "Como funciona uma unidade",
        body: [
          "Uma unidade pode representar, por exemplo, 1% da banca. Se a banca é de R$1.000, uma unidade seria R$10. Uma aposta de 2 unidades teria stake de R$20. Esse padrão ajuda a evitar que cada decisão seja tomada de forma emocional.",
          "O valor da unidade pode mudar conforme a banca cresce ou diminui, mas a lógica permanece: manter o risco proporcional ao capital disponível.",
        ],
      },
      {
        title: "Por que usar unidade",
        body: [
          "Usar unidade facilita comparar desempenho entre períodos, estratégias e mercados. Um lucro de 20 unidades comunica melhor a eficiência do processo do que apenas o valor absoluto em dinheiro, porque considera o tamanho relativo da banca.",
          "Também ajuda a reduzir exageros. Quando a stake é definida em unidades, fica mais fácil perceber quando uma aposta está grande demais para o nível de risco planejado.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é mudar o valor da unidade o tempo todo para tentar recuperar perdas ou aproveitar uma sequência positiva. A unidade deve ser parte da disciplina de gestão, não uma justificativa para aumentar risco sem critério.",
        ],
      },
    ],
    productNote:
      "O prevIA ajuda na leitura de probabilidade, odd justa e valor, mas a definição de unidade e stake deve seguir uma estratégia própria de gestão de banca.",
    faq: [
      {
        question: "Uma unidade precisa ser sempre 1% da banca?",
        answer:
          "Não. 1% é uma referência comum e conservadora, mas cada pessoa pode definir a unidade conforme banca, perfil de risco e estratégia.",
      },
      {
        question: "Unidade é igual a stake?",
        answer:
          "Não exatamente. Unidade é uma medida padronizada; stake é o valor efetivamente apostado em uma decisão específica.",
      },
    ],
  },

  en: {
    seoTitle: "Unit in betting: what it is and why it helps control stake size",
    seoDescription:
      "Learn what a betting unit is, how it standardizes stake sizing, and why units help compare performance and risk.",
    intro:
      "A unit is a standardized stake size. Instead of thinking only in currency, bettors use units to make risk easier to compare across bets and bankroll sizes.",
    sections: [
      {
        title: "Why units are useful",
        body: [
          "Units create consistency. If one unit equals 1% of bankroll, a two-unit bet means 2% risk regardless of the absolute money amount.",
          "This makes performance easier to evaluate and reduces emotional stake changes after wins or losses.",
        ],
      },
      {
        title: "Units and bankroll",
        body: [
          "Unit size should be tied to bankroll and risk tolerance. A unit that is too large can make normal variance feel dangerous.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is calling every bet one unit while actually changing the money amount emotionally. That removes the benefit of standardization.",
        ],
      },
    ],
    productNote:
      "In prevIA, using units can help users separate analysis quality from emotional stake sizing.",
    faq: [
      {
        question: "Is one unit always 1% of bankroll?",
        answer:
          "No. It is a common reference, but each user must define a unit according to risk tolerance.",
      },
      {
        question: "Do units reduce variance?",
        answer:
          "They do not reduce sports variance, but they help control financial exposure.",
      },
    ],
  },

  es: {
    seoTitle: "Unidad en apuestas: qué es y por qué ayuda a controlar la stake",
    seoDescription:
      "Entiende qué es una unidad, cómo estandariza el tamaño de apuesta y por qué ayuda a comparar rendimiento y riesgo.",
    intro:
      "Una unidad es un tamaño de stake estandarizado. En vez de pensar solo en dinero, se usan unidades para comparar riesgo entre apuestas y bancas diferentes.",
    sections: [
      {
        title: "Por qué son útiles las unidades",
        body: [
          "Las unidades crean consistencia. Si una unidad equivale al 1% de la banca, una apuesta de dos unidades implica 2% de riesgo, sin importar el valor absoluto.",
          "Esto facilita evaluar desempeño y reduce cambios emocionales de stake después de ganar o perder.",
        ],
      },
      {
        title: "Unidades y banca",
        body: [
          "El tamaño de unidad debe depender de la banca y la tolerancia al riesgo. Una unidad demasiado grande puede hacer peligrosa una varianza normal.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es llamar todo “una unidad” mientras el valor en dinero cambia por emoción. Eso elimina la estandarización.",
        ],
      },
    ],
    productNote:
      "En prevIA, usar unidades puede ayudar a separar calidad de análisis y tamaño emocional de apuesta.",
    faq: [
      {
        question: "¿Una unidad siempre es 1% de la banca?",
        answer:
          "No. Es una referencia común, pero cada usuario debe definirla según su riesgo.",
      },
      {
        question: "¿Las unidades reducen la varianza?",
        answer:
          "No reducen la varianza del deporte, pero ayudan a controlar exposición financiera.",
      },
    ],
  },
};
