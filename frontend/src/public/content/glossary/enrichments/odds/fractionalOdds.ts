import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const fractionalOddsEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Odd fracionaria: o que e e como converter para odd decimal",
    seoDescription:
      "Entenda o formato de odd fracionaria, como interpretar cotacoes como 5/2 e 11/10, e como comparar esse formato com odds decimais.",
    intro:
      "Odd fracionaria e um formato tradicional de cotacao, muito comum no Reino Unido e em alguns mercados internacionais. Em vez de mostrar o retorno total, ela mostra o lucro potencial em relacao a stake.",
    sections: [
      {
        title: "Como ler uma odd fracionaria",
        body: [
          "Uma odd 5/2 significa que, para cada 2 unidades apostadas, o lucro potencial e de 5 unidades. Uma odd 11/10 significa que, para cada 10 unidades apostadas, o lucro potencial e de 11 unidades.",
          "Diferente da odd decimal, a fracionaria nao mostra o retorno total diretamente. Ela mostra primeiro o lucro. Para chegar ao retorno total, e preciso somar a stake original ao lucro potencial.",
        ],
      },
      {
        title: "Como converter para odd decimal",
        body: [
          "A conversao basica e dividir o numerador pelo denominador e somar 1. Uma odd 5/2 vira 3.50 em decimal, porque 5 dividido por 2 e 2.50, e o retorno total inclui mais 1 unidade da stake.",
          "Essa conversao ajuda a comparar casas, calcular probabilidade implicita e manter uma leitura padronizada de preco.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum e comparar odd fracionaria e odd decimal sem converter. Como um formato mostra lucro e o outro mostra retorno total, a leitura direta pode gerar confusao.",
        ],
      },
    ],
    productNote:
      "No prevIA, a leitura principal usa odds decimais para facilitar comparacao, probabilidade implicita, odd justa e leitura de valor.",
    faq: [
      {
        question: "Odd fracionaria mostra lucro ou retorno total?",
        answer:
          "Ela mostra o lucro em relacao a stake. Para obter o retorno total, some a stake ao lucro.",
      },
      {
        question: "Por que converter para decimal?",
        answer:
          "Porque o formato decimal facilita calculos de probabilidade implicita, retorno total e comparacao entre mercados.",
      },
    ],
  },

  en: {
    seoTitle: "Fractional odds: what they are and how to read them",
    seoDescription:
      "Learn fractional odds, how they express profit relative to stake, and how to convert them conceptually to decimal odds.",
    intro:
      "Fractional odds express potential profit relative to stake. They are common in some markets, especially in the UK and horse racing contexts.",
    sections: [
      {
        title: "How fractional odds work",
        body: [
          "Odds of 5/1 mean you can profit 5 units for every 1 unit staked. The total return includes the original stake as well.",
          "Odds of 1/2 mean you profit 1 unit for every 2 staked, showing a stronger favorite.",
        ],
      },
      {
        title: "Why conversion helps",
        body: [
          "Converting fractional odds to decimal or implied probability makes comparison easier across bookmakers and formats.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is confusing profit with total return. Fractional odds primarily show profit ratio.",
        ],
      },
    ],
    productNote:
      "In prevIA, decimal odds are the main reference, but understanding other formats helps users compare prices globally.",
    faq: [
      {
        question: "Do fractional odds show profit?",
        answer:
          "Yes, they show profit relative to stake. Total return adds the stake back.",
      },
      {
        question: "Are fractional odds common everywhere?",
        answer:
          "No. They are more common in certain regions and sports.",
      },
    ],
  },

  es: {
    seoTitle: "Cuota fraccionaria: qué es y cómo leerla",
    seoDescription:
      "Entiende cuotas fraccionarias, cómo expresan ganancia relativa a stake y cómo compararlas conceptualmente con cuotas decimales.",
    intro:
      "Las cuotas fraccionarias expresan ganancia potencial en relación con la stake. Son comunes en algunos mercados, especialmente Reino Unido y carreras.",
    sections: [
      {
        title: "Cómo funcionan",
        body: [
          "Una cuota 5/1 significa ganar 5 unidades por cada 1 apostada. El retorno total suma también la stake original.",
          "Una cuota 1/2 significa ganar 1 unidad por cada 2 apostadas, típico de favorito fuerte.",
        ],
      },
      {
        title: "Por qué convertir ayuda",
        body: [
          "Convertir a decimal o probabilidad implícita facilita comparar casas y formatos.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es confundir ganancia con retorno total. La fracción muestra principalmente relación de ganancia.",
        ],
      },
    ],
    productNote:
      "En prevIA, la cuota decimal es la referencia principal, pero entender otros formatos ayuda a comparar precios globalmente.",
    faq: [
      {
        question: "¿Muestran ganancia?",
        answer:
          "Sí, muestran ganancia relativa a stake. El retorno total suma la stake.",
      },
      {
        question: "¿Son comunes en todos lados?",
        answer:
          "No. Son más comunes en ciertas regiones y deportes.",
      },
    ],
  },
};
