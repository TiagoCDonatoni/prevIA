import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const steamMoveEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Steam move: o que significa um movimento forte de odds",
    seoDescription:
      "Entenda o que e steam move, por que uma odd pode se mover rapidamente e como interpretar esse sinal dentro do mercado de apostas.",
    intro:
      "Steam move e um movimento rapido e relevante de preco em um mercado. Ele costuma acontecer quando ha entrada concentrada de dinheiro, informacao nova ou ajuste forte de percepcao.",
    sections: [
      {
        title: "Como um steam move aparece",
        body: [
          "Um steam move pode ocorrer quando varias casas ajustam a mesma linha em pouco tempo. A odd de um lado cai rapidamente, enquanto o outro lado passa a pagar mais.",
          "Esse movimento pode refletir informacao, volume profissional, erro inicial de precificacao ou simples reacao em cadeia entre casas.",
        ],
      },
      {
        title: "Por que nao seguir cegamente",
        body: [
          "Quando o usuario percebe o movimento, parte do valor pode ja ter desaparecido. Seguir um steam move tarde demais pode significar pegar um preco pior do que o mercado original.",
          "O ideal e entender se ainda existe diferenca entre a odd atual, a probabilidade estimada e a referencia de valor.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum e tratar todo movimento rapido como dica. Steam move pode ser relevante, mas ainda precisa ser analisado com contexto e preco disponivel.",
        ],
      },
    ],
    productNote:
      "No prevIA, movimentos de mercado fazem mais sentido quando comparados com probabilidade estimada, odd justa e leitura de valor.",
    faq: [
      {
        question: "Steam move sempre indica dinheiro profissional?",
        answer:
          "Nao. Pode indicar dinheiro profissional, mas tambem pode refletir noticia, ajuste automatico ou movimento de liquidez.",
      },
      {
        question: "Vale apostar depois de um steam move?",
        answer:
          "Depende do preco atual. Se o valor ja foi consumido, entrar tarde pode ser ruim.",
      },
    ],
  },

  en: {
    seoTitle: "Steam move: what a sharp market move means",
    seoDescription:
      "Learn what a steam move is, why odds can move quickly across the market, and why it should not be followed blindly.",
    intro:
      "A steam move is a fast market move, often across multiple bookmakers, that may indicate strong money or information entering the market.",
    sections: [
      {
        title: "How steam moves happen",
        body: [
          "When influential bettors, syndicates, or new information hit the market, odds can move quickly in the same direction across books.",
          "This can happen before the public understands the underlying reason.",
        ],
      },
      {
        title: "Why caution matters",
        body: [
          "By the time a user notices a steam move, the best price may already be gone. Chasing late movement can mean buying a worse number.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is treating every steam move as a guaranteed signal. The price after the move may no longer have value.",
        ],
      },
    ],
    productNote:
      "In prevIA, steam moves would be most useful when compared with previous price, closing price, and estimated probability.",
    faq: [
      {
        question: "Does a steam move guarantee a winning bet?",
        answer:
          "No. It only signals strong movement, not certainty.",
      },
      {
        question: "Should I chase steam moves?",
        answer:
          "Not blindly. The available price after the move may be poor.",
      },
    ],
  },

  es: {
    seoTitle: "Steam move: qué significa un movimiento fuerte de mercado",
    seoDescription:
      "Entiende steam move, por qué las cuotas pueden moverse rápido y por qué no debe seguirse ciegamente.",
    intro:
      "Steam move es un movimiento rápido de mercado, muchas veces en varias casas, que puede indicar dinero fuerte o información entrando.",
    sections: [
      {
        title: "Cómo ocurre",
        body: [
          "Cuando apostadores influyentes, grupos o nueva información entran al mercado, las cuotas pueden moverse rápido en la misma dirección.",
          "Puede ocurrir antes de que el público entienda la razón.",
        ],
      },
      {
        title: "Por qué tener cuidado",
        body: [
          "Cuando el usuario nota el steam move, el mejor precio puede haber desaparecido. Perseguir el movimiento puede significar tomar un número peor.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es tratar todo steam move como señal garantizada. El precio después del movimiento puede ya no tener valor.",
        ],
      },
    ],
    productNote:
      "En prevIA, steam moves serían más útiles comparados con precio anterior, cierre y probabilidad estimada.",
    faq: [
      {
        question: "¿Garantiza una apuesta ganadora?",
        answer:
          "No. Solo muestra movimiento fuerte, no certeza.",
      },
      {
        question: "¿Debo perseguir steam moves?",
        answer:
          "No ciegamente. El precio disponible después del movimiento puede ser malo.",
      },
    ],
  },
};
