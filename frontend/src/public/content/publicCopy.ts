import type { Lang } from "../../i18n";

type PublicCopy = {
  nav: {
    home: string;
    testFree: string;
    howItWorks: string;
    glossary: string;
    about: string;
    language: string;
    login: string;
    createAccount: string;
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
    freeAnonEmbed: {
      eyebrow: string;
      title: string;
      body: string;
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
      testFree: "Teste grátis",
      howItWorks: "Como funciona",
      glossary: "Glossário",
      about: "Sobre",
      language: "Idioma",
      login: "Entrar",
      createAccount: "Criar conta grátis",
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
        "Acesso simples para começar a explorar",
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
            body: "Precisa de mais clareza, consistência e contexto para apoiar análise, comunicação e rotina de trabalho.",
          },
        ],
      },
      freeAnonEmbed: {
        eyebrow: "Teste grátis",
        title: "Faça 3 consultas grátis por dia",
        body: "Veja jogos, compare odds e entenda a leitura do mercado. Use hoje e volte amanhã para mais 3 consultas grátis.",
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
            body: "Área pensada para comparações, leitura mais completa e apoio a decisões com mais critério.",
            badge: "Comparação e contexto",
          },
        ],
      },
      howItWorks: {
        eyebrow: "Como funciona",
        title: "Uma jornada simples para entender a proposta e começar com clareza.",
        body: "Sem excesso de explicação: conteúdo para conhecer o prevIA, entender a proposta e decidir se faz sentido para você.",
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
      body: "Um espaço multilíngue para entender melhor conceitos de odds, mercados, probabilidade e gestão de banca.",
      boxTitle: "Em evolução",
      boxBody: "O glossário será ampliado aos poucos com novos termos, categorias e explicações para ajudar cada vez mais na leitura do mercado.",
    },
  },

  en: {
    nav: {
      home: "Home",
      testFree: "Free trial",
      howItWorks: "How it works",
      glossary: "Glossary",
      about: "About",
      language: "Language",
      login: "Sign in",
      createAccount: "Create free account",
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
        "Simple access to start exploring",
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
            body: "Needs more clarity, consistency, and context to support analysis, communication, and workflow.",
          },
        ],
      },
      freeAnonEmbed: {
        eyebrow: "Free trial",
        title: "Get 3 free checks per day",
        body: "Browse matches, compare odds, and understand the market reading. Use it today and come back tomorrow for 3 more free checks.",
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
            body: "An area designed for comparisons, deeper reading, and more disciplined decision support.",
            badge: "Comparison and context",
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
      body: "A multilingual space to better understand odds, markets, probability, and bankroll management concepts.",
      boxTitle: "Growing over time",
      boxBody: "The glossary will expand gradually with new terms, categories, and explanations to make market reading easier and clearer.",
    },
  },

  es: {
    nav: {
      home: "Home",
      testFree: "Prueba gratis",
      howItWorks: "Cómo funciona",
      glossary: "Glosario",
      about: "Sobre",
      language: "Idioma",
      login: "Entrar",
      createAccount: "Crear cuenta gratis",
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
        "Acceso simple para empezar a explorar",
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
            body: "Necesita más claridad, consistencia y contexto para apoyar su análisis, su comunicación y su rutina de trabajo.",
          },
        ],
      },
      freeAnonEmbed: {
        eyebrow: "Prueba gratis",
        title: "Haz 3 consultas gratis por día",
        body: "Mira partidos, compara cuotas y entiende la lectura del mercado. Úsalo hoy y vuelve mañana para 3 consultas gratis más.",
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
            body: "Un espacio pensado para comparaciones, una lectura más completa y apoyo a decisiones con más criterio.",
            badge: "Comparación y contexto",
          },
        ],
      },
      howItWorks: {
        eyebrow: "Cómo funciona",
        title: "Un recorrido simple para entender la propuesta y empezar con claridad.",
        body: "Sin exceso de explicación: contenido suficiente para conocer prevIA, entender su valor y decidir si encaja contigo.",
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
      body: "Un espacio multilingüe para entender mejor conceptos de cuotas, mercados, probabilidad y gestión de banca.",
      boxTitle: "En evolución",
      boxBody: "El glosario irá creciendo poco a poco con nuevos términos, categorías y explicaciones para facilitar la lectura del mercado.",
    },
  },
};

export function publicCopy(lang: Lang) {
  return PUBLIC_COPY[lang] ?? PUBLIC_COPY.pt;
}

export function withYear(template: string, year: number) {
  return template.replace("{year}", String(year));
}