import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const asianHandicapEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Asian handicap: o que é e como funcionam as linhas asiáticas",
    seoDescription: "Entenda o que é Asian handicap, como funcionam linhas como -0.5, +0.25 e -1.0, e por que esse mercado reduz ou ajusta cenários de empate.",
    intro: "Asian handicap é um mercado que aplica uma vantagem ou desvantagem artificial a um dos lados. Ele serve para equilibrar confronto, ajustar risco e criar preços diferentes do mercado tradicional de vencedor.",
    sections: [
      {
        title: "Como funciona o Asian handicap",
        body: [
          "Em vez de apostar apenas em quem vence, você aposta considerando uma linha de handicap. Um time -1.0 precisa vencer por mais de um gol para a aposta ganhar totalmente. Se vencer por exatamente um gol, a aposta pode ser devolvida.",
          "Linhas como +0.25 e -0.25 dividem a stake em partes, podendo gerar meia vitória, meia derrota ou devolução parcial.",
        ],
      },
      {
        title: "Por que esse mercado é usado",
        body: [
          "O Asian handicap permite ajustar o risco quando um time é muito favorito ou quando o apostador quer proteção parcial contra determinados resultados.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é apostar em handicap sem entender exatamente o que acontece em cada placar. Antes de analisar valor, é preciso entender a regra da linha.",
        ],
      },
    ],
    productNote: "No prevIA, mercados de handicap fazem parte da evolução natural da leitura de preço, especialmente quando combinados com probabilidade estimada e odd justa.",
    faq: [
      {
        question: "Asian handicap pode devolver a aposta?",
        answer: "Sim. Dependendo da linha, pode haver devolução total ou parcial se o resultado cair exatamente no ponto de push.",
      },
      {
        question: "Asian handicap é melhor que 1x2?",
        answer: "Não necessariamente. Ele apenas oferece outra forma de precificar risco e proteger cenários específicos.",
      },
    ],
  },

  en: {
    seoTitle: "Asian handicap: what it is and how handicap lines work",
    seoDescription:
      "Learn Asian handicap lines such as -0.5, +0.25, and -1.0, and how they change win, refund, and partial result scenarios.",
    intro:
      "Asian handicap applies a virtual advantage or disadvantage to one side. It can balance uneven matches, reduce draw exposure, and create more precise pricing than simple winner markets.",
    sections: [
      {
        title: "How Asian handicap works",
        body: [
          "Instead of only betting on who wins, you bet with a handicap line. A team at -1.0 must win by more than one goal to win fully; winning by exactly one goal can return the stake.",
          "Quarter lines such as +0.25 or -0.25 split the stake and can create half wins or half losses.",
        ],
      },
      {
        title: "Why bettors use it",
        body: [
          "Asian handicap can protect specific score scenarios or make a strong favorite bettable at a different price.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is betting a line without understanding what happens at each final score.",
        ],
      },
    ],
    productNote:
      "In prevIA, handicap markets can be analyzed through estimated probability, fair odds, and available market price.",
    faq: [
      {
        question: "Can Asian handicap return the stake?",
        answer:
          "Yes. Some lines can create a full or partial refund depending on the score.",
      },
      {
        question: "Is Asian handicap always better than 1X2?",
        answer:
          "No. It is simply another way to price risk.",
      },
    ],
  },

  es: {
    seoTitle: "Hándicap asiático: qué es y cómo funcionan las líneas",
    seoDescription:
      "Entiende líneas como -0.5, +0.25 y -1.0, y cómo cambian escenarios de victoria, devolución y resultado parcial.",
    intro:
      "El hándicap asiático aplica una ventaja o desventaja virtual a un lado. Sirve para equilibrar partidos, reducir exposición al empate y crear precios más precisos.",
    sections: [
      {
        title: "Cómo funciona el hándicap asiático",
        body: [
          "En vez de apostar solo por el ganador, apuestas considerando una línea. Un equipo -1.0 debe ganar por más de un gol para ganar totalmente; si gana por uno, puede haber devolución.",
          "Líneas de cuarto como +0.25 o -0.25 dividen la stake y pueden generar media victoria o media derrota.",
        ],
      },
      {
        title: "Por qué se usa",
        body: [
          "El hándicap asiático puede proteger ciertos marcadores o hacer jugable un favorito fuerte a otro precio.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es apostar una línea sin entender qué ocurre en cada marcador final.",
        ],
      },
    ],
    productNote:
      "En prevIA, los mercados de hándicap pueden analizarse con probabilidad estimada, cuota justa y precio disponible.",
    faq: [
      {
        question: "¿El hándicap asiático puede devolver la stake?",
        answer:
          "Sí. Algunas líneas generan devolución total o parcial según el marcador.",
      },
      {
        question: "¿Es siempre mejor que 1X2?",
        answer:
          "No. Es otra forma de precificar riesgo.",
      },
    ],
  },
};
