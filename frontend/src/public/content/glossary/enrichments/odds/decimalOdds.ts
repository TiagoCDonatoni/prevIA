import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const decimalOddsEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Odd decimal: o que é, como funciona e como interpretar",
    seoDescription: "Entenda o que é odd decimal, como calcular retorno, lucro e probabilidade implícita a partir desse formato usado em apostas esportivas.",
    intro: "Odd decimal é o formato mais comum para apresentar cotações em apostas esportivas no Brasil. Ela mostra quanto será o retorno total para cada unidade apostada, já incluindo a stake original.",
    sections: [
      {
        title: "Como funciona uma odd decimal",
        body: [
          "Se a odd é 2.00, cada R$1 apostado retorna R$2 no total em caso de acerto. Esse total inclui o valor apostado e o lucro. Em uma aposta de R$100 a 2.00, o retorno total seria R$200: R$100 da stake e R$100 de lucro.",
          "Quanto menor a odd, maior a probabilidade implícita exigida pelo preço. Quanto maior a odd, menor a chance implícita, mas maior o retorno potencial.",
        ],
      },
      {
        title: "Por que a odd decimal é importante",
        body: [
          "A odd decimal é a base para calcular probabilidade implícita, odd justa, retorno esperado e comparação entre casas. Sem entender esse formato, fica difícil avaliar se uma cotação está cara, barata ou próxima do preço justo.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "Um erro comum é olhar só para o lucro potencial e ignorar a probabilidade exigida pela odd. Uma odd alta pode parecer atraente, mas precisa ser comparada com a chance real estimada do evento.",
        ],
      },
    ],
    productNote: "No prevIA, a odd decimal é convertida em probabilidade implícita e comparada com a probabilidade estimada para ajudar na leitura de preço, valor e risco.",
    faq: [
      {
        question: "Odd decimal mostra lucro ou retorno total?",
        answer: "Ela mostra retorno total. Para saber o lucro, subtraia a stake do retorno final.",
      },
      {
        question: "Odd decimal maior é sempre melhor?",
        answer: "Não. Ela paga mais, mas também exige que a chance real compense o risco embutido naquele preço.",
      },
    ],
  },

  en: {
    seoTitle: "Decimal odds: what they are and how to interpret them",
    seoDescription:
      "Learn decimal odds, how to calculate total return and profit, and how they connect to implied probability.",
    intro:
      "Decimal odds are a common way to display betting prices. They show the total return for each unit staked, including the original stake.",
    sections: [
      {
        title: "How decimal odds work",
        body: [
          "Odds of 2.00 return 2 units for every 1 unit staked. If you stake 100 at 2.00, the total return is 200: 100 stake plus 100 profit.",
          "Lower odds imply a higher required probability. Higher odds imply a lower required probability and a larger potential payout.",
        ],
      },
      {
        title: "Why they matter",
        body: [
          "Decimal odds are the basis for calculating implied probability, fair odds, expected value, and odds comparison.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is focusing only on payout and ignoring the probability required by the price.",
        ],
      },
    ],
    productNote:
      "In prevIA, decimal odds are converted into implied probability and compared with estimated probability.",
    faq: [
      {
        question: "Do decimal odds show profit or total return?",
        answer:
          "They show total return. Profit is total return minus stake.",
      },
      {
        question: "Are higher decimal odds always better?",
        answer:
          "No. They only make sense if the probability supports the price.",
      },
    ],
  },

  es: {
    seoTitle: "Cuota decimal: qué es y cómo interpretarla",
    seoDescription:
      "Entiende cuotas decimales, cómo calcular retorno total y lucro, y cómo se conectan con probabilidad implícita.",
    intro:
      "La cuota decimal es una forma común de mostrar precios de apuestas. Muestra el retorno total por cada unidad apostada, incluida la stake original.",
    sections: [
      {
        title: "Cómo funciona",
        body: [
          "Una cuota 2.00 devuelve 2 unidades por cada 1 apostada. Si apuestas 100 a 2.00, el retorno total es 200: 100 de stake y 100 de ganancia.",
          "Cuotas menores implican mayor probabilidad requerida. Cuotas mayores implican menor probabilidad requerida y mayor pago potencial.",
        ],
      },
      {
        title: "Por qué importa",
        body: [
          "La cuota decimal es base para calcular probabilidad implícita, cuota justa, valor esperado y comparar precios.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es mirar solo el pago potencial e ignorar la probabilidad exigida por el precio.",
        ],
      },
    ],
    productNote:
      "En prevIA, la cuota decimal se convierte en probabilidad implícita y se compara con la probabilidad estimada.",
    faq: [
      {
        question: "¿Muestra ganancia o retorno total?",
        answer:
          "Muestra retorno total. La ganancia es retorno menos stake.",
      },
      {
        question: "¿Una cuota mayor siempre es mejor?",
        answer:
          "No. Solo tiene sentido si la probabilidad sostiene el precio.",
      },
    ],
  },
};
