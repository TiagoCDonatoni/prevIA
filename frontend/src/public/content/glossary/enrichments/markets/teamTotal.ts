import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const teamTotalEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Total de gols do time: como analisar team total no futebol",
    seoDescription:
      "Entenda o mercado team total, como funcionam linhas de gols por equipe e quais fatores observar antes de comparar odds.",
    intro:
      "Team total é o mercado de total de gols de uma equipe específica. Em vez de analisar o total do jogo inteiro, você avalia se um time fará mais ou menos gols do que uma linha definida.",
    sections: [
      {
        title: "Como funciona o team total",
        body: [
          "Se a linha do time é Over 1.5 gols, a aposta vence se aquela equipe marcar 2 ou mais gols. Se for Under 1.5, vence se o time marcar 0 ou 1 gol. O desempenho do adversário só importa indiretamente, por influenciar o contexto do jogo.",
          "Esse mercado pode aparecer para favoritos fortes, times com bom ataque ou confrontos em que a expectativa de gols está concentrada em um dos lados.",
        ],
      },
      {
        title: "O que observar na análise",
        body: [
          "É importante olhar força ofensiva do time, fragilidade defensiva do adversário, mando de campo, escalações, necessidade de resultado e estilo de jogo. Um time pode ser favorito sem necessariamente ter boa expectativa para superar uma linha de gols.",
          "A comparação com odds deve considerar a probabilidade estimada daquele time atingir a linha, não apenas a chance de vencer a partida.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é confundir favoritismo com gols. Um favorito pode vencer por 1x0 e não bater um Over 1.5 team total. O mercado exige uma leitura específica de produção ofensiva.",
        ],
      },
    ],
    productNote:
      "No prevIA, mercados de gols podem ser interpretados com mais clareza quando probabilidade, preço justo e contexto ofensivo são analisados juntos.",
    faq: [
      {
        question: "Team total depende dos gols dos dois times?",
        answer:
          "Não diretamente. Ele considera apenas os gols da equipe escolhida, embora o adversário influencie o contexto.",
      },
      {
        question: "Favorito é sempre bom para over de gols do time?",
        answer:
          "Não. O favorito pode ter boa chance de vencer, mas a linha de gols ainda precisa ter preço compatível com a probabilidade estimada.",
      },
    ],
  },

  en: {
    seoTitle: "Team total: what team goals markets mean",
    seoDescription:
      "Understand team totals, how they differ from full match totals, and what to analyze before betting on a team’s goals.",
    intro:
      "Team total is a market focused on how many goals one specific team will score, rather than the total goals in the match.",
    sections: [
      {
        title: "How team totals work",
        body: [
          "If a team total is Over 1.5, the selected team must score two or more goals. Under 1.5 wins if that team scores zero or one.",
          "The opponent’s goals do not matter directly, except through match context and game state.",
        ],
      },
      {
        title: "What to analyze",
        body: [
          "Useful factors include the team’s attacking strength, opponent defensive quality, expected lineup, motivation, and match tempo.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is analyzing only full match totals. A high-scoring match expectation may still be concentrated on one team.",
        ],
      },
    ],
    productNote:
      "In prevIA, team goal markets can be evaluated through estimated scoring probabilities and fair price.",
    faq: [
      {
        question: "Does team total depend on the final result?",
        answer:
          "No. It depends only on the selected team’s goals.",
      },
      {
        question: "Can a team lose and still go over its total?",
        answer:
          "Yes. A team can lose 3-2 and still clear Over 1.5 team goals.",
      },
    ],
  },

  es: {
    seoTitle: "Total del equipo: qué son mercados de goles de un equipo",
    seoDescription:
      "Entiende total del equipo, cómo difiere del total del partido y qué analizar antes de apostar en goles de un equipo.",
    intro:
      "Total del equipo se enfoca en cuántos goles marcará un equipo específico, no en el total de goles del partido.",
    sections: [
      {
        title: "Cómo funciona",
        body: [
          "Si el total del equipo es Over 1.5, ese equipo debe marcar dos o más goles. Under 1.5 gana si marca cero o uno.",
          "Los goles del rival no importan directamente, salvo por contexto y estado del partido.",
        ],
      },
      {
        title: "Qué analizar",
        body: [
          "Factores útiles incluyen fuerza ofensiva, defensa rival, alineación esperada, motivación y ritmo.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es analizar solo el total general. Un partido con expectativa alta puede concentrar goles en un lado.",
        ],
      },
    ],
    productNote:
      "En prevIA, mercados de goles de equipo pueden evaluarse con probabilidades estimadas y precio justo.",
    faq: [
      {
        question: "¿Depende del resultado final?",
        answer:
          "No. Depende solo de los goles del equipo seleccionado.",
      },
      {
        question: "¿Un equipo puede perder y superar su total?",
        answer:
          "Sí. Puede perder 3-2 y aun así superar Over 1.5 goles de equipo.",
      },
    ],
  },
};
