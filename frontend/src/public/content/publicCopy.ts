import type { Lang } from "../../i18n";

type PublicCopy = {
  nav: {
    home: string;
    howItWorks: string;
    glossary: string;
    about: string;
    language: string;
  };
  footer: {
    copyrightLabel: string;
  };
  home: {
    hero: {
      eyebrow: string;
      title: string;
      body: string;
      primaryCta: string;
      secondaryCta: string;
      sideKicker: string;
      sideTitle: string;
      sideBody: string;
      sidePoints: string[];
    };
    trustBar: string[];
    audience: {
      eyebrow: string;
      title: string;
      body: string;
      items: Array<{
        title: string;
        body: string;
      }>;
    };
    preview: {
      eyebrow: string;
      title: string;
      body: string;
      items: Array<{
        title: string;
        body: string;
        badge: string;
      }>;
    };
    howItWorks: {
      eyebrow: string;
      title: string;
      body: string;
      steps: Array<{
        step: string;
        title: string;
        body: string;
      }>;
    };
    finalCta: {
      eyebrow: string;
      title: string;
      body: string;
      primaryCta: string;
      secondaryCta: string;
    };
  };
  glossary: {
    title: string;
    body: string;
    boxTitle: string;
    boxBody: string;
  };
};

export const PUBLIC_COPY: Record<Lang, PublicCopy> = {
  pt: {
    nav: {
      home: "Home",
      howItWorks: "Como funciona",
      glossary: "Glossário",
      about: "Sobre",
      language: "Idioma",
    },
    footer: {
      copyrightLabel: "© {year} prevIA",
    },
    home: {
      hero: {
        eyebrow: "Beta público em preparação",
        title: "Menos ruído. Mais leitura de preço, valor e risco.",
        body: "O prevIA foi desenhado para transformar dados, probabilidade e mercado em leitura prática para quem aposta com mais critério.",
        primaryCta: "Explorar glossário",
        secondaryCta: "Entrar na lista beta",
        sideKicker: "Primeira onda de convites",
        sideTitle: "Beta gratuito previsto para os próximos 30 dias.",
        sideBody: "Quem entrar agora fica no grupo inicial de acesso antecipado e pode receber condição exclusiva no lançamento, caso queira assinar no futuro.",
        sidePoints: [
          "Beta 100% gratuito",
          "Primeiros convites em até 30 dias",
          "Grupo inicial com condição exclusiva",
        ],
      },
      trustBar: [
        "Odds, probabilidade e value",
        "Leitura clara em pt, en e es",
        "Base pública pronta para aquisição",
      ],
      audience: {
        eyebrow: "Para quem é",
        title: "Feito para perfis diferentes, com a mesma base analítica.",
        body: "A ideia não é vender palpite solto. É organizar leitura de mercado para perfis com níveis diferentes de profundidade.",
        items: [
          {
            title: "Apostador recreativo",
            body: "Quer entender melhor odds, valor e risco sem depender só de feeling ou de conteúdo superficial.",
          },
          {
            title: "Apostador frequente",
            body: "Já compara linhas e quer uma leitura mais consistente de preço, contexto e oportunidade.",
          },
          {
            title: "Tipster ou criador de conteúdo",
            body: "Precisa de uma camada mais técnica para apoiar análise, comunicação e rotina operacional.",
          },
        ],
      },
      preview: {
        eyebrow: "O que você vai encontrar",
        title: "Uma plataforma desenhada para transformar análise em leitura prática.",
        body: "As primeiras telas do prevIA vão destacar visão geral do dia, leitura de preço e probabilidade, além de uma camada mais profunda para comparação e contexto.",
        items: [
          {
            title: "Painel principal",
            body: "Visão geral do produto com navegação clara, filtros e acesso rápido aos pontos mais importantes do dia.",
            badge: "Visão geral do produto",
          },
          {
            title: "Leitura de mercado",
            body: "Tela focada em odds, probabilidade, valor e contexto para ajudar a interpretar melhor cada entrada.",
            badge: "Preço, valor e contexto",
          },
          {
            title: "Profundidade analítica",
            body: "Área pensada para comparações, leitura mais técnica e apoio a decisões com mais critério.",
            badge: "Camada analítica do app",
          },
        ],
      },
      howItWorks: {
        eyebrow: "Como funciona",
        title: "A jornada pública já nasce simples, útil e preparada para conversão.",
        body: "Sem excesso de explicação: conteúdo para entender o produto, captar interesse e preparar a entrada no app.",
        steps: [
          {
            step: "01",
            title: "Entenda os conceitos",
            body: "Use o glossário para navegar por odds, mercados, valor e gestão de banca.",
          },
          {
            step: "02",
            title: "Veja se o prevIA é para você",
            body: "A landing filtra melhor o público e explica a proposta com mais rapidez.",
          },
          {
            step: "03",
            title: "Entre na lista beta",
            body: "O cadastro é gratuito e os primeiros convites estão previstos para os próximos 30 dias.",
          },
        ],
      },
      finalCta: {
        eyebrow: "Próximo passo",
        title: "Entre agora na lista beta do prevIA.",
        body: "Você não paga nada para participar do beta. Ao entrar cedo, fica na primeira onda de convites e pode receber condição exclusiva no lançamento, se decidir assinar depois.",
        primaryCta: "Entrar na lista beta",
        secondaryCta: "Ir para o glossário",
      },
    },
    glossary: {
      title: "Glossário",
      body: "Hub multilíngue do universo de bets, odds, mercados, probabilidade e gestão de banca.",
      boxTitle: "Base pronta para expansão",
      boxBody: "Nesta etapa estamos criando a fundação da rota, layout e estrutura pública. Os termos e categorias entram na próxima fase.",
    },
  },

  en: {
    nav: {
      home: "Home",
      howItWorks: "How it works",
      glossary: "Glossary",
      about: "About",
      language: "Language",
    },
    footer: {
      copyrightLabel: "© {year} prevIA",
    },
    home: {
      hero: {
        eyebrow: "Public beta in preparation",
        title: "Less noise. More price, value, and risk reading.",
        body: "prevIA is built to turn data, probability, and market context into practical reading for bettors who want more discipline.",
        primaryCta: "Explore glossary",
        secondaryCta: "Join beta list",
        sideKicker: "First invitation wave",
        sideTitle: "Free beta planned for the next 30 days.",
        sideBody: "Users who join now enter the early-access group and may receive an exclusive launch condition if they choose to subscribe later.",
        sidePoints: [
          "100% free beta",
          "First invites within 30 days",
          "Early group with launch perk",
        ],
      },
      trustBar: [
        "Odds, probability, and value",
        "Clear reading in pt, en, and es",
        "Public layer ready for acquisition",
      ],
      audience: {
        eyebrow: "Who it is for",
        title: "Built for different profiles on top of the same analytical base.",
        body: "The goal is not random picks. It is structured market reading for users with different levels of depth.",
        items: [
          {
            title: "Recreational bettor",
            body: "Wants to understand odds, value, and risk with more clarity instead of relying only on instinct.",
          },
          {
            title: "Frequent bettor",
            body: "Already compares lines and wants a more consistent view of price, context, and opportunity.",
          },
          {
            title: "Tipster or content creator",
            body: "Needs a more technical layer to support analysis, communication, and workflow.",
          },
        ],
      },
      preview: {
        eyebrow: "What you will find",
        title: "A platform designed to turn analysis into practical reading.",
        body: "The first prevIA screens will highlight the daily overview, price and probability reading, and a deeper layer for comparison and context.",
        items: [
          {
            title: "Main dashboard",
            body: "A clear product overview with simple navigation, filters, and fast access to the day’s most relevant points.",
            badge: "Product overview",
          },
          {
            title: "Market reading",
            body: "A screen focused on odds, probability, value, and context to help interpret each spot more clearly.",
            badge: "Price, value, and context",
          },
          {
            title: "Analytical depth",
            body: "An area designed for comparisons, more technical reading, and more disciplined decision support.",
            badge: "Analytical layer",
          },
        ],
      },
      howItWorks: {
        eyebrow: "How it works",
        title: "The public journey starts simple, useful, and ready to convert.",
        body: "No long wall of text: just enough structure to explain the product, qualify interest, and prepare app entry.",
        steps: [
          {
            step: "01",
            title: "Learn the concepts",
            body: "Use the glossary to navigate odds, markets, value, and bankroll management.",
          },
          {
            step: "02",
            title: "See whether prevIA fits you",
            body: "The landing clarifies the offer and filters the audience more effectively.",
          },
          {
            step: "03",
            title: "Join the beta list",
            body: "Joining is free and the first invitation wave is planned for the next 30 days.",
          },
        ],
      },
      finalCta: {
        eyebrow: "Next step",
        title: "Join the prevIA beta list now.",
        body: "You pay nothing to take part in the beta. By joining early, you enter the first invitation wave and may receive an exclusive launch condition if you decide to subscribe later.",
        primaryCta: "Join beta list",
        secondaryCta: "Go to glossary",
      },
    },
    glossary: {
      title: "Glossary",
      body: "Multilingual hub for betting, odds, markets, probability, and bankroll management concepts.",
      boxTitle: "Foundation ready to scale",
      boxBody: "At this stage we are creating the route, layout, and public structure. Terms and categories come next.",
    },
  },

  es: {
    nav: {
      home: "Inicio",
      howItWorks: "Cómo funciona",
      glossary: "Glosario",
      about: "Sobre", 
      language: "Idioma",
    },
    footer: {
      copyrightLabel: "© {year} prevIA",
    },
    home: {
      hero: {
        eyebrow: "Beta pública en preparación",
        title: "Menos ruido. Más lectura de precio, valor y riesgo.",
        body: "prevIA está diseñado para convertir datos, probabilidad y contexto de mercado en lectura práctica para quien apuesta con más criterio.",
        primaryCta: "Explorar glosario",
        secondaryCta: "Entrar en la lista beta",
        sideKicker: "Primera ola de invitaciones",
        sideTitle: "Beta gratuita prevista para los próximos 30 días.",
        sideBody: "Quien se una ahora entra en el grupo inicial de acceso anticipado y puede recibir una condición exclusiva de lanzamiento si decide suscribirse después.",
        sidePoints: [
          "Beta 100% gratuita",
          "Primeras invitaciones en 30 días",
          "Grupo inicial con ventaja exclusiva",
        ],
      },
      trustBar: [
        "Cuotas, probabilidad y value",
        "Lectura clara en pt, en y es",
        "Capa pública lista para adquisición",
      ],
      audience: {
        eyebrow: "Para quién es",
        title: "Hecho para perfiles distintos sobre la misma base analítica.",
        body: "La idea no es vender picks sueltos. Es organizar lectura de mercado para usuarios con distintos niveles de profundidad.",
        items: [
          {
            title: "Apostador recreativo",
            body: "Quiere entender mejor cuotas, value y riesgo sin depender solo de intuición o contenido superficial.",
          },
          {
            title: "Apostador frecuente",
            body: "Ya compara líneas y quiere una lectura más consistente de precio, contexto y oportunidad.",
          },
          {
            title: "Tipster o creador de contenido",
            body: "Necesita una capa más técnica para apoyar análisis, comunicación y rutina operativa.",
          },
        ],
      },
      preview: {
        eyebrow: "Qué vas a encontrar",
        title: "Una plataforma pensada para convertir análisis en lectura práctica.",
        body: "Las primeras pantallas de prevIA mostrarán una visión general del día, lectura de precio y probabilidad, y una capa más profunda para comparación y contexto.",
        items: [
          {
            title: "Panel principal",
            body: "Vista general del producto con navegación clara, filtros y acceso rápido a los puntos más relevantes del día.",
            badge: "Visión general del producto",
          },
          {
            title: "Lectura de mercado",
            body: "Pantalla centrada en cuotas, probabilidad, value y contexto para interpretar mejor cada entrada.",
            badge: "Precio, value y contexto",
          },
          {
            title: "Profundidad analítica",
            body: "Área pensada para comparaciones, lectura más técnica y apoyo a decisiones con más criterio.",
            badge: "Capa analítica del producto",
          },
        ],
      },
      howItWorks: {
        eyebrow: "Cómo funciona",
        title: "La jornada pública ya nace simple, útil y preparada para convertir.",
        body: "Sin exceso de explicación: solo la estructura necesaria para explicar el producto, captar interés y preparar la entrada a la app.",
        steps: [
          {
            step: "01",
            title: "Entiende los conceptos",
            body: "Usa el glosario para navegar por cuotas, mercados, value y gestión de banca.",
          },
          {
            step: "02",
            title: "Mira si prevIA encaja contigo",
            body: "La landing aclara mejor la propuesta y filtra mejor la audiencia.",
          },
          {
            step: "03",
            title: "Entra en la lista beta",
            body: "La entrada es gratuita y la primera ola de invitaciones está prevista para los próximos 30 días.",
          },
        ],
      },
      finalCta: {
        eyebrow: "Siguiente paso",
        title: "Entra ahora en la lista beta de prevIA.",
        body: "No pagas nada por participar en la beta. Al entrar temprano, quedas en la primera ola de invitaciones y puedes recibir una condición exclusiva de lanzamiento si decides suscribirte después.",
        primaryCta: "Entrar en la lista beta",
        secondaryCta: "Ir al glosario",
      },
    },
    glossary: {
      title: "Glosario",
      body: "Hub multilingüe sobre apuestas, cuotas, mercados, probabilidad y gestión de banca.",
      boxTitle: "Base lista para crecer",
      boxBody: "En esta etapa estamos creando la base de la ruta, el layout y la estructura pública. Los términos y categorías llegan después.",
    },
  },
};

export function publicCopy(lang: Lang) {
  return PUBLIC_COPY[lang] ?? PUBLIC_COPY.pt;
}

export function withYear(template: string, year: number) {
  return template.replace("{year}", String(year));
}