import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const halfLossEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Meia derrota: como funciona perda parcial em apostas asiaticas",
    seoDescription:
      "Entenda o que e meia derrota, quando metade da stake e perdida e por que esse conceito aparece em linhas asiaticas fracionadas.",
    intro:
      "Meia derrota e o oposto da meia vitoria: parte da stake e perdida e parte e devolvida. Ela acontece em linhas asiaticas que dividem a aposta em duas partes.",
    sections: [
      {
        title: "Como a meia derrota acontece",
        body: [
          "Em uma linha +0.25, por exemplo, a stake pode ser dividida entre 0 e +0.5. Se o time perde, as duas partes perdem. Se empata, uma parte devolve e outra vence. Em outras linhas, o resultado pode gerar meia derrota.",
          "No total asiatico, uma linha como Under 2.25 pode gerar meia derrota se o jogo termina com exatamente 2 gols, dependendo da divisao da linha.",
        ],
      },
      {
        title: "Por que entender esse resultado",
        body: [
          "Meia derrota mostra que a linha asiatica nao e simplesmente ganhar ou perder. Ela cria cenarios intermediarios que precisam entrar na avaliacao de risco.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum e achar que uma linha fracionada funciona como uma linha simples. Sem entender a divisao da stake, o retorno esperado pode ser interpretado errado.",
        ],
      },
    ],
    productNote:
      "No prevIA, a analise de mercados asiaticos deve considerar resultado parcial, protecao e preco disponivel.",
    faq: [
      {
        question: "Meia derrota perde toda a stake?",
        answer:
          "Nao. Normalmente metade da stake e perdida e a outra metade e devolvida.",
      },
      {
        question: "Meia derrota e comum em quais mercados?",
        answer:
          "Principalmente em handicap asiatico e total asiatico com linhas quebradas.",
      },
    ],
  },

  en: {
    seoTitle: "Half loss: what partial losses mean in Asian lines",
    seoDescription:
      "Understand half loss in Asian handicap and total markets, where part of the stake loses and part may be returned.",
    intro:
      "A half loss happens when one part of a split Asian line loses and the other part is returned. It reduces the loss compared with a full loss.",
    sections: [
      {
        title: "How half loss happens",
        body: [
          "Quarter lines split the stake into two adjacent half-lines. Depending on the final score, one side of the split can lose while the other pushes.",
          "This creates a partial loss instead of losing the full stake.",
        ],
      },
      {
        title: "Why it matters",
        body: [
          "Half loss is part of the risk profile of Asian lines. It can make a line more protective than a pure half-point line.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is comparing quarter lines without understanding partial settlement.",
        ],
      },
    ],
    productNote:
      "In prevIA, partial outcomes help explain why similar Asian lines can have different prices.",
    faq: [
      {
        question: "Is half loss a full loss?",
        answer:
          "No. Only part of the stake loses while another part may be returned.",
      },
      {
        question: "Where does half loss appear?",
        answer:
          "Usually in quarter Asian handicap and total lines.",
      },
    ],
  },

  es: {
    seoTitle: "Media derrota: qué significa perder parcialmente en líneas asiáticas",
    seoDescription:
      "Entiende media derrota en hándicap y totales asiáticos, donde parte de la stake pierde y parte puede devolverse.",
    intro:
      "Media derrota ocurre cuando una parte de una línea asiática dividida pierde y otra parte se devuelve. Reduce la pérdida frente a una derrota completa.",
    sections: [
      {
        title: "Cómo ocurre",
        body: [
          "Las líneas de cuarto dividen la stake en dos líneas adyacentes. Según el marcador final, una parte puede perder y otra hacer push.",
          "Eso crea pérdida parcial en vez de perder toda la stake.",
        ],
      },
      {
        title: "Por qué importa",
        body: [
          "La media derrota forma parte del perfil de riesgo de líneas asiáticas. Puede ofrecer más protección que una línea pura de medio punto.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es comparar líneas de cuarto sin entender la liquidación parcial.",
        ],
      },
    ],
    productNote:
      "En prevIA, los resultados parciales ayudan a explicar por qué líneas asiáticas parecidas tienen precios diferentes.",
    faq: [
      {
        question: "¿Media derrota es pérdida total?",
        answer:
          "No. Solo una parte de la stake pierde y otra puede devolverse.",
      },
      {
        question: "¿Dónde aparece?",
        answer:
          "Normalmente en líneas asiáticas de cuarto.",
      },
    ],
  },
};
