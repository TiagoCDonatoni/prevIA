import type { Lang } from "../../i18n";

type HowItWorksCopy = {
  hero: {
    eyebrow: string;
    title: string;
    body: string;
  };
  platform: {
    eyebrow: string;
    title: string;
    body: string;
    items: Array<{
      step: string;
      title: string;
      body: string;
    }>;
  };
  inputs: {
    eyebrow: string;
    title: string;
    body: string;
    items: Array<{
      title: string;
      body: string;
    }>;
  };
  models: {
    eyebrow: string;
    title: string;
    body: string;
    questions: string[];
    note: string;
  };
  userView: {
    eyebrow: string;
    title: string;
    body: string;
    items: string[];
  };
  credits: {
    eyebrow: string;
    title: string;
    body: string;
    items: string[];
  };
  plans: {
    eyebrow: string;
    title: string;
    body: string;
    items: Array<{
      title: string;
      body: string;
    }>;
  };
  routine: {
    eyebrow: string;
    title: string;
    body: string;
    items: Array<{
      step: string;
      title: string;
      body: string;
    }>;
  };
  disclaimer: {
    eyebrow: string;
    title: string;
    body: string;
    items: string[];
  };
  essence: {
    eyebrow: string;
    title: string;
    body: string;
  };
  faq: {
    eyebrow: string;
    title: string;
    body: string;
    items: Array<{
      question: string;
      answer: string;
    }>;
  };
  cta: {
    eyebrow: string;
    title: string;
    body: string;
    primaryCta: string;
    secondaryCta: string;
  };
};

const HOW_IT_WORKS_COPY: Record<Lang, HowItWorksCopy> = {
  pt: {
    hero: {
      eyebrow: "Como funciona",
      title: "Como o prevIA funciona",
      body:
        "O prevIA combina dados esportivos, estatísticas, modelos probabilísticos e leitura de mercado para transformar informação complexa em análise prática. Mais do que mostrar números soltos, a proposta é organizar contexto, probabilidades e sinais relevantes em uma experiência clara, progressiva e útil para o usuário.",
    },
    platform: {
      eyebrow: "Uma plataforma construída em camadas",
      title: "Da base de dados até a leitura aplicada",
      body:
        "O prevIA funciona a partir da integração entre dados, processamento analítico e experiência de uso.",
      items: [
        {
          step: "01",
          title: "Camada de dados",
          body:
            "Na base do sistema, o prevIA organiza dados esportivos e informações de mercado para formar uma base estruturada de análise. Essa camada reúne a matéria-prima do produto: partidas, equipes, contexto competitivo, estatísticas relevantes e sinais de odds.",
        },
        {
          step: "02",
          title: "Camada de métricas e modelos",
          body:
            "Sobre essa base, o sistema processa métricas, estimativas e modelos probabilísticos para transformar dados brutos em leituras mais úteis. O objetivo não é apenas exibir números, mas construir probabilidades, cenários e comparações que ajudem o usuário a interpretar melhor uma partida e seus mercados.",
        },
        {
          step: "03",
          title: "Camada de experiência",
          body:
            "Por fim, essa inteligência é apresentada em uma experiência pensada para consumo prático. O usuário não precisa navegar por dados desconexos: o prevIA organiza a informação em camadas de leitura, profundidade e contexto, tornando a análise mais acessível e mais objetiva.",
        },
      ],
    },
    inputs: {
      eyebrow: "O que entra nas análises",
      title: "Uma leitura construída por múltiplos sinais",
      body:
        "As análises do prevIA não dependem de um único indicador. Elas combinam diferentes dimensões para construir uma leitura mais completa.",
      items: [
        {
          title: "Estatísticas e contexto esportivo",
          body:
            "O sistema considera diferentes sinais ligados ao desempenho das equipes e ao contexto da partida, como comportamento recente, consistência, força relativa e dinâmica competitiva.",
        },
        {
          title: "Modelagem probabilística",
          body:
            "Os modelos ajudam a converter dados e contexto em estimativas estruturadas, incluindo probabilidades e distribuição de cenários possíveis.",
        },
        {
          title: "Mercado e odds",
          body:
            "Além da leitura esportiva, o produto considera a dimensão de mercado, permitindo comparar probabilidades internas com preços observados nas odds.",
        },
        {
          title: "Interpretação aplicada",
          body:
            "A proposta final não é entregar apenas informação técnica, mas organizar essa informação em uma leitura mais útil para quem quer analisar melhor.",
        },
      ],
    },
    models: {
      eyebrow: "Como os modelos ajudam",
      title: "Do dado isolado para a estimativa estruturada",
      body:
        "Os modelos do prevIA existem para transformar dados em estimativas mais estruturadas. Em vez de depender apenas de histórico bruto, o sistema trabalha para converter sinais relevantes em probabilidades, cenários e comparações mais úteis para a análise do usuário.",
      questions: [
        "qual a leitura probabilística de uma partida",
        "como determinados mercados se posicionam diante dessa leitura",
        "onde pode existir diferença entre contexto analítico e preço de mercado",
      ],
      note:
        "Importante: modelos não são garantias de resultado. Eles são ferramentas de apoio à análise, criadas para reduzir ruído, organizar informação e melhorar a tomada de decisão.",
    },
    userView: {
      eyebrow: "O que o usuário vê na prática",
      title: "Uma experiência progressiva de leitura",
      body:
        "Na prática, o usuário acessa uma camada aplicada da inteligência do sistema. Dependendo do plano e da profundidade liberada, a experiência pode incluir:",
      items: [
        "visão geral da partida",
        "leitura analítica do confronto",
        "probabilidades estimadas",
        "interpretação de mercados",
        "comparação com odds",
        "sinais adicionais de contexto",
        "diferentes níveis de detalhamento",
      ],
    },
    credits: {
      eyebrow: "Como funciona o sistema de créditos",
      title: "Profundidade organizada por uso",
      body:
        "O sistema de créditos organiza o consumo de análises mais profundas dentro da plataforma. Em vez de liberar toda a profundidade de forma indistinta, o prevIA distribui o acesso de acordo com o plano, o tipo de uso e o nível de detalhe solicitado.",
      items: [
        "organizar diferentes níveis de consumo",
        "manter previsibilidade de uso",
        "permitir acesso mais leve para quem quer consultas pontuais",
        "suportar uma experiência mais profunda para quem precisa de recorrência e maior detalhamento",
      ],
    },
    plans: {
      eyebrow: "Como os planos se diferenciam",
      title: "A diferença principal está na profundidade",
      body:
        "Os planos do prevIA não se diferenciam apenas por quantidade de uso, mas principalmente por profundidade de acesso. Além da profundidade, eles também podem variar em escopo, horizonte temporal e volume de uso.",
      items: [
        {
          title: "Free",
          body:
            "Uma camada mais introdutória e exploratória, pensada para permitir contato inicial com a proposta do produto.",
        },
        {
          title: "Basic",
          body:
            "Acesso a uma leitura prática mais consistente, com profundidade maior do que a camada gratuita.",
        },
        {
          title: "Light",
          body:
            "Mais profundidade analítica, mais contexto, comparações adicionais e acesso mais amplo a recursos do produto.",
        },
        {
          title: "Pro",
          body:
            "A camada mais completa da plataforma, com visão mais detalhada, recursos mais avançados e maior profundidade de análise.",
        },
      ],
    },
    routine: {
      eyebrow: "Como usar no dia a dia",
      title: "Um fluxo simples para leitura e aprofundamento",
      body:
        "O fluxo de uso foi pensado para ser simples, direto e progressivo.",
      items: [
        {
          step: "01",
          title: "Escolha a partida ou contexto desejado",
          body:
            "O usuário parte do jogo, mercado ou cenário que quer entender melhor.",
        },
        {
          step: "02",
          title: "Acesse a leitura inicial",
          body:
            "A plataforma apresenta uma camada inicial de análise para contextualizar a partida.",
        },
        {
          step: "03",
          title: "Aprofunde quando fizer sentido",
          body:
            "Se quiser ir além da visão básica, o usuário pode avançar para camadas mais profundas, com mais comparações, probabilidades e sinais analíticos.",
        },
        {
          step: "04",
          title: "Use a informação no seu próprio processo",
          body:
            "O prevIA não substitui julgamento individual. Ele funciona como ferramenta de apoio para quem quer analisar com mais clareza, estrutura e método.",
        },
      ],
    },
    disclaimer: {
      eyebrow: "O que o prevIA não promete",
      title: "Mais clareza, não promessa de certeza",
      body:
        "O prevIA não foi criado para prometer lucro, eliminar risco ou substituir responsabilidade individual. A proposta do produto é apoiar análise com mais contexto, organização e profundidade — não vender certeza.",
      items: [
        "o produto não garante resultados",
        "o produto não elimina variância",
        "o produto não substitui gestão de banca",
        "o produto não existe para empurrar palpites como se fossem certezas",
      ],
    },
    essence: {
      eyebrow: "Em essência",
      title: "Uma ponte entre dados complexos e análise prática",
      body:
        "O prevIA funciona como uma ponte entre dados complexos e análise prática. Ele reúne estatísticas, modelos, probabilidades e leitura de mercado em uma experiência progressiva, pensada para ajudar o usuário a entender melhor o jogo, o contexto e os preços do mercado. Mais do que respostas prontas, a proposta é oferecer inteligência aplicada com mais método e menos ruído.",
    },
    faq: {
      eyebrow: "FAQ",
      title: "Perguntas frequentes",
      body:
        "No final da jornada, a FAQ entra como uma camada de reforço: clara, organizada e fácil de expandir conforme a landing crescer.",
      items: [
        {
          question: "De onde vêm as análises do prevIA?",
          answer:
            "As análises são construídas a partir de uma base de dados estruturados, métricas, processamento analítico e leitura de mercado organizada em camadas de interpretação.",
        },
        {
          question: "O prevIA usa modelos probabilísticos?",
          answer:
            "Sim. O produto utiliza modelagem para transformar dados e contexto em estimativas estruturadas, probabilidades e cenários comparáveis.",
        },
        {
          question: "O prevIA mostra apenas estatísticas?",
          answer:
            "Não. Estatísticas são parte da base, mas o objetivo da plataforma é transformar dados em leitura prática, com mais contexto e interpretação.",
        },
        {
          question: "O que significa comparar probabilidade com odds?",
          answer:
            "Significa observar a diferença entre a leitura analítica interna do sistema e o preço praticado no mercado, ajudando o usuário a enxergar melhor o posicionamento de cada cenário.",
        },
        {
          question: "Como funcionam os créditos?",
          answer:
            "Os créditos organizam o acesso a análises mais profundas dentro da plataforma, permitindo diferentes níveis de uso conforme o plano e o tipo de consulta.",
        },
        {
          question: "O que muda entre os planos?",
          answer:
            "Os planos variam em profundidade, escopo de acesso, volume de uso e nível de detalhamento disponível ao usuário.",
        },
        {
          question: "O prevIA garante resultado?",
          answer:
            "Não. O prevIA é uma ferramenta de apoio à análise. Ele não garante resultado, não elimina risco e não substitui disciplina ou gestão de banca.",
        },
      ],
    },
    cta: {
      eyebrow: "Próximo passo",
      title: "Entenda melhor. Analise com mais contexto.",
      body:
        "Explore o prevIA e veja como dados, probabilidades e leitura de mercado podem ser organizados em uma experiência mais clara e mais útil.",
      primaryCta: "Conhecer a plataforma",
      secondaryCta: "Ver glossário",
    },
  },

  en: {
    hero: {
      eyebrow: "How it works",
      title: "How prevIA works",
      body:
        "prevIA combines sports data, statistics, probabilistic models, and market reading to turn complex information into practical analysis. More than showing isolated numbers, the goal is to organize context, probabilities, and relevant signals into a clear, progressive, and useful experience.",
    },
    platform: {
      eyebrow: "A platform built in layers",
      title: "From data foundation to applied reading",
      body:
        "prevIA works through the integration of data, analytical processing, and user experience.",
      items: [
        {
          step: "01",
          title: "Data layer",
          body:
            "At the base of the system, prevIA organizes sports data and market information into a structured analytical foundation. This layer gathers the product’s raw material: matches, teams, competitive context, relevant statistics, and odds signals.",
        },
        {
          step: "02",
          title: "Metrics and models layer",
          body:
            "On top of that base, the system processes metrics, estimates, and probabilistic models to turn raw data into more useful readings. The goal is not just to display numbers, but to build probabilities, scenarios, and comparisons that help users interpret a match and its markets more clearly.",
        },
        {
          step: "03",
          title: "Experience layer",
          body:
            "Finally, this intelligence is presented in an experience designed for practical consumption. The user does not need to navigate disconnected data: prevIA organizes information into layers of reading, depth, and context, making analysis more accessible and objective.",
        },
      ],
    },
    inputs: {
      eyebrow: "What goes into the analysis",
      title: "A reading built from multiple signals",
      body:
        "prevIA analyses do not rely on a single indicator. They combine different dimensions to build a fuller reading.",
      items: [
        {
          title: "Statistics and sporting context",
          body:
            "The system considers different signals related to team performance and match context, such as recent behavior, consistency, relative strength, and competitive dynamics.",
        },
        {
          title: "Probabilistic modeling",
          body:
            "The models help convert data and context into structured estimates, including probabilities and distributions of possible scenarios.",
        },
        {
          title: "Market and odds",
          body:
            "Beyond sporting analysis, the product also considers the market dimension, allowing internal probabilities to be compared with observed odds prices.",
        },
        {
          title: "Applied interpretation",
          body:
            "The final objective is not only technical information, but a more useful reading for people who want to analyze better.",
        },
      ],
    },
    models: {
      eyebrow: "How the models help",
      title: "From isolated data to structured estimates",
      body:
        "prevIA models exist to transform data into more structured estimates. Instead of relying only on raw history, the system works to convert relevant signals into probabilities, scenarios, and comparisons that are more useful for user analysis.",
      questions: [
        "what is the probabilistic reading of a match",
        "how specific markets position themselves against that reading",
        "where there may be a gap between analytical context and market price",
      ],
      note:
        "Important: models are not guarantees of outcome. They are analytical support tools designed to reduce noise, organize information, and improve decision-making.",
    },
    userView: {
      eyebrow: "What the user sees in practice",
      title: "A progressive reading experience",
      body:
        "In practice, the user accesses an applied layer of the system’s intelligence. Depending on plan and unlocked depth, the experience may include:",
      items: [
        "match overview",
        "analytical reading of the matchup",
        "estimated probabilities",
        "market interpretation",
        "comparison with odds",
        "additional contextual signals",
        "different levels of detail",
      ],
    },
    credits: {
      eyebrow: "How the credits system works",
      title: "Depth organized by usage",
      body:
        "The credits system organizes the consumption of deeper analyses inside the platform. Instead of unlocking all depth in the same way, prevIA distributes access according to plan, usage type, and requested detail level.",
      items: [
        "organize different levels of consumption",
        "maintain predictable usage",
        "allow lighter access for occasional checks",
        "support a deeper experience for users who need recurrence and more detail",
      ],
    },
    plans: {
      eyebrow: "How the plans differ",
      title: "The main difference is depth",
      body:
        "prevIA plans differ not only by quantity of usage, but mainly by depth of access. Besides depth, they may also vary in scope, time horizon, and usage volume.",
      items: [
        {
          title: "Free",
          body:
            "A more introductory and exploratory layer, designed to allow initial contact with the product proposal.",
        },
        {
          title: "Basic",
          body:
            "Access to a more consistent practical reading, with more depth than the free layer.",
        },
        {
          title: "Light",
          body:
            "More analytical depth, more context, additional comparisons, and broader access to product resources.",
        },
        {
          title: "Pro",
          body:
            "The most complete platform layer, with deeper visibility, more advanced resources, and the highest analytical depth.",
        },
      ],
    },
    routine: {
      eyebrow: "How to use prevIA day to day",
      title: "A simple flow for reading and deepening",
      body:
        "The usage flow was designed to be simple, direct, and progressive.",
      items: [
        {
          step: "01",
          title: "Choose the match or context",
          body:
            "The user starts from the game, market, or scenario they want to understand better.",
        },
        {
          step: "02",
          title: "Access the initial reading",
          body:
            "The platform presents an initial analytical layer to contextualize the match.",
        },
        {
          step: "03",
          title: "Go deeper when it makes sense",
          body:
            "If the user wants to move beyond the basic view, they can unlock deeper layers with more comparisons, probabilities, and analytical signals.",
        },
        {
          step: "04",
          title: "Use the information in your own process",
          body:
            "prevIA does not replace individual judgment. It works as a support tool for people who want more clarity, structure, and method.",
        },
      ],
    },
    disclaimer: {
      eyebrow: "What prevIA does not promise",
      title: "More clarity, not certainty",
      body:
        "prevIA was not created to promise profit, eliminate risk, or replace individual responsibility. The goal is to support analysis with more context, organization, and depth — not to sell certainty.",
      items: [
        "the product does not guarantee results",
        "the product does not eliminate variance",
        "the product does not replace bankroll management",
        "the product does not exist to push picks as if they were certainties",
      ],
    },
    essence: {
      eyebrow: "In essence",
      title: "A bridge between complex data and practical analysis",
      body:
        "prevIA works as a bridge between complex data and practical analysis. It brings together statistics, models, probabilities, and market reading in a progressive experience designed to help users better understand the game, the context, and the market prices. More than ready-made answers, the proposal is to offer applied intelligence with more method and less noise.",
    },
    faq: {
      eyebrow: "FAQ",
      title: "Frequently asked questions",
      body:
        "At the end of the journey, the FAQ works as a reinforcement layer: clear, organized, and easy to expand as the landing page grows.",
      items: [
        {
          question: "Where do prevIA analyses come from?",
          answer:
            "The analyses are built from a structured base of data, metrics, analytical processing, and market reading organized in interpretive layers.",
        },
        {
          question: "Does prevIA use probabilistic models?",
          answer:
            "Yes. The product uses modeling to transform data and context into structured estimates, probabilities, and comparable scenarios.",
        },
        {
          question: "Does prevIA only show statistics?",
          answer:
            "No. Statistics are part of the base, but the goal of the platform is to turn data into practical reading with more context and interpretation.",
        },
        {
          question: "What does comparing probability with odds mean?",
          answer:
            "It means observing the difference between the system’s internal analytical reading and the market price, helping the user better understand how each scenario is positioned.",
        },
        {
          question: "How do credits work?",
          answer:
            "Credits organize access to deeper analyses inside the platform, allowing different levels of use according to plan and type of query.",
        },
        {
          question: "What changes between plans?",
          answer:
            "Plans vary in depth, access scope, usage volume, and the level of detail available to the user.",
        },
        {
          question: "Does prevIA guarantee results?",
          answer:
            "No. prevIA is an analytical support tool. It does not guarantee results, eliminate risk, or replace discipline and bankroll management.",
        },
      ],
    },
    cta: {
      eyebrow: "Next step",
      title: "Understand better. Analyze with more context.",
      body:
        "Explore prevIA and see how data, probabilities, and market reading can be organized into a clearer and more useful experience.",
      primaryCta: "Explore the platform",
      secondaryCta: "View glossary",
    },
  },

  es: {
    hero: {
      eyebrow: "Cómo funciona",
      title: "Cómo funciona prevIA",
      body:
        "prevIA combina datos deportivos, estadísticas, modelos probabilísticos y lectura de mercado para convertir información compleja en análisis práctico. Más que mostrar números aislados, la propuesta es organizar contexto, probabilidades y señales relevantes en una experiencia clara, progresiva y útil para el usuario.",
    },
    platform: {
      eyebrow: "Una plataforma construida en capas",
      title: "Desde la base de datos hasta la lectura aplicada",
      body:
        "prevIA funciona a partir de la integración entre datos, procesamiento analítico y experiencia de uso.",
      items: [
        {
          step: "01",
          title: "Capa de datos",
          body:
            "En la base del sistema, prevIA organiza datos deportivos e información de mercado para formar una base estructurada de análisis. Esta capa reúne la materia prima del producto: partidos, equipos, contexto competitivo, estadísticas relevantes y señales de cuotas.",
        },
        {
          step: "02",
          title: "Capa de métricas y modelos",
          body:
            "Sobre esa base, el sistema procesa métricas, estimaciones y modelos probabilísticos para transformar datos brutos en lecturas más útiles. El objetivo no es solo mostrar números, sino construir probabilidades, escenarios y comparaciones que ayuden al usuario a interpretar mejor un partido y sus mercados.",
        },
        {
          step: "03",
          title: "Capa de experiencia",
          body:
            "Por último, esta inteligencia se presenta en una experiencia pensada para consumo práctico. El usuario no necesita navegar por datos desconectados: prevIA organiza la información en capas de lectura, profundidad y contexto, haciendo el análisis más accesible y objetivo.",
        },
      ],
    },
    inputs: {
      eyebrow: "Qué entra en los análisis",
      title: "Una lectura construida con múltiples señales",
      body:
        "Los análisis de prevIA no dependen de un solo indicador. Combinan distintas dimensiones para construir una lectura más completa.",
      items: [
        {
          title: "Estadísticas y contexto deportivo",
          body:
            "El sistema considera diferentes señales relacionadas con el rendimiento de los equipos y el contexto del partido, como comportamiento reciente, consistencia, fuerza relativa y dinámica competitiva.",
        },
        {
          title: "Modelado probabilístico",
          body:
            "Los modelos ayudan a convertir datos y contexto en estimaciones estructuradas, incluyendo probabilidades y distribución de escenarios posibles.",
        },
        {
          title: "Mercado y cuotas",
          body:
            "Además de la lectura deportiva, el producto también considera la dimensión de mercado, permitiendo comparar probabilidades internas con precios observados en las cuotas.",
        },
        {
          title: "Interpretación aplicada",
          body:
            "La propuesta final no es entregar solo información técnica, sino organizar esa información en una lectura más útil para quien quiere analizar mejor.",
        },
      ],
    },
    models: {
      eyebrow: "Cómo ayudan los modelos",
      title: "Del dato aislado a la estimación estructurada",
      body:
        "Los modelos de prevIA existen para transformar datos en estimaciones más estructuradas. En lugar de depender solo del histórico bruto, el sistema trabaja para convertir señales relevantes en probabilidades, escenarios y comparaciones más útiles para el análisis del usuario.",
      questions: [
        "cuál es la lectura probabilística de un partido",
        "cómo se posicionan determinados mercados frente a esa lectura",
        "dónde puede existir diferencia entre el contexto analítico y el precio de mercado",
      ],
      note:
        "Importante: los modelos no son garantías de resultado. Son herramientas de apoyo al análisis, creadas para reducir ruido, organizar información y mejorar la toma de decisiones.",
    },
    userView: {
      eyebrow: "Qué ve el usuario en la práctica",
      title: "Una experiencia progresiva de lectura",
      body:
        "En la práctica, el usuario accede a una capa aplicada de la inteligencia del sistema. Dependiendo del plan y de la profundidad liberada, la experiencia puede incluir:",
      items: [
        "visión general del partido",
        "lectura analítica del enfrentamiento",
        "probabilidades estimadas",
        "interpretación de mercados",
        "comparación con cuotas",
        "señales adicionales de contexto",
        "diferentes niveles de detalle",
      ],
    },
    credits: {
      eyebrow: "Cómo funciona el sistema de créditos",
      title: "Profundidad organizada por uso",
      body:
        "El sistema de créditos organiza el consumo de análisis más profundos dentro de la plataforma. En lugar de liberar toda la profundidad de forma indistinta, prevIA distribuye el acceso según el plan, el tipo de uso y el nivel de detalle solicitado.",
      items: [
        "organizar diferentes niveles de consumo",
        "mantener previsibilidad de uso",
        "permitir acceso más liviano para consultas puntuales",
        "soportar una experiencia más profunda para quien necesita recurrencia y mayor detalle",
      ],
    },
    plans: {
      eyebrow: "Cómo se diferencian los planes",
      title: "La diferencia principal está en la profundidad",
      body:
        "Los planes de prevIA no se diferencian solo por cantidad de uso, sino principalmente por profundidad de acceso. Además de la profundidad, también pueden variar en alcance, horizonte temporal y volumen de uso.",
      items: [
        {
          title: "Free",
          body:
            "Una capa más introductoria y exploratoria, pensada para permitir un primer contacto con la propuesta del producto.",
        },
        {
          title: "Basic",
          body:
            "Acceso a una lectura práctica más consistente, con mayor profundidad que la capa gratuita.",
        },
        {
          title: "Light",
          body:
            "Más profundidad analítica, más contexto, comparaciones adicionales y acceso más amplio a recursos del producto.",
        },
        {
          title: "Pro",
          body:
            "La capa más completa de la plataforma, con visión más detallada, recursos más avanzados y mayor profundidad de análisis.",
        },
      ],
    },
    routine: {
      eyebrow: "Cómo usar prevIA en el día a día",
      title: "Un flujo simple para leer y profundizar",
      body:
        "El flujo de uso fue pensado para ser simple, directo y progresivo.",
      items: [
        {
          step: "01",
          title: "Elige el partido o contexto deseado",
          body:
            "El usuario parte del juego, mercado o escenario que quiere entender mejor.",
        },
        {
          step: "02",
          title: "Accede a la lectura inicial",
          body:
            "La plataforma presenta una capa inicial de análisis para contextualizar el partido.",
        },
        {
          step: "03",
          title: "Profundiza cuando tenga sentido",
          body:
            "Si quiere ir más allá de la visión básica, el usuario puede avanzar hacia capas más profundas, con más comparaciones, probabilidades y señales analíticas.",
        },
        {
          step: "04",
          title: "Usa la información en tu propio proceso",
          body:
            "prevIA no sustituye el juicio individual. Funciona como herramienta de apoyo para quien quiere analizar con más claridad, estructura y método.",
        },
      ],
    },
    disclaimer: {
      eyebrow: "Lo que prevIA no promete",
      title: "Más claridad, no promesa de certeza",
      body:
        "prevIA no fue creado para prometer lucro, eliminar riesgo ni sustituir la responsabilidad individual. La propuesta del producto es apoyar el análisis con más contexto, organización y profundidad — no vender certeza.",
      items: [
        "el producto no garantiza resultados",
        "el producto no elimina la varianza",
        "el producto no sustituye la gestión de banca",
        "el producto no existe para empujar pronósticos como si fueran certezas",
      ],
    },
    essence: {
      eyebrow: "En esencia",
      title: "Un puente entre datos complejos y análisis práctico",
      body:
        "prevIA funciona como un puente entre datos complejos y análisis práctico. Reúne estadísticas, modelos, probabilidades y lectura de mercado en una experiencia progresiva, pensada para ayudar al usuario a entender mejor el juego, el contexto y los precios del mercado. Más que respuestas listas, la propuesta es ofrecer inteligencia aplicada con más método y menos ruido.",
    },
    faq: {
      eyebrow: "FAQ",
      title: "Preguntas frecuentes",
      body:
        "Al final del recorrido, la FAQ entra como una capa de refuerzo: clara, organizada y fácil de expandir a medida que la landing crece.",
      items: [
        {
          question: "¿De dónde vienen los análisis de prevIA?",
          answer:
            "Los análisis se construyen a partir de una base de datos estructurados, métricas, procesamiento analítico y lectura de mercado organizada en capas de interpretación.",
        },
        {
          question: "¿prevIA usa modelos probabilísticos?",
          answer:
            "Sí. El producto utiliza modelado para transformar datos y contexto en estimaciones estructuradas, probabilidades y escenarios comparables.",
        },
        {
          question: "¿prevIA muestra solo estadísticas?",
          answer:
            "No. Las estadísticas forman parte de la base, pero el objetivo de la plataforma es transformar los datos en lectura práctica, con más contexto e interpretación.",
        },
        {
          question: "¿Qué significa comparar probabilidad con cuotas?",
          answer:
            "Significa observar la diferencia entre la lectura analítica interna del sistema y el precio practicado por el mercado, ayudando al usuario a entender mejor el posicionamiento de cada escenario.",
        },
        {
          question: "¿Cómo funcionan los créditos?",
          answer:
            "Los créditos organizan el acceso a análisis más profundos dentro de la plataforma, permitiendo diferentes niveles de uso según el plan y el tipo de consulta.",
        },
        {
          question: "¿Qué cambia entre los planes?",
          answer:
            "Los planes varían en profundidad, alcance de acceso, volumen de uso y nivel de detalle disponible para el usuario.",
        },
        {
          question: "¿prevIA garantiza resultados?",
          answer:
            "No. prevIA es una herramienta de apoyo al análisis. No garantiza resultados, no elimina riesgo y no sustituye disciplina ni gestión de banca.",
        },
      ],
    },
    cta: {
      eyebrow: "Siguiente paso",
      title: "Entiende mejor. Analiza con más contexto.",
      body:
        "Explora prevIA y ve cómo datos, probabilidades y lectura de mercado pueden organizarse en una experiencia más clara y más útil.",
      primaryCta: "Conocer la plataforma",
      secondaryCta: "Ver glosario",
    },
  },
};

export function getHowItWorksCopy(lang: Lang) {
  return HOW_IT_WORKS_COPY[lang] ?? HOW_IT_WORKS_COPY.pt;
}