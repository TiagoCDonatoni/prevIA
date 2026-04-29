import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const stakeEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Stake: o que é valor apostado e como controlar risco",
    seoDescription: "Entenda o que é stake, como ela se relaciona com banca, unidade e risco, e por que tamanho de aposta importa tanto quanto escolher uma odd.",
    intro: "Stake é o valor arriscado em uma aposta específica. Ela pode ser expressa em dinheiro, percentual da banca ou unidades, dependendo da forma de gestão usada.",
    sections: [
      {
        title: "Stake não é só valor da aposta",
        body: [
          "A stake define o tamanho do risco assumido em cada decisão. Duas pessoas podem fazer a mesma leitura de valor, mas ter resultados financeiros muito diferentes se usarem stakes desproporcionais.",
          "Por isso, stake deve conversar com banca, perfil de risco e confiança na análise, sem depender apenas de impulso.",
        ],
      },
      {
        title: "Stake e unidade",
        body: [
          "Muitos apostadores usam unidade para padronizar o tamanho das apostas. Por exemplo: se uma unidade vale 1% da banca, uma aposta de 2 unidades representa 2% da banca.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é variar stake demais conforme emoção, perda recente ou desejo de recuperar prejuízo. Isso aumenta volatilidade e dificulta avaliar o processo.",
        ],
      },
    ],
    productNote: "No prevIA, a análise ajuda a organizar probabilidade, preço e valor. A definição da stake deve ser feita com disciplina e gestão própria de risco.",
    faq: [
      {
        question: "Stake maior significa aposta melhor?",
        answer: "Não. Stake maior significa risco maior. A qualidade da aposta depende da relação entre probabilidade, preço e contexto.",
      },
      {
        question: "Como definir uma stake?",
        answer: "Uma forma simples é usar percentual da banca ou unidades fixas, sempre respeitando seu limite de risco.",
      },
    ],
  },

  en: {
    seoTitle: "Stake: what bet size means and how it affects risk",
    seoDescription:
      "Understand what stake means, how it relates to bankroll and units, and why bet sizing matters as much as odds selection.",
    intro:
      "Stake is the amount risked on a specific bet. It can be expressed as money, a percentage of bankroll, or units depending on the risk framework used.",
    sections: [
      {
        title: "Stake is risk size",
        body: [
          "Stake defines how much risk you take in one decision. Two users may analyze the same price but get very different financial outcomes if their stakes are inconsistent.",
          "A stake should reflect bankroll, risk profile, and decision quality rather than impulse or recent emotion.",
        ],
      },
      {
        title: "Stake and units",
        body: [
          "Many bettors use units to standardize stake sizing. For example, if one unit equals 1% of bankroll, a two-unit bet risks 2%.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is changing stake size dramatically after wins, losses, or frustration. That makes the process harder to evaluate.",
        ],
      },
    ],
    productNote:
      "prevIA helps organize probability, price, and value. Stake sizing should still follow the user’s own risk rules.",
    faq: [
      {
        question: "Does a bigger stake mean a better bet?",
        answer:
          "No. It only means higher risk. Bet quality depends on probability, price, and context.",
      },
      {
        question: "How can I define stake size?",
        answer:
          "A simple approach is using fixed units or a small percentage of bankroll.",
      },
    ],
  },

  es: {
    seoTitle: "Stake: qué es el valor apostado y cómo afecta el riesgo",
    seoDescription:
      "Entiende qué es stake, cómo se relaciona con banca y unidades, y por qué el tamaño de apuesta importa tanto como la cuota.",
    intro:
      "Stake es el valor arriesgado en una apuesta específica. Puede expresarse en dinero, porcentaje de banca o unidades, según la gestión utilizada.",
    sections: [
      {
        title: "Stake es tamaño de riesgo",
        body: [
          "La stake define cuánto riesgo asumes en una decisión. Dos usuarios pueden analizar el mismo precio y tener resultados financieros muy diferentes si sus stakes no son consistentes.",
          "La stake debe conversar con banca, perfil de riesgo y calidad de decisión, no solo con impulso o emoción reciente.",
        ],
      },
      {
        title: "Stake y unidades",
        body: [
          "Muchos apostadores usan unidades para estandarizar el tamaño de sus apuestas. Si una unidad equivale al 1% de la banca, una apuesta de dos unidades arriesga 2%.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es cambiar mucho la stake después de ganar, perder o frustrarse. Eso dificulta evaluar el proceso.",
        ],
      },
    ],
    productNote:
      "prevIA ayuda a organizar probabilidad, precio y valor. La stake debe seguir las reglas de riesgo del usuario.",
    faq: [
      {
        question: "¿Una stake mayor significa mejor apuesta?",
        answer:
          "No. Solo significa mayor riesgo. La calidad depende de probabilidad, precio y contexto.",
      },
      {
        question: "¿Cómo definir una stake?",
        answer:
          "Una forma simple es usar unidades fijas o un pequeño porcentaje de la banca.",
      },
    ],
  },
};
