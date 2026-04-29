import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const moneylineEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Moneyline: o que é mercado de vencedor nas apostas",
    seoDescription: "Entenda o que é moneyline, como funciona o mercado de vencedor e como ele se relaciona com 1x2, empate e preço de mercado.",
    intro: "Moneyline é o mercado de vencedor. Em sua forma mais simples, ele pergunta quem vence o evento. Em esportes com empate, como futebol, a regra pode variar conforme a casa e o mercado oferecido.",
    sections: [
      {
        title: "Moneyline e 1x2",
        body: [
          "No futebol, o mercado mais tradicional é o 1x2: vitória do mandante, empate ou vitória do visitante. Em outros esportes, moneyline pode ter apenas dois lados quando não há empate ou quando prorrogação conta para o resultado.",
          "Por isso, é importante entender a regra específica do mercado antes de comparar odds.",
        ],
      },
      {
        title: "Como analisar o preço",
        body: [
          "A análise do moneyline passa por converter a odd em probabilidade implícita e comparar com uma estimativa real de chance de vitória. O objetivo não é apenas escolher quem parece mais forte, mas avaliar se o preço compensa.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é apostar no favorito sem olhar preço. Um favorito pode ter maior chance de vencer e ainda assim estar com odd ruim.",
        ],
      },
    ],
    productNote: "No prevIA, mercados de vencedor são analisados pela relação entre probabilidade estimada, odd justa e preço disponível.",
    faq: [
      {
        question: "Moneyline é igual a 1x2?",
        answer: "No futebol, pode ser parecido, mas o 1x2 inclui o empate como resultado separado. A regra exata depende do mercado.",
      },
      {
        question: "Favorito sempre tem valor?",
        answer: "Não. O favorito pode vencer com frequência, mas a odd precisa compensar a probabilidade real.",
      },
    ],
  },

  en: {
    seoTitle: "Moneyline: what winner markets mean in betting",
    seoDescription:
      "Understand the moneyline market, how it relates to match winners, 1X2, draws, and price evaluation.",
    intro:
      "Moneyline is the winner market. In its simplest form, it asks who wins the event. In sports with draws, rules may vary by market.",
    sections: [
      {
        title: "Moneyline and 1X2",
        body: [
          "In football, the traditional winner market is 1X2: home win, draw, or away win. In other sports, moneyline may have only two sides.",
          "Because rules differ, it is important to understand whether draws or overtime are included.",
        ],
      },
      {
        title: "How to analyze price",
        body: [
          "The key is converting odds into implied probability and comparing them with an estimated win probability.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is betting the favorite without checking price. A favorite can be likely to win and still be poor value.",
        ],
      },
    ],
    productNote:
      "In prevIA, winner markets are analyzed through estimated probability, fair odds, and market price.",
    faq: [
      {
        question: "Is moneyline the same as 1X2?",
        answer:
          "In football, 1X2 includes the draw as a separate result, so it depends on the exact market.",
      },
      {
        question: "Does the favorite always have value?",
        answer:
          "No. The odds must compensate for the real probability.",
      },
    ],
  },

  es: {
    seoTitle: "Moneyline: qué es mercado de ganador en apuestas",
    seoDescription:
      "Entiende el mercado moneyline, cómo se relaciona con ganador, 1X2, empate y evaluación de precio.",
    intro:
      "Moneyline es el mercado de ganador. En su forma simple pregunta quién gana el evento. En deportes con empate, la regla puede variar.",
    sections: [
      {
        title: "Moneyline y 1X2",
        body: [
          "En fútbol, el mercado tradicional es 1X2: local, empate o visitante. En otros deportes, moneyline puede tener solo dos lados.",
          "Por eso es importante entender si el empate o la prórroga cuentan en el mercado.",
        ],
      },
      {
        title: "Cómo analizar el precio",
        body: [
          "La clave es convertir la cuota en probabilidad implícita y compararla con una probabilidad estimada de victoria.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es apostar al favorito sin mirar el precio. Un favorito puede ganar con frecuencia y aun así no tener valor.",
        ],
      },
    ],
    productNote:
      "En prevIA, los mercados de ganador se analizan con probabilidad estimada, cuota justa y precio de mercado.",
    faq: [
      {
        question: "¿Moneyline es igual a 1X2?",
        answer:
          "En fútbol, 1X2 incluye el empate como resultado separado, así que depende del mercado exacto.",
      },
      {
        question: "¿El favorito siempre tiene valor?",
        answer:
          "No. La cuota debe compensar la probabilidad real.",
      },
    ],
  },
};
