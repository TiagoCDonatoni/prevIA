import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const kellyCriterionEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Critério de Kelly: o que é e como dimensiona stake pelo valor esperado",
    seoDescription:
      "Entenda o Critério de Kelly, como ele relaciona probabilidade, odd e tamanho da aposta, e por que deve ser usado com cuidado.",
    intro:
      "O Critério de Kelly é uma fórmula de gestão de stake que busca dimensionar quanto apostar quando existe vantagem matemática. Ele considera a odd disponível e a probabilidade estimada para sugerir uma fração da banca.",
    sections: [
      {
        title: "Como pensar no Kelly",
        body: [
          "A lógica do Kelly é simples na teoria: quanto maior a vantagem estimada entre probabilidade real e preço de mercado, maior poderia ser a stake. Quando não há vantagem, a fórmula tende a indicar que não vale apostar.",
          "Na prática, o Kelly depende muito da qualidade da probabilidade estimada. Se a estimativa estiver errada, a stake sugerida também pode ficar errada e agressiva demais.",
        ],
      },
      {
        title: "Por que muitos usam Kelly fracionado",
        body: [
          "Como o Kelly completo pode gerar stakes altas e bastante voláteis, muitos apostadores preferem Kelly fracionado, como meio Kelly ou quarto de Kelly. Isso reduz crescimento potencial, mas também reduz risco e oscilações.",
          "Para iniciantes, a ideia mais importante não é aplicar a fórmula cegamente, mas entender que tamanho de stake deve estar ligado à vantagem estimada e ao risco.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é usar Kelly com probabilidades chutadas. Se a chance estimada não é confiável, a fórmula cria uma falsa sensação de precisão e pode aumentar muito a exposição.",
        ],
      },
    ],
    productNote:
      "No prevIA, conceitos como probabilidade estimada, odd justa e edge ajudam a entender a lógica por trás do Kelly, mas a plataforma não deve ser lida como recomendação automática de stake.",
    faq: [
      {
        question: "Kelly garante lucro no longo prazo?",
        answer:
          "Não. Ele depende de estimativas corretas, disciplina e volume. Se a probabilidade estiver mal estimada, o Kelly pode aumentar risco.",
      },
      {
        question: "Kelly fracionado é mais conservador?",
        answer:
          "Sim. Usar uma fração do Kelly reduz a agressividade das stakes e costuma suavizar a variância.",
      },
    ],
  },

  en: {
    seoTitle: "Kelly criterion: what it is and why it is risky without discipline",
    seoDescription:
      "Understand the Kelly criterion, how it connects edge and stake sizing, and why many bettors use fractional Kelly for risk control.",
    intro:
      "The Kelly criterion is a staking method that links bet size to estimated edge. In theory, it maximizes long-term growth, but in practice it depends heavily on accurate probabilities.",
    sections: [
      {
        title: "How Kelly thinks about stake size",
        body: [
          "Kelly increases stake when the estimated edge is larger and reduces it when the edge is smaller. This makes stake sizing sensitive to both price and probability.",
          "Because probability estimates are uncertain, full Kelly can be too aggressive for many users.",
        ],
      },
      {
        title: "Fractional Kelly",
        body: [
          "Fractional Kelly uses a portion of the suggested stake, such as half Kelly or quarter Kelly, to reduce volatility and estimation risk.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is applying Kelly with weak probabilities. If the edge estimate is wrong, the suggested stake can become dangerous.",
        ],
      },
    ],
    productNote:
      "prevIA can support probability and price comparison, but aggressive staking systems should be used carefully and with personal risk limits.",
    faq: [
      {
        question: "Does Kelly guarantee profit?",
        answer:
          "No. It depends on accurate probabilities and still faces variance.",
      },
      {
        question: "Why use fractional Kelly?",
        answer:
          "To reduce volatility and protect against errors in probability estimates.",
      },
    ],
  },

  es: {
    seoTitle: "Criterio de Kelly: qué es y por qué exige disciplina",
    seoDescription:
      "Entiende el criterio de Kelly, cómo conecta ventaja y tamaño de stake, y por qué muchos usan Kelly fraccional para controlar riesgo.",
    intro:
      "El criterio de Kelly es un método de stake que vincula el tamaño de apuesta con la ventaja estimada. En teoría maximiza crecimiento a largo plazo, pero depende mucho de probabilidades correctas.",
    sections: [
      {
        title: "Cómo Kelly piensa la stake",
        body: [
          "Kelly aumenta la stake cuando el edge estimado es mayor y la reduce cuando la ventaja es menor. Por eso es sensible al precio y a la probabilidad.",
          "Como las estimaciones de probabilidad son inciertas, Kelly completo puede ser demasiado agresivo.",
        ],
      },
      {
        title: "Kelly fraccional",
        body: [
          "Kelly fraccional usa solo una parte de la stake sugerida, como medio Kelly o cuarto de Kelly, para reducir volatilidad y riesgo de estimación.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es aplicar Kelly con probabilidades débiles. Si el edge está mal estimado, la stake sugerida puede ser peligrosa.",
        ],
      },
    ],
    productNote:
      "prevIA puede apoyar la comparación de probabilidad y precio, pero sistemas agresivos de stake deben usarse con límites personales de riesgo.",
    faq: [
      {
        question: "¿Kelly garantiza ganancia?",
        answer:
          "No. Depende de probabilidades correctas y aún enfrenta varianza.",
      },
      {
        question: "¿Por qué usar Kelly fraccional?",
        answer:
          "Para reducir volatilidad y protegerse contra errores en la estimación de probabilidad.",
      },
    ],
  },
};
