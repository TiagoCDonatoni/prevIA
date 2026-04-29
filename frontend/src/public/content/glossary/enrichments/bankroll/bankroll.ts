import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const bankrollEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Bankroll: o que é banca e por que separar dinheiro para apostas",
    seoDescription: "Entenda o que é bankroll, por que separar uma banca de apostas e como esse conceito ajuda a controlar risco e variância.",
    intro: "Bankroll é o capital separado exclusivamente para apostas. A ideia é tratar esse dinheiro como uma banca específica, sem misturar com despesas pessoais ou decisões impulsivas.",
    sections: [
      {
        title: "Por que separar uma banca",
        body: [
          "Separar uma bankroll ajuda a medir desempenho, controlar risco e evitar que cada aposta seja decidida pelo emocional do momento. A banca funciona como limite operacional e referência para definir stakes.",
          "Sem uma bankroll definida, fica difícil saber se você está evoluindo, exagerando no risco ou apenas reagindo a vitórias e derrotas recentes.",
        ],
      },
      {
        title: "Bankroll e variância",
        body: [
          "Mesmo boas decisões podem perder em sequência. A bankroll existe para absorver essa variância sem comprometer o restante da vida financeira.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é aumentar demais a aposta após uma sequência positiva ou tentar recuperar perdas rapidamente. Isso quebra a lógica de gestão e aumenta risco de ruína.",
        ],
      },
    ],
    productNote: "O prevIA não substitui gestão de banca. Ele ajuda na análise de odds e probabilidades, mas a decisão de stake e risco continua sendo responsabilidade do usuário.",
    faq: [
      {
        question: "Bankroll é dinheiro extra para apostar?",
        answer: "Deve ser um capital separado e controlado, nunca dinheiro essencial para despesas pessoais.",
      },
      {
        question: "Ter uma banca garante lucro?",
        answer: "Não. A banca ajuda a controlar risco, mas não transforma decisões ruins em boas decisões.",
      },
    ],
  },

  en: {
    seoTitle: "Bankroll: what it is and why separating betting capital matters",
    seoDescription:
      "Learn what bankroll means, why bettors separate betting capital, and how bankroll management helps control risk and variance.",
    intro:
      "Bankroll is the money set aside specifically for betting. Treating it as a separate pool helps keep decisions disciplined and prevents betting activity from mixing with essential personal finances.",
    sections: [
      {
        title: "Why bankroll matters",
        body: [
          "A defined bankroll creates a clear operating limit. It helps you measure performance, size stakes consistently, and avoid making each bet based only on emotion or recent results.",
          "Without bankroll control, it becomes difficult to know whether your betting process is improving or whether you are simply increasing risk after wins and losses.",
        ],
      },
      {
        title: "Bankroll and variance",
        body: [
          "Even sound betting decisions can lose in streaks. Bankroll management exists to absorb that variance and reduce the chance of making desperate decisions after normal short-term swings.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is increasing stakes sharply after a win streak or trying to recover losses quickly. That breaks the risk plan and can damage the whole process.",
        ],
      },
    ],
    productNote:
      "In prevIA, odds and probability analysis can support decision-making, but bankroll size and risk discipline remain the user’s responsibility.",
    faq: [
      {
        question: "Does having a bankroll guarantee profit?",
        answer:
          "No. It helps control risk and evaluate decisions, but it does not turn poor prices or weak analysis into good bets.",
      },
      {
        question: "Should bankroll include money needed for expenses?",
        answer:
          "No. A bankroll should be separate from essential personal money.",
      },
    ],
  },

  es: {
    seoTitle: "Bankroll: qué es la banca y por qué separar capital para apuestas",
    seoDescription:
      "Entiende qué es bankroll, por qué separar una banca de apuestas y cómo la gestión ayuda a controlar riesgo y varianza.",
    intro:
      "Bankroll es el capital reservado específicamente para apuestas. Tratarlo como una banca separada ayuda a mantener disciplina y evita mezclar apuestas con dinero esencial.",
    sections: [
      {
        title: "Por qué importa la banca",
        body: [
          "Una banca definida crea un límite operativo claro. Ayuda a medir desempeño, definir stakes con consistencia y evitar decisiones basadas solo en emoción o resultados recientes.",
          "Sin control de bankroll, es difícil saber si el proceso mejora o si simplemente estás aumentando riesgo después de victorias y derrotas.",
        ],
      },
      {
        title: "Bankroll y varianza",
        body: [
          "Incluso decisiones correctas pueden perder en rachas. La gestión de banca existe para absorber esa varianza y reducir decisiones desesperadas tras oscilaciones normales.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es aumentar mucho la stake después de una buena racha o intentar recuperar pérdidas rápidamente. Eso rompe el plan de riesgo.",
        ],
      },
    ],
    productNote:
      "En prevIA, el análisis de cuotas y probabilidades puede apoyar la decisión, pero el tamaño de la banca y la disciplina de riesgo siguen siendo responsabilidad del usuario.",
    faq: [
      {
        question: "¿Tener bankroll garantiza ganancia?",
        answer:
          "No. Ayuda a controlar riesgo y evaluar decisiones, pero no convierte malos precios o análisis débiles en buenas apuestas.",
      },
      {
        question: "¿La banca debe incluir dinero para gastos esenciales?",
        answer:
          "No. La banca debe estar separada del dinero esencial.",
      },
    ],
  },
};
