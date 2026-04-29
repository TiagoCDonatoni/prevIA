import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const varianceEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Variância em apostas: por que boas decisões também perdem",
    seoDescription:
      "Entenda o que é variância em apostas esportivas, por que resultados de curto prazo oscilam e como isso afeta leitura de valor e banca.",
    intro:
      "Variância é a oscilação natural entre expectativa e resultado. Em apostas, ela explica por que boas decisões podem perder e decisões ruins podem ganhar em amostras pequenas.",
    sections: [
      {
        title: "Como a variância aparece",
        body: [
          "Mesmo se uma aposta tem valor positivo, ela ainda pode perder. Um evento com 60% de chance também falha 40% das vezes. Se várias perdas acontecem em sequência, isso pode ser apenas variância, não necessariamente erro de análise.",
          "O problema é que, no curto prazo, resultado e qualidade da decisão se misturam. A variância torna perigoso julgar o processo por poucos jogos.",
        ],
      },
      {
        title: "Por que ela importa para gestão",
        body: [
          "A variância afeta banca, emocional e avaliação de estratégia. Sem gestão adequada, uma sequência negativa pode levar a aumento de stake, abandono do método ou decisões impulsivas.",
          "Entender variância ajuda a separar processo de resultado e reforça a importância de amostra maior.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é concluir que uma estratégia é boa porque ganhou algumas apostas ou ruim porque perdeu uma sequência curta. Variância exige paciência, registro e análise estatística.",
        ],
      },
    ],
    productNote:
      "No prevIA, a análise busca melhorar qualidade de decisão, mas nenhum modelo elimina a variância natural do esporte.",
    faq: [
      {
        question: "Variância é a mesma coisa que azar?",
        answer:
          "Não exatamente. Azar é uma forma informal de falar de resultados desfavoráveis; variância é a oscilação esperada em processos probabilísticos.",
      },
      {
        question: "Uma sequência ruim prova que a análise está errada?",
        answer:
          "Não necessariamente. É preciso avaliar amostra, preço capturado, probabilidade estimada e consistência do processo.",
      },
    ],
  },

  en: {
    seoTitle: "Variance in betting: why good decisions can still lose",
    seoDescription:
      "Learn variance, why short-term results can differ from expected outcomes, and why sample size matters.",
    intro:
      "Variance is the natural fluctuation between expected results and actual results. In betting, it explains why good decisions can lose and poor decisions can win in the short term.",
    sections: [
      {
        title: "Why variance matters",
        body: [
          "Sports outcomes are uncertain. Even when a bet has a favorable price, the event can fail. Over small samples, randomness can dominate the result.",
          "This is why process and sample size matter more than one isolated outcome.",
        ],
      },
      {
        title: "Variance and bankroll",
        body: [
          "Bankroll management exists partly to survive normal variance without abandoning the process.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is changing the whole strategy after a short losing streak.",
        ],
      },
    ],
    productNote:
      "In prevIA, variance awareness helps users interpret outcomes without confusing result and decision quality.",
    faq: [
      {
        question: "Can a good bet lose?",
        answer:
          "Yes. That is part of variance.",
      },
      {
        question: "Can a bad bet win?",
        answer:
          "Yes, especially in small samples.",
      },
    ],
  },

  es: {
    seoTitle: "Varianza en apuestas: por qué buenas decisiones pueden perder",
    seoDescription:
      "Entiende varianza, por qué resultados cortos pueden diferir de lo esperado y por qué importa el tamaño de muestra.",
    intro:
      "Varianza es la fluctuación natural entre resultados esperados y reales. En apuestas explica por qué buenas decisiones pueden perder y malas pueden ganar a corto plazo.",
    sections: [
      {
        title: "Por qué importa",
        body: [
          "El deporte es incierto. Aunque una apuesta tenga buen precio, el evento puede fallar. En muestras pequeñas, el azar puede dominar.",
          "Por eso el proceso y la muestra importan más que un resultado aislado.",
        ],
      },
      {
        title: "Varianza y banca",
        body: [
          "La gestión de banca existe en parte para sobrevivir varianza normal sin abandonar el proceso.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es cambiar toda la estrategia tras una racha corta de pérdidas.",
        ],
      },
    ],
    productNote:
      "En prevIA, entender varianza ayuda a no confundir resultado con calidad de decisión.",
    faq: [
      {
        question: "¿Una buena apuesta puede perder?",
        answer:
          "Sí. Es parte de la varianza.",
      },
      {
        question: "¿Una mala apuesta puede ganar?",
        answer:
          "Sí, especialmente en muestras pequeñas.",
      },
    ],
  },
};
