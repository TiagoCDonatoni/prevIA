import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const sameGameParlayEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Same game parlay: o que e multipla no mesmo jogo",
    seoDescription:
      "Entenda o que e same game parlay, por que combinar mercados do mesmo jogo exige cuidado e como a correlacao afeta o preco.",
    intro:
      "Same game parlay e uma multipla formada por selecoes do mesmo evento. Ela pode combinar resultado, gols, jogadores, escanteios, cartoes e outros mercados de um unico jogo.",
    sections: [
      {
        title: "Por que e diferente de uma multipla comum",
        body: [
          "Em uma multipla tradicional, os eventos costumam ser independentes entre si. No same game parlay, as selecoes podem estar correlacionadas. Por exemplo, vitoria de um time e gol de seu atacante podem ter relacao direta.",
          "Essa correlacao torna a precificacao mais complexa. A casa pode ajustar a odd final para refletir dependencias entre os mercados.",
        ],
      },
      {
        title: "Atrativo e risco",
        body: [
          "O atrativo esta na odd maior e na narrativa do jogo. O risco esta em combinar muitas selecoes, aumentar a variancia e aceitar precos dificeis de avaliar.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum e montar same game parlay apenas porque a historia parece coerente. Coerencia narrativa nao garante valor matematico.",
        ],
      },
    ],
    productNote:
      "No prevIA, mercados combinados devem ser tratados com cautela, especialmente quando ha correlacao e baixa transparencia na precificacao.",
    faq: [
      {
        question: "Same game parlay e sempre ruim?",
        answer:
          "Nao necessariamente, mas costuma ser mais dificil avaliar valor real por causa da correlacao e da margem embutida.",
      },
      {
        question: "Qual o maior risco?",
        answer:
          "Combinar muitas selecoes e aceitar uma odd alta sem saber se o preco e justo.",
      },
    ],
  },

  en: {
    seoTitle: "Same-game parlay: what it is and why correlation matters",
    seoDescription:
      "Learn same-game parlay basics, how selections from one match are combined, and why correlation can make pricing harder.",
    intro:
      "A same-game parlay combines multiple selections from the same event into one bet. It can be appealing, but correlations between legs make pricing more complex.",
    sections: [
      {
        title: "How it works",
        body: [
          "Selections such as winner, total goals, team goals, or player props can be combined into one ticket. The bet usually needs all legs to win.",
          "Because the legs are from the same match, they may be connected rather than independent.",
        ],
      },
      {
        title: "Why correlation matters",
        body: [
          "If one leg changes the probability of another, the combined price should account for that relationship. This makes same-game parlays harder to evaluate than standard multiples.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is multiplying assumptions as if every leg were independent.",
        ],
      },
    ],
    productNote:
      "In prevIA, same-game parlay analysis would require careful probability modeling and correlation awareness.",
    faq: [
      {
        question: "Does every leg need to win?",
        answer:
          "Usually yes, unless a platform has special rules.",
      },
      {
        question: "Why is correlation important?",
        answer:
          "Because events in the same match can influence each other.",
      },
    ],
  },

  es: {
    seoTitle: "Same-game parlay: qué es y por qué importa la correlación",
    seoDescription:
      "Entiende same-game parlay, cómo combina selecciones de un mismo partido y por qué la correlación complica el precio.",
    intro:
      "Same-game parlay combina varias selecciones del mismo evento en una sola apuesta. Puede ser atractivo, pero las correlaciones entre selecciones dificultan el precio.",
    sections: [
      {
        title: "Cómo funciona",
        body: [
          "Selecciones como ganador, total de goles, goles de equipo o props pueden combinarse en un ticket. Normalmente todas deben ganar.",
          "Como las selecciones son del mismo partido, pueden estar conectadas y no ser independientes.",
        ],
      },
      {
        title: "Por qué importa la correlación",
        body: [
          "Si una selección cambia la probabilidad de otra, el precio combinado debe considerar esa relación.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es multiplicar supuestos como si todas las selecciones fueran independientes.",
        ],
      },
    ],
    productNote:
      "En prevIA, analizar same-game parlay exigiría modelado cuidadoso y conciencia de correlación.",
    faq: [
      {
        question: "¿Todas las selecciones deben ganar?",
        answer:
          "Normalmente sí, salvo reglas especiales de la plataforma.",
      },
      {
        question: "¿Por qué importa la correlación?",
        answer:
          "Porque eventos del mismo partido pueden influenciarse entre sí.",
      },
    ],
  },
};
