import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const halfWinEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Meia vitoria: como funciona resultado parcial em linha asiatica",
    seoDescription:
      "Entenda o que e meia vitoria em apostas, como ela aparece em linhas asiaticas fracionadas e como afeta retorno e risco.",
    intro:
      "Meia vitoria ocorre quando apenas parte da stake vence e a outra parte e devolvida. Ela aparece em linhas asiaticas fracionadas, como -0.25, +0.25, 2.25 e 2.75.",
    sections: [
      {
        title: "Como funciona na pratica",
        body: [
          "Em uma linha -0.25, a stake e dividida entre 0 e -0.5. Se o time vence, ambas as partes ganham. Se empata, a parte 0 devolve e a parte -0.5 perde. Em outras linhas, o resultado pode gerar meia vitoria.",
          "No mercado de totais, uma linha 2.25 divide a stake entre 2.0 e 2.5. Dependendo do placar, parte pode ganhar e parte ser devolvida.",
        ],
      },
      {
        title: "Por que isso importa",
        body: [
          "Meia vitoria muda o retorno real e o risco da aposta. Ela permite precificar cenarios intermediarios, mas exige entender exatamente como a stake e dividida.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum e olhar apenas a odd e ignorar a regra da linha. Em mercados asiaticos, a estrutura da linha e tao importante quanto o preco.",
        ],
      },
    ],
    productNote:
      "No prevIA, linhas asiaticas entram na leitura de preco como mercados que combinam probabilidade, protecao parcial e retorno esperado.",
    faq: [
      {
        question: "Meia vitoria e lucro total?",
        answer:
          "Nao. Em geral, apenas metade da stake vence e a outra metade e devolvida.",
      },
      {
        question: "Onde aparece meia vitoria?",
        answer:
          "Normalmente em handicaps e totais asiaticos com linhas fracionadas.",
      },
    ],
  },

  en: {
    seoTitle: "Half win: what partial winnings mean in Asian lines",
    seoDescription:
      "Learn what half win means in Asian handicap and total markets, and why quarter lines can split the stake.",
    intro:
      "A half win happens when one part of a split Asian line wins and the other part is returned. It is common in quarter handicap and total lines.",
    sections: [
      {
        title: "How half win happens",
        body: [
          "If you bet Over 2.25 and the match has exactly three goals, the Over 2.0 part wins and the Over 2.5 part also wins; but on some quarter structures, one portion may win while another pushes.",
          "Quarter lines split the stake into two adjacent half-lines.",
        ],
      },
      {
        title: "Why it matters",
        body: [
          "Half wins make returns more nuanced than simple win-or-loss markets. You need to know exactly how the line settles.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is not realizing the stake is split across two lines.",
        ],
      },
    ],
    productNote:
      "In prevIA, Asian line education helps users interpret market outcomes and price more accurately.",
    faq: [
      {
        question: "Is half win a full profit?",
        answer:
          "No. Only part of the stake wins while another part may be returned.",
      },
      {
        question: "Where does half win appear?",
        answer:
          "Mostly in Asian handicap and Asian total markets.",
      },
    ],
  },

  es: {
    seoTitle: "Media victoria: qué significa ganar parcialmente en líneas asiáticas",
    seoDescription:
      "Entiende media victoria en hándicap y totales asiáticos, y por qué líneas de cuarto dividen la stake.",
    intro:
      "Media victoria ocurre cuando una parte de una línea asiática dividida gana y otra parte se devuelve. Es común en líneas de cuarto.",
    sections: [
      {
        title: "Cómo ocurre",
        body: [
          "Las líneas de cuarto dividen la stake en dos líneas adyacentes. Dependiendo del resultado, una parte puede ganar y otra ser devuelta.",
          "Por eso el resultado no siempre es victoria completa o derrota completa.",
        ],
      },
      {
        title: "Por qué importa",
        body: [
          "Las medias victorias hacen que el retorno sea más matizado. Hay que entender cómo se liquida cada línea.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es no darse cuenta de que la stake está dividida entre dos líneas.",
        ],
      },
    ],
    productNote:
      "En prevIA, entender líneas asiáticas ayuda a interpretar resultados y precios con más precisión.",
    faq: [
      {
        question: "¿Media victoria es ganancia completa?",
        answer:
          "No. Solo una parte de la stake gana y otra puede devolverse.",
      },
      {
        question: "¿Dónde aparece?",
        answer:
          "Principalmente en hándicap asiático y total asiático.",
      },
    ],
  },
};
