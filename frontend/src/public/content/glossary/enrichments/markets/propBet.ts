import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const propBetEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Prop bet: o que sao mercados de estatisticas e eventos especificos",
    seoDescription:
      "Entenda o que e prop bet, como funcionam mercados de jogador, cartoes, escanteios e estatisticas especificas dentro de uma partida.",
    intro:
      "Prop bet e uma aposta baseada em eventos especificos do jogo, e nao necessariamente no resultado final. Pode envolver gols de jogador, assistencias, finalizacoes, cartoes, escanteios e outras estatisticas.",
    sections: [
      {
        title: "Como funcionam prop bets",
        body: [
          "Uma prop pode perguntar se determinado jogador fara gol, se um time tera mais de certo numero de escanteios ou se havera cartoes acima de uma linha. O foco e um recorte especifico do jogo.",
          "Esses mercados podem ser interessantes porque exploram informacoes mais detalhadas, mas tambem costumam ter menor liquidez e margem mais alta.",
        ],
      },
      {
        title: "O que analisar",
        body: [
          "E importante olhar minutos esperados, funcao do jogador, estilo da equipe, adversario, ritmo da partida e historico contextual. Media simples pode ser insuficiente.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum e escolher props por narrativa, sem transformar a ideia em probabilidade e comparar com a odd disponivel.",
        ],
      },
    ],
    productNote:
      "No prevIA, props podem ser uma evolucao futura da leitura de mercado, sempre com foco em probabilidade, preco e contexto.",
    faq: [
      {
        question: "Prop bet depende do resultado do jogo?",
        answer:
          "Nem sempre. Muitas props podem vencer mesmo se o time ou jogador nao vence o jogo.",
      },
      {
        question: "Props costumam ter mais margem?",
        answer:
          "Frequentemente sim, especialmente em mercados menos liquidos ou muito especificos.",
      },
    ],
  },

  en: {
    seoTitle: "Prop bet: what proposition markets mean in betting",
    seoDescription:
      "Understand prop bets, how they differ from main markets, and why data quality matters when analyzing them.",
    intro:
      "A prop bet is a proposition market focused on a specific event within a match, rather than only the final result.",
    sections: [
      {
        title: "Examples of prop bets",
        body: [
          "Props can include player shots, cards, corners, assists, saves, or team-specific events. They vary widely by sport and bookmaker.",
          "Because props are more specific, liquidity and pricing quality can vary a lot.",
        ],
      },
      {
        title: "What to analyze",
        body: [
          "Good prop analysis depends on role, minutes, matchup, tactical context, historical usage, and line price.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is relying only on season averages without considering role changes or matchup context.",
        ],
      },
    ],
    productNote:
      "In prevIA, prop markets would require specialized data and careful normalization before becoming a product layer.",
    faq: [
      {
        question: "Are props only player markets?",
        answer:
          "No. Many are player-focused, but props can also be team or match events.",
      },
      {
        question: "Are prop markets harder to analyze?",
        answer:
          "Often yes, because they can require more granular data.",
      },
    ],
  },

  es: {
    seoTitle: "Prop bet: qué son mercados de proposición",
    seoDescription:
      "Entiende prop bets, cómo difieren de mercados principales y por qué la calidad de datos importa.",
    intro:
      "Una prop bet es un mercado de proposición enfocado en un evento específico dentro del partido, no solo en el resultado final.",
    sections: [
      {
        title: "Ejemplos de props",
        body: [
          "Pueden incluir tiros de jugador, tarjetas, córners, asistencias, atajadas o eventos de equipo. Varían por deporte y casa.",
          "Como son mercados específicos, la liquidez y calidad de precio pueden variar mucho.",
        ],
      },
      {
        title: "Qué analizar",
        body: [
          "Un buen análisis depende de rol, minutos, matchup, contexto táctico, uso histórico y precio de la línea.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es usar solo promedios de temporada sin considerar cambios de rol o contexto del rival.",
        ],
      },
    ],
    productNote:
      "En prevIA, props exigirían datos especializados y normalización cuidadosa antes de volverse una capa de producto.",
    faq: [
      {
        question: "¿Props son solo mercados de jugador?",
        answer:
          "No. Muchas son de jugador, pero también pueden ser eventos de equipo o partido.",
      },
      {
        question: "¿Son más difíciles de analizar?",
        answer:
          "A menudo sí, porque requieren datos más granulares.",
      },
    ],
  },
};
