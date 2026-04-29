import type { Lang } from "../../i18n";

type PublicLeagueCoverageGroupKey =
  | "southAmerica"
  | "northAmerica"
  | "europe"
  | "asiaOceania"
  | "africa"
  | "international"
  | "other";

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
    leagueCoverage: {
      kicker: string;
      countLabel: string;
      summary: string;
      button: string;
      modalTitle: string;
      modalBody: string;
      modalCloseLabel: string;
      loading: string;
      error: string;
      empty: string;
      groupLabels: Record<PublicLeagueCoverageGroupKey, string>;
    };
    audience: {
      eyebrow: string;
      title: string;
      body: string;
      forTitle: string;
      notForTitle: string;
      noteTitle: string;
      noteBody: string;
      items: Array<{
        title: string;
        body: string;
        badge: string;
      }>;
      cautionItems: string[];
    };
    freeAnonEmbed: {
      eyebrow: string;
      title: string;
      body: string;
    };
    plans: {
      eyebrow: string;
      title: string;
      body: string;
      selectedLabel: string;
      recommendedLabel: string;
      items: Array<{
        planId: string;
        badge: string;
        title: string;
        body: string;
        bullets: string[];
        cta: string;
        recommended?: boolean;
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
      cta: string;
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
      points: string[];
      note: string;
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
        eyebrow: "Teste grátis disponível",
        title: "Compare odds, entenda preço justo e encontre valor com mais clareza.",
        body: "O prevIA organiza odds, probabilidade e contexto em uma leitura prática para quem quer apostar com mais critério desde o primeiro clique.",
        primaryCta: "Testar grátis agora",
        secondaryCta: "Como funciona",
        sideKicker: "Comece em segundos",
        sideTitle: "Teste real na própria landing",
        sideBody: "Veja jogos, abra análises e entenda melhor preço, valor e contexto antes de decidir se quer avançar com conta e planos.",
        sidePoints: [
          "Sem login para o primeiro uso",
          "3 consultas grátis por dia",
          "Crie conta grátis se quiser aprofundar",
        ],
      },
      trustBar: [
        "Odds, probabilidade e preço justo",
        "Sem login para começar",
        "Leitura clara em pt, en e es",
      ],

      leagueCoverage: {
        kicker: "Cobertura",
        countLabel: "{count} ligas disponíveis",
        summary: "Brasileirão, Premier League, La Liga, Champions League, Libertadores e muito mais.",
        button: "Ver todas as ligas",
        modalTitle: "Competições cobertas pelo prevIA",
        modalBody:
          "Hoje o prevIA acompanha ligas nacionais, copas continentais e competições internacionais, com expansão contínua da cobertura.",
        modalCloseLabel: "Fechar lista de ligas",
        loading: "Carregando ligas disponíveis...",
        error: "Não foi possível carregar a lista agora. Tente novamente em instantes.",
        empty: "Nenhuma liga disponível foi encontrada no momento.",
        groupLabels: {
          southAmerica: "América do Sul",
          northAmerica: "América do Norte",
          europe: "Europa",
          asiaOceania: "Ásia/Oceania",
          africa: "África",
          international: "Internacional",
          other: "Outras regiões",
        },
      },
      audience: {
        eyebrow: "Para quem é",
        title: "Mais clareza para o público certo.",
        body: "",
        forTitle: "Faz sentido para quem",
        notForTitle: "Pode não fazer sentido se você",
        noteTitle: "O ponto central",
        noteBody: "A proposta não é vender palpite mágico. É organizar odds, probabilidade e contexto em uma leitura mais clara, progressiva e útil.",
        items: [
          {
            title: "Quer apostar com mais critério",
            body: "Busca entender melhor preço, valor e risco em vez de depender só de feeling ou ruído.",
            badge: "Mais critério",
          },
          {
            title: "Já compara odds e contexto",
            body: "Quer uma leitura mais consistente do mercado e uma base melhor para decidir com calma.",
            badge: "Leitura prática",
          },
          {
            title: "Precisa de profundidade progressiva",
            body: "Quer começar simples, testar grátis e aprofundar só quando perceber valor real no produto.",
            badge: "Jornada clara",
          },
        ],
        cautionItems: [
          "procura promessa de lucro fácil",
          "quer tip pronto sem contexto",
          "não tem interesse em comparar preço, probabilidade e mercado",
        ],
      },
      freeAnonEmbed: {
        eyebrow: "Teste grátis",
        title: "Faça 3 consultas grátis por dia",
        body: "Veja jogos, compare odds e entenda a leitura do mercado. Use hoje e volte amanhã para mais 3 consultas grátis.",
      },
      plans: {
        eyebrow: "Planos e benefícios",
        title: "Escolha a profundidade certa para o seu momento.",
        body: "Comece no grátis, compare os níveis e avance quando fizer sentido para o seu uso.",
        selectedLabel: "Em destaque",
        recommendedLabel: "Recomendado",
        items: [
          {
            badge: "Sem login",
            title: "Free",
            body: "Entrada rápida para conhecer o produto direto na landing.",
            bullets: [
              "Teste imediato sem cadastro",
              "Ideal para primeiro contato",
              "Perfeito para sentir a proposta",
            ],
            cta: "Testar grátis",
          },
          {
            planId: "FREE",
            badge: "Entrada grátis",
            title: "Free",
            body: "Comece sem login e continue grátis com conta quando os créditos acabarem.",
            bullets: [
              "até 5 créditos",
              "teste direto na landing",
              "continue grátis com conta",
            ],
            cta: "Começar grátis",
          },
          {
            planId: "BASIC",
            badge: "Uso leve",
            title: "Basic",
            body: "Camada paga de entrada para quem quer consistência sem complexidade.",
            bullets: [
              "Mais consultas no dia a dia",
              "Menos interrupção entre análises",
              "Bom começo para uso recorrente",
            ],
            cta: "Assinar agora",
          },
          {
            planId: "LIGHT",
            badge: "Mais completo",
            title: "Light",
            body: "Melhor equilíbrio entre volume, contexto e profundidade para uso real.",
            bullets: [
              "Mais folga para acompanhar jogos",
              "Fair odds, edge e mais contexto",
              "Camada mais equilibrada da jornada",
            ],
            cta: "Assinar agora",
            recommended: true,
          },
          {
            planId: "PRO",
            badge: "Máxima profundidade",
            title: "Pro",
            body: "Para quem quer rotina intensa, leitura mais técnica e maior volume.",
            bullets: [
              "Pensado para uso avançado",
              "Mais profundidade analítica",
              "Camada mais completa do produto",
            ],
            cta: "Assinar agora",
          },
        ],
      },
      preview: {
        eyebrow: "Veja o produto",
        title: "Uma leitura mais visual, prática e progressiva.",
        body: "Uma visão rápida do produto entre leitura geral, contexto de mercado e profundidade analítica.",
        items: [
          {
            title: "Visão geral para começar rápido",
            body: "Acompanhe os jogos, identifique o que importa e entre na leitura sem fricção.",
            badge: "Visão geral",
          },
          {
            title: "Mercado com mais contexto",
            body: "Odds, sinais e leitura prática aparecem de forma mais organizada e útil.",
            badge: "Mercado",
          },
          {
            title: "Profundidade quando fizer sentido",
            body: "A camada analítica cresce conforme o usuário quer mais contexto e critério.",
            badge: "Profundidade",
          },
        ],
      },
      howItWorks: {
        eyebrow: "Como funciona",
        title: "O básico para entender rápido — o detalhe fica na página completa.",
        body: "Entenda a proposta, teste sem fricção e aprofunde quando quiser.",
        cta: "Ver página completa",
        steps: [
          {
            step: "01",
            title: "Entenda a proposta",
            body: "Veja como odds, probabilidade e contexto entram na leitura do produto.",
          },
          {
            step: "02",
            title: "Veja se o prevIA faz sentido para você",
            body: "Entenda rapidamente a proposta, o tipo de leitura que o produto oferece e se vale a pena continuar.",
          },
          {
            step: "03",
            title: "Aprofunde quando quiser",
            body: "Se quiser mais detalhes, a página dedicada explica melhor a estrutura do prevIA.",
          },
        ],
      },
      finalCta: {
        eyebrow: "Comece agora",
        title: "Teste grátis agora ou entre direto no app.",
        body: "O prevIA já está pronto para levar o usuário do primeiro contato até o uso real, com entrada simples e progressão clara.",
        primaryCta: "Ir para o app",
        secondaryCta: "Ver teste grátis",
        points: [
          "teste grátis na própria landing",
          "criação de conta grátis",
          "profundidade crescente conforme o uso",
        ],
        note: "Sem cartão para começar.",
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
        eyebrow: "Free trial available",
        title: "Compare odds, understand fair price, and spot value more clearly.",
        body: "prevIA turns odds, probability, and context into practical reading for people who want a more disciplined betting routine from the first click.",
        primaryCta: "Try it free now",
        secondaryCta: "How it works",
        sideKicker: "Start in seconds",
        sideTitle: "Real product test on the landing page",
        sideBody: "Browse matches, open analyses, and understand price, value, and context before deciding whether you want to continue with an account and plans.",
        sidePoints: [
          "No login required for the first use",
          "3 free checks per day",
          "Create a free account if you want more depth",
        ],
      },
      trustBar: [
        "Odds, probability, and fair price",
        "No login to get started",
        "Clear reading in pt, en, and es",
      ],
      leagueCoverage: {
        kicker: "Coverage",
        countLabel: "{count} available leagues",
        summary: "Brasileirão, Premier League, La Liga, Champions League, Libertadores, and much more.",
        button: "See all leagues",
        modalTitle: "Competitions covered by prevIA",
        modalBody:
          "prevIA currently covers domestic leagues, continental cups, and international competitions, with coverage expanding over time.",
        modalCloseLabel: "Close league list",
        loading: "Loading available leagues...",
        error: "We could not load the list right now. Please try again shortly.",
        empty: "No available leagues were found at the moment.",
        groupLabels: {
          southAmerica: "South America",
          northAmerica: "North America",
          europe: "Europe",
          asiaOceania: "Asia/Oceania",
          africa: "Africa",
          international: "International",
          other: "Other regions",
        },
      },
      audience: {
        eyebrow: "Who it is for",
        title: "More clarity for the right audience.",
        body: "",
        forTitle: "Makes sense for people who",
        notForTitle: "May not be a fit if you",
        noteTitle: "Core idea",
        noteBody: "The goal is not magical picks. It is to organize odds, probability, and context into a clearer, more practical, and progressive reading.",
        items: [
          {
            title: "Want more discipline in betting",
            body: "They want to understand price, value, and risk better instead of relying only on instinct or noise.",
            badge: "More discipline",
          },
          {
            title: "Already compare odds and context",
            body: "They want a more consistent market reading and a stronger base for making decisions.",
            badge: "Practical reading",
          },
          {
            title: "Need progressive depth",
            body: "They want to start simple, test for free, and go deeper only when they see real value.",
            badge: "Clear journey",
          },
        ],
        cautionItems: [
          "are looking for easy-profit promises",
          "only want ready-made picks without context",
          "have no interest in comparing price, probability, and market signals",
        ],
      },
      freeAnonEmbed: {
        eyebrow: "Free trial",
        title: "Get 3 free checks per day",
        body: "Browse matches, compare odds, and understand the market reading. Use it today and come back tomorrow for 3 more free checks.",
      },
      plans: {
        eyebrow: "Plans and benefits",
        title: "Pick the level of depth that matches your stage.",
        body: "Start free, compare the tiers, and move up when it makes sense for your usage.",
        selectedLabel: "Highlighted",
        recommendedLabel: "Recommended",
        items: [
          {
            planId: "FREE",
            badge: "Free entry",
            title: "Free",
            body: "Start without login and continue for free with an account when credits run out.",
            bullets: [
              "up to 5 credits",
              "test directly on the landing page",
              "continue for free with an account",
            ],
            cta: "Start free",
          },
          {
            planId: "FREE",
            badge: "With login",
            title: "Free+",
            body: "Free account for users who want continuity after the first trial.",
            bullets: [
              "More continuity than anonymous trial",
              "Account-based experience",
              "Natural next step after testing",
            ],
            cta: "Create free account",
          },
          {
            planId: "BASIC",
            badge: "Light use",
            title: "Basic",
            body: "Entry paid tier for users who want consistency without going too deep yet.",
            bullets: [
              "More daily room for analysis",
              "Fewer interruptions",
              "Good starting point for recurring use",
            ],
            cta: "Subscribe now",
          },
          {
            planId: "LIGHT",
            badge: "More complete",
            title: "Light",
            body: "Best balance between volume, context, and depth for real usage.",
            bullets: [
              "More room to follow games",
              "Fair odds, edge, and more context",
              "Most balanced step in the journey",
            ],
            cta: "Subscribe now",
            recommended: true,
          },
          {
            planId: "PRO",
            badge: "Maximum depth",
            title: "Pro",
            body: "For heavier routines, more technical reading, and higher-volume usage.",
            bullets: [
              "Built for advanced usage",
              "Deeper analytical layer",
              "Most complete plan in the product",
            ],
            cta: "Subscribe now",
          },
        ],
      },
      preview: {
        eyebrow: "See the product",
        title: "A more visual, practical, and progressive reading experience.",
        body: "A quick look at the product across overview, market context, and analytical depth.",
        items: [
          {
            title: "Overview to start fast",
            body: "Follow matches, spot what matters, and enter the experience without friction.",
            badge: "Overview",
          },
          {
            title: "Market with more context",
            body: "Odds, signals, and practical reading appear in a more organized and useful way.",
            badge: "Market",
          },
          {
            title: "Depth when it makes sense",
            body: "The analytical layer grows as the user wants more context and more discipline.",
            badge: "Depth",
          },
        ],
      },
      howItWorks: {
        eyebrow: "How it works",
        title: "The basics to understand it fast — the full detail lives on the dedicated page.",
        body: "Understand the proposal, try it without friction, and go deeper when you want.",        cta: "View full page",
        steps: [
          {
            step: "01",
            title: "Understand the proposal",
            body: "See how odds, probability, and context shape the product reading.",
          },
          {
            step: "02",
            title: "Try it without friction",
            body: "Start free and quickly feel whether the experience fits you.",
          },
          {
            step: "03",
            title: "Go deeper when you want",
            body: "If you want more detail, the dedicated page explains the prevIA structure better.",
          },
        ],
      },
      finalCta: {
        eyebrow: "Start now",
        title: "Try it free now or go straight to the app.",
        body: "prevIA is already ready to take the user from first contact to real usage, with simple entry and clear progression.",
        primaryCta: "Go to app",
        secondaryCta: "See free trial",
        points: [
          "free trial on the landing page",
          "free account creation",
          "deeper usage as you progress",
        ],
        note: "No card required to get started.",
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
        eyebrow: "Prueba gratis disponible",
        title: "Compara cuotas, entiende el precio justo y detecta valor con más claridad.",
        body: "prevIA organiza cuotas, probabilidad y contexto en una lectura práctica para quien quiere apostar con más criterio desde el primer clic.",
        primaryCta: "Probar gratis ahora",
        secondaryCta: "Cómo funciona",
        sideKicker: "Empieza en segundos",
        sideTitle: "Prueba real del producto en la landing",
        sideBody: "Mira partidos, abre análisis y entiende mejor precio, valor y contexto antes de decidir si quieres avanzar con cuenta y planes.",
        sidePoints: [
          "Sin login en el primer uso",
          "3 consultas gratis por día",
          "Crea una cuenta gratis si quieres más profundidad",
        ],
      },
      trustBar: [
        "Cuotas, probabilidad y precio justo",
        "Sin login para empezar",
        "Lectura clara en pt, en y es",
      ],
      leagueCoverage: {
        kicker: "Cobertura",
        countLabel: "{count} ligas disponibles",
        summary: "Brasileirão, Premier League, La Liga, Champions League, Libertadores y mucho más.",
        button: "Ver todas las ligas",
        modalTitle: "Competiciones cubiertas por prevIA",
        modalBody:
          "Hoy prevIA cubre ligas nacionales, copas continentales y competiciones internacionales, con expansión continua de la cobertura.",
        modalCloseLabel: "Cerrar lista de ligas",
        loading: "Cargando ligas disponibles...",
        error: "No fue posible cargar la lista ahora. Inténtalo de nuevo en unos instantes.",
        empty: "No se encontraron ligas disponibles en este momento.",
        groupLabels: {
          southAmerica: "Sudamérica",
          northAmerica: "Norteamérica",
          europe: "Europa",
          asiaOceania: "Asia/Oceanía",
          africa: "África",
          international: "Internacional",
          other: "Otras regiones",
        },
      },
      audience: {
        eyebrow: "Para quién es",
        title: "Más claridad para el público correcto.",
        body: "",
        forTitle: "Tiene sentido para quien",
        notForTitle: "Puede no tener sentido si",
        noteTitle: "La idea central",
        noteBody: "La propuesta no es vender picks mágicos. Es organizar cuotas, probabilidad y contexto en una lectura más clara, progresiva y útil.",
        items: [
          {
            title: "Quiere apostar con más criterio",
            body: "Busca entender mejor precio, valor y riesgo en lugar de depender solo del instinto o del ruido.",
            badge: "Más criterio",
          },
          {
            title: "Ya compara cuotas y contexto",
            body: "Quiere una lectura más consistente del mercado y una mejor base para decidir.",
            badge: "Lectura práctica",
          },
          {
            title: "Necesita profundidad progresiva",
            body: "Quiere empezar simple, probar gratis y profundizar solo cuando vea valor real.",
            badge: "Recorrido claro",
          },
        ],
        cautionItems: [
          "buscas promesas de ganancia fácil",
          "quieres picks listos sin contexto",
          "no tienes interés en comparar precio, probabilidad y mercado",
        ],
      },
      freeAnonEmbed: {
        eyebrow: "Prueba gratis",
        title: "Haz 3 consultas gratis por día",
        body: "Mira partidos, compara cuotas y entiende la lectura del mercado. Úsalo hoy y vuelve mañana para 3 consultas gratis más.",
      },
      plans: {
        eyebrow: "Planes y beneficios",
        title: "Elige la profundidad adecuada para tu momento.",
        body: "Empieza gratis, compara los niveles y avanza cuando tenga sentido para tu uso.",
        selectedLabel: "Destacado",
        recommendedLabel: "Recomendado",
        items: [
          {
            planId: "FREE",
            badge: "Entrada gratis",
            title: "Free",
            body: "Empieza sin login y continúa gratis con cuenta cuando se terminen los créditos.",
            bullets: [
              "hasta 5 créditos",
              "prueba directa en la landing",
              "continúa gratis con cuenta",
            ],
            cta: "Empezar gratis",
          },
          {
            planId: "FREE",
            badge: "Con login",
            title: "Free+",
            body: "Cuenta gratis para seguir explorando con más continuidad.",
            bullets: [
              "Más continuidad que la prueba anónima",
              "Cuenta y continuidad de uso",
              "Paso natural después de probar",
            ],
            cta: "Crear cuenta gratis",
          },
          {
            planId: "BASIC",
            badge: "Uso ligero",
            title: "Basic",
            body: "Nivel de pago de entrada para quien quiere constancia sin demasiada complejidad.",
            bullets: [
              "Más margen diario para análisis",
              "Menos interrupciones",
              "Buen inicio para uso recurrente",
            ],
            cta: "Suscribirse ahora",
          },
          {
            planId: "LIGHT",
            badge: "Más completo",
            title: "Light",
            body: "Mejor equilibrio entre volumen, contexto y profundidad para uso real.",
            bullets: [
              "Más margen para seguir partidos",
              "Fair odds, edge y más contexto",
              "La capa más equilibrada del recorrido",
            ],
            cta: "Suscribirse ahora",
            recommended: true,
          },
          {
            planId: "PRO",
            badge: "Máxima profundidad",
            title: "Pro",
            body: "Para rutinas intensas, lectura más técnica y uso de mayor volumen.",
            bullets: [
              "Pensado para uso avanzado",
              "Más profundidad analítica",
              "La capa más completa del producto",
            ],
            cta: "Suscribirse ahora",
          },
        ],
      },
      preview: {
        eyebrow: "Mira el producto",
        title: "Una lectura más visual, práctica y progresiva.",
        body: "Una vista rápida del producto entre visión general, contexto de mercado y profundidad analítica.",
        items: [
          {
            title: "Visión general para empezar rápido",
            body: "Sigue los partidos, identifica lo importante y entra en la lectura sin fricción.",
            badge: "Visión general",
          },
          {
            title: "Mercado con más contexto",
            body: "Cuotas, señales y lectura práctica aparecen de forma más organizada y útil.",
            badge: "Mercado",
          },
          {
            title: "Profundidad cuando tenga sentido",
            body: "La capa analítica crece a medida que el usuario quiere más contexto y más criterio.",
            badge: "Profundidad",
          },
        ],
      },
      howItWorks: {
        eyebrow: "Cómo funciona",
        title: "Lo básico para entenderlo rápido — el detalle queda en la página completa.",
        body: "Entiende la propuesta, pruébalo sin fricción y profundiza cuando quieras.",
        cta: "Ver página completa",
        steps: [
          {
            step: "01",
            title: "Entiende la propuesta",
            body: "Mira cómo cuotas, probabilidad y contexto forman la lectura del producto.",
          },
          {
            step: "02",
            title: "Pruébalo sin fricción",
            body: "Empieza gratis y siente rápido si la experiencia encaja contigo.",
          },
          {
            step: "03",
            title: "Profundiza cuando quieras",
            body: "Si quieres más detalle, la página dedicada explica mejor la estructura de prevIA.",
          },
        ],
      },
      finalCta: {
        eyebrow: "Empieza ahora",
        title: "Prueba gratis ahora o entra directamente en la app.",
        body: "prevIA ya está listo para llevar al usuario desde el primer contacto hasta el uso real, con entrada simple y progresión clara.",
        primaryCta: "Ir a la app",
        secondaryCta: "Ver prueba gratis",
        points: [
          "prueba gratis en la propia landing",
          "creación de cuenta gratis",
          "más profundidad a medida que avanzas",
        ],
        note: "Sin tarjeta para empezar.",
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