import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const cleanSheetEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Clean sheet: o que significa nao sofrer gols em apostas",
    seoDescription:
      "Entenda o mercado de clean sheet, quando uma equipe termina sem sofrer gols e como analisar defesa, adversario e contexto.",
    intro:
      "Clean sheet significa que uma equipe termina a partida sem sofrer gols. Em apostas, o mercado avalia se determinado time conseguira manter o zero no placar defensivo.",
    sections: [
      {
        title: "Como funciona o mercado",
        body: [
          "Se voce aposta que um time tera clean sheet, esse time precisa nao sofrer nenhum gol. O placar pode ser 0x0, 1x0, 2x0 ou qualquer resultado em que o adversario nao marque.",
          "O mercado se conecta com BTTS Nao, placar exato, vencedor e linhas defensivas, mas nao e identico a nenhum deles.",
        ],
      },
      {
        title: "O que observar na analise",
        body: [
          "Forca defensiva, qualidade do ataque adversario, mando, estilo de jogo, desfalques, goleiro, necessidade de resultado e ritmo esperado sao fatores importantes.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum e olhar apenas a posicao na tabela. Um time forte pode sofrer gol com frequencia, e um underdog pode ter contexto favoravel para defender baixo.",
        ],
      },
    ],
    productNote:
      "No prevIA, clean sheet se conecta com leitura de gols, BTTS, probabilidade estimada e precificacao de mercados defensivos.",
    faq: [
      {
        question: "0x0 conta como clean sheet?",
        answer:
          "Sim. Se a equipe nao sofre gol, ela teve clean sheet, mesmo que tambem nao tenha marcado.",
      },
      {
        question: "Clean sheet e igual a BTTS Nao?",
        answer:
          "Nao exatamente. BTTS Nao pode vencer quando qualquer um dos times nao marca; clean sheet foca em um time especifico nao sofrer gols.",
      },
    ],
  },

  en: {
    seoTitle: "Clean sheet: what it means when a team does not concede",
    seoDescription:
      "Learn what clean sheet means, how it relates to defensive performance, and how to think about it as a betting market.",
    intro:
      "A clean sheet means a team finishes the match without conceding a goal. In betting, it can appear as a team-specific defensive market.",
    sections: [
      {
        title: "How clean sheet works",
        body: [
          "If a team wins 1-0, draws 0-0, or wins 3-0, it kept a clean sheet. If it concedes at least once, it did not.",
          "The market depends only on whether the selected team concedes.",
        ],
      },
      {
        title: "What to analyze",
        body: [
          "Useful factors include defensive quality, opponent attack, match tempo, expected lineups, and game state risk.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is looking only at recent clean sheets without considering opponent strength and chance creation.",
        ],
      },
    ],
    productNote:
      "In prevIA, clean sheet markets connect defensive probability, opponent scoring expectation, and market price.",
    faq: [
      {
        question: "Can a team draw and keep a clean sheet?",
        answer:
          "Yes. A 0-0 draw is a clean sheet for both teams.",
      },
      {
        question: "Does clean sheet depend on winning?",
        answer:
          "No. It depends only on not conceding.",
      },
    ],
  },

  es: {
    seoTitle: "Clean sheet: qué significa portería a cero",
    seoDescription:
      "Entiende clean sheet, cómo se relaciona con rendimiento defensivo y cómo pensarlo como mercado de apuestas.",
    intro:
      "Clean sheet significa que un equipo termina el partido sin recibir goles. En apuestas, puede aparecer como mercado defensivo de equipo.",
    sections: [
      {
        title: "Cómo funciona",
        body: [
          "Si un equipo gana 1-0, empata 0-0 o gana 3-0, mantuvo portería a cero. Si recibe al menos un gol, no.",
          "El mercado depende solo de si el equipo seleccionado recibe gol.",
        ],
      },
      {
        title: "Qué analizar",
        body: [
          "Factores útiles incluyen calidad defensiva, ataque rival, ritmo, alineaciones esperadas y riesgo del estado del partido.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es mirar solo clean sheets recientes sin considerar fuerza del rival y creación de chances.",
        ],
      },
    ],
    productNote:
      "En prevIA, clean sheet conecta probabilidad defensiva, expectativa de gol rival y precio de mercado.",
    faq: [
      {
        question: "¿Un equipo puede empatar y tener clean sheet?",
        answer:
          "Sí. Un 0-0 es clean sheet para ambos.",
      },
      {
        question: "¿Depende de ganar?",
        answer:
          "No. Depende solo de no recibir goles.",
      },
    ],
  },
};
