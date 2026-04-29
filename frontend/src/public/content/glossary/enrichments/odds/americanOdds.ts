import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const americanOddsEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Odd americana: como funcionam cotacoes positivas e negativas",
    seoDescription:
      "Entenda o formato de odd americana, a diferenca entre cotacoes positivas e negativas, e como interpretar risco e retorno nesse modelo.",
    intro:
      "Odd americana e um formato de cotacao muito usado nos Estados Unidos. Ela aparece com sinal positivo ou negativo, como +150 ou -120, e exige uma leitura diferente da odd decimal.",
    sections: [
      {
        title: "Como ler odds positivas",
        body: [
          "Uma odd +150 indica quanto voce lucraria a cada 100 unidades apostadas. Se a aposta vence, uma stake de 100 teria lucro de 150, alem da devolucao da stake.",
          "Odds positivas costumam aparecer em resultados menos provaveis ou em lados tratados como underdogs pelo mercado.",
        ],
      },
      {
        title: "Como ler odds negativas",
        body: [
          "Uma odd -120 indica quanto voce precisa apostar para lucrar 100 unidades. Nesse caso, seria necessario arriscar 120 para obter 100 de lucro.",
          "Odds negativas geralmente aparecem em favoritos ou em resultados com probabilidade implicita mais alta.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum e achar que o sinal positivo sempre indica oportunidade e o negativo sempre indica risco ruim. O que importa e a relacao entre preco, probabilidade e valor.",
        ],
      },
    ],
    productNote:
      "No prevIA, a padronizacao em odds decimais facilita comparar precos internacionais com probabilidade estimada e odd justa.",
    faq: [
      {
        question: "Odd americana positiva e melhor que negativa?",
        answer:
          "Nao necessariamente. Ela apenas representa outro formato de preco. A qualidade depende da probabilidade estimada em relacao ao retorno.",
      },
      {
        question: "Por que a odd americana tem sinal?",
        answer:
          "O sinal indica se o numero mostra lucro para cada 100 apostados ou quanto e preciso apostar para lucrar 100.",
      },
    ],
  },

  en: {
    seoTitle: "American odds: how positive and negative odds work",
    seoDescription:
      "Understand American odds, what +150 and -200 mean, and how they relate to profit, stake, and probability.",
    intro:
      "American odds use positive and negative numbers to show payout. Positive odds show profit on a 100-unit stake; negative odds show how much you must stake to profit 100.",
    sections: [
      {
        title: "Positive and negative odds",
        body: [
          "+150 means a 100-unit stake profits 150 if it wins. -200 means you need to stake 200 to profit 100.",
          "The format can feel different, but it still represents price and implied probability.",
        ],
      },
      {
        title: "Why understanding format matters",
        body: [
          "Being able to compare American odds with decimal odds helps avoid misreading price across regions or sportsbooks.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is assuming positive odds are always value. They only pay more because the implied probability is lower.",
        ],
      },
    ],
    productNote:
      "prevIA uses decimal-style analysis, but understanding American odds helps with broader market comparison.",
    faq: [
      {
        question: "What does +150 mean?",
        answer:
          "A 100-unit stake profits 150 if the bet wins.",
      },
      {
        question: "What does -200 mean?",
        answer:
          "You must stake 200 units to profit 100.",
      },
    ],
  },

  es: {
    seoTitle: "Cuota americana: cómo funcionan cuotas positivas y negativas",
    seoDescription:
      "Entiende cuotas americanas, qué significan +150 y -200, y cómo se relacionan con ganancia, stake y probabilidad.",
    intro:
      "La cuota americana usa números positivos y negativos. Las positivas muestran ganancia sobre stake de 100; las negativas muestran cuánto apostar para ganar 100.",
    sections: [
      {
        title: "Cuotas positivas y negativas",
        body: [
          "+150 significa que una stake de 100 gana 150 de lucro. -200 significa apostar 200 para ganar 100.",
          "El formato parece diferente, pero representa precio y probabilidad implícita.",
        ],
      },
      {
        title: "Por qué importa",
        body: [
          "Comparar cuotas americanas con decimales evita leer mal precios entre regiones o casas.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es pensar que cuota positiva siempre tiene valor. Paga más porque la probabilidad implícita es menor.",
        ],
      },
    ],
    productNote:
      "prevIA usa análisis en formato decimal, pero entender cuota americana ayuda a comparar mercados.",
    faq: [
      {
        question: "¿Qué significa +150?",
        answer:
          "Una stake de 100 gana 150 si acierta.",
      },
      {
        question: "¿Qué significa -200?",
        answer:
          "Debes apostar 200 para ganar 100.",
      },
    ],
  },
};
