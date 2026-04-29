import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const parlayEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Múltipla em apostas: o que é parlay e quais são os riscos",
    seoDescription:
      "Entenda o que é uma aposta múltipla, como as odds se combinam e por que parlays aumentam retorno potencial e também risco.",
    intro:
      "Parlay, ou aposta múltipla, combina duas ou mais seleções em um único bilhete. Para a múltipla vencer, todas as seleções precisam acertar. O retorno potencial aumenta, mas a dificuldade também.",
    sections: [
      {
        title: "Como uma múltipla funciona",
        body: [
          "Em uma múltipla, as odds das seleções são combinadas para formar uma odd final maior. Por exemplo, duas seleções a 1.80 podem gerar uma odd total próxima de 3.24. Isso torna o retorno atraente, mas exige que os dois eventos aconteçam.",
          "Quanto mais pernas entram no bilhete, maior a odd final e menor a probabilidade de acerto conjunto. Uma múltipla não é apenas a soma de boas ideias; ela é a multiplicação dos riscos.",
        ],
      },
      {
        title: "Por que múltiplas são populares",
        body: [
          "Múltiplas chamam atenção porque prometem grande retorno com stake pequena. Para entretenimento, podem ser simples de entender. Para análise séria, precisam ser avaliadas com cuidado, porque cada seleção adiciona incerteza.",
          "Mesmo quando cada seleção parece provável, a chance combinada pode ser muito menor do que a percepção inicial.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é usar múltiplas para tentar recuperar perdas ou transformar odds baixas em uma cotação alta sem avaliar a probabilidade conjunta. Isso costuma aumentar variância e dificultar controle de banca.",
        ],
      },
    ],
    productNote:
      "No prevIA, a leitura de valor é mais clara quando cada mercado é analisado individualmente antes de ser combinado em qualquer estratégia de múltiplas.",
    faq: [
      {
        question: "Em uma múltipla, uma seleção errada perde tudo?",
        answer:
          "Na maioria dos casos, sim. Se uma perna perde, o bilhete inteiro perde, salvo regras específicas como cash out ou sistemas especiais.",
      },
      {
        question: "Múltipla sempre tem mais valor porque paga mais?",
        answer:
          "Não. Ela paga mais porque é mais difícil. Valor depende da relação entre odd combinada e probabilidade conjunta real.",
      },
    ],
  },

  en: {
    seoTitle: "Parlay: what a multiple bet is and why risk grows quickly",
    seoDescription:
      "Learn what a parlay is, how combined odds work, and why multiple bets increase both potential payout and risk.",
    intro:
      "A parlay combines two or more selections into a single bet. All selections usually need to win for the ticket to win, which increases payout but also risk.",
    sections: [
      {
        title: "How parlays work",
        body: [
          "When selections are combined, their odds multiply. That can make the potential return look attractive, but the probability of all events happening together falls quickly.",
          "A parlay is not simply “more chances”; it is a more fragile structure because one wrong leg can lose the whole bet.",
        ],
      },
      {
        title: "Why price matters",
        body: [
          "Each leg needs to be priced well. Combining weak prices can create an attractive payout with poor expected value.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is using parlays mainly to chase high returns without evaluating the true combined probability.",
        ],
      },
    ],
    productNote:
      "In prevIA, parlay logic should still begin with individual probability and price quality.",
    faq: [
      {
        question: "Does a parlay need every leg to win?",
        answer:
          "Usually yes, unless the product has special rules such as voids or partial protections.",
      },
      {
        question: "Are parlays good because they pay more?",
        answer:
          "Not necessarily. Higher payout comes with much lower combined probability.",
      },
    ],
  },

  es: {
    seoTitle: "Múltiple: qué es parlay y por qué el riesgo crece rápido",
    seoDescription:
      "Entiende qué es una múltiple, cómo se combinan cuotas y por qué aumenta retorno potencial y riesgo.",
    intro:
      "Una múltiple combina dos o más selecciones en una sola apuesta. Normalmente todas deben ganar para que el ticket gane.",
    sections: [
      {
        title: "Cómo funcionan las múltiples",
        body: [
          "Al combinar selecciones, las cuotas se multiplican. El retorno potencial parece atractivo, pero la probabilidad de que todo ocurra baja rápido.",
          "Una múltiple no es simplemente “más chances”; es una estructura más frágil porque una pierna errada puede perder todo.",
        ],
      },
      {
        title: "Por qué importa el precio",
        body: [
          "Cada selección necesita buen precio. Combinar precios débiles puede crear un pago atractivo con mal valor esperado.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es usar múltiples para perseguir retornos altos sin evaluar la probabilidad combinada real.",
        ],
      },
    ],
    productNote:
      "En prevIA, la lógica de múltiple debe empezar por calidad individual de probabilidad y precio.",
    faq: [
      {
        question: "¿Una múltiple necesita que todas ganen?",
        answer:
          "Normalmente sí, salvo reglas especiales como anulaciones o protecciones.",
      },
      {
        question: "¿Son buenas porque pagan más?",
        answer:
          "No necesariamente. Mayor pago viene con menor probabilidad combinada.",
      },
    ],
  },
};
