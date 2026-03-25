import type { Lang } from "../../i18n";

type AboutCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Array<{
    title: string;
    paragraphs: string[];
  }>;
  highlight: {
    title: string;
    body: string;
  };
};

const ABOUT_COPY: Record<Lang, AboutCopy> = {
  pt: {
    eyebrow: "Quem somos",
    title: "Sobre o prevIA",
    intro:
      "O prevIA nasceu no Brasil com uma proposta clara: transformar dados, probabilidades e leitura de mercado em inteligência prática para apostas esportivas.",
    sections: [
      {
        title: "Por que o projeto existe",
        paragraphs: [
          "O projeto surgiu da percepção de que grande parte do conteúdo disponível nesse universo ainda gira em torno de opinião, ruído e promessas frágeis.",
          "O prevIA foi criado para seguir outro caminho: organizar informação, estruturar análise e oferecer ao usuário uma forma mais clara de interpretar jogos e mercados.",
        ],
      },
      {
        title: "O que buscamos entregar",
        paragraphs: [
          "Nosso escopo envolve transformar dados esportivos em contexto útil. Isso inclui leitura de partidas, interpretação de probabilidades, comparação com odds de mercado e construção de uma experiência que ajude o usuário a analisar melhor — seja ele iniciante, intermediário ou avançado.",
          "Mais do que entregar respostas prontas, a proposta do produto é apoiar decisões com mais clareza, profundidade e responsabilidade.",
        ],
      },
      {
        title: "Como pensamos a escala",
        paragraphs: [
          "Embora tenha nascido no Brasil, o prevIA foi desenhado desde a base para ser multilíngue e escalável, com visão de longo prazo para atender usuários em diferentes idiomas e mercados.",
          "Seguimos construindo o projeto de forma contínua, evoluindo com dados, validação prática e feedback de usuários reais.",
        ],
      },
    ],
    highlight: {
      title: "Nossa visão",
      body:
        "O prevIA não existe para prometer resultados irreais, mas para oferecer uma base mais inteligente e mais transparente para quem leva análise a sério. Nossa visão é desenvolver uma plataforma de referência em inteligência aplicada a apostas esportivas, unindo tecnologia, análise e experiência de uso em um produto sólido e global.",
    },
  },

  en: {
    eyebrow: "Who we are",
    title: "About prevIA",
    intro:
      "prevIA was born in Brazil with a clear proposal: turn data, probabilities, and market reading into practical intelligence for sports betting.",
    sections: [
      {
        title: "Why the project exists",
        paragraphs: [
          "The project came from the perception that much of the content available in this space still revolves around opinion, noise, and fragile promises.",
          "prevIA was created to follow a different path: organize information, structure analysis, and offer users a clearer way to interpret matches and markets.",
        ],
      },
      {
        title: "What we aim to deliver",
        paragraphs: [
          "Our scope is to turn sports data into useful context. That includes match reading, probability interpretation, comparison with market odds, and building an experience that helps the user analyze better — whether beginner, intermediate, or advanced.",
          "More than delivering ready-made answers, the product is designed to support decisions with more clarity, depth, and responsibility.",
        ],
      },
      {
        title: "How we think about scale",
        paragraphs: [
          "Although it was born in Brazil, prevIA was designed from the ground up to be multilingual and scalable, with a long-term vision to serve users across different languages and markets.",
          "We keep building the project continuously, evolving through data, practical validation, and feedback from real users.",
        ],
      },
    ],
    highlight: {
      title: "Our vision",
      body:
        "prevIA does not exist to promise unrealistic results, but to offer a smarter and more transparent foundation for people who take analysis seriously. Our vision is to build a reference platform in applied sports betting intelligence, combining technology, analysis, and user experience in a solid global product.",
    },
  },

  es: {
    eyebrow: "Quiénes somos",
    title: "Sobre prevIA",
    intro:
      "prevIA nació en Brasil con una propuesta clara: convertir datos, probabilidades y lectura de mercado en inteligencia práctica para apuestas deportivas.",
    sections: [
      {
        title: "Por qué existe el proyecto",
        paragraphs: [
          "El proyecto surgió al notar que gran parte del contenido disponible en este universo todavía gira en torno a opinión, ruido y promesas frágiles.",
          "prevIA fue creado para seguir otro camino: organizar información, estructurar análisis y ofrecer al usuario una forma más clara de interpretar partidos y mercados.",
        ],
      },
      {
        title: "Qué buscamos entregar",
        paragraphs: [
          "Nuestro alcance consiste en transformar datos deportivos en contexto útil. Eso incluye lectura de partidos, interpretación de probabilidades, comparación con cuotas de mercado y construcción de una experiencia que ayude al usuario a analizar mejor, ya sea principiante, intermedio o avanzado.",
          "Más que entregar respuestas listas, la propuesta del producto es apoyar decisiones con más claridad, profundidad y responsabilidad.",
        ],
      },
      {
        title: "Cómo pensamos la escala",
        paragraphs: [
          "Aunque nació en Brasil, prevIA fue diseñado desde la base para ser multilingüe y escalable, con una visión de largo plazo para atender usuarios en distintos idiomas y mercados.",
          "Seguimos construyendo el proyecto de forma continua, evolucionando con datos, validación práctica y feedback de usuarios reales.",
        ],
      },
    ],
    highlight: {
      title: "Nuestra visión",
      body:
        "prevIA no existe para prometer resultados irreales, sino para ofrecer una base más inteligente y más transparente para quien se toma el análisis en serio. Nuestra visión es desarrollar una plataforma de referencia en inteligencia aplicada a las apuestas deportivas, uniendo tecnología, análisis y experiencia de uso en un producto sólido y global.",
    },
  },
};

export function getAboutCopy(lang: Lang) {
  return ABOUT_COPY[lang] ?? ABOUT_COPY.pt;
}