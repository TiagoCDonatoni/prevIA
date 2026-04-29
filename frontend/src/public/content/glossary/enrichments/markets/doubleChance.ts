import type { Lang } from "../../../../../i18n";
import type { GlossaryTermEnhancement } from "../../glossaryData";

export const doubleChanceEnhancement: Partial<
  Record<Lang, GlossaryTermEnhancement>
> = {
  pt: {
    seoTitle: "Dupla chance: o que é 1X, X2 e 12 nas apostas de futebol",
    seoDescription:
      "Entenda o mercado dupla chance, como funcionam 1X, X2 e 12, e por que esse mercado oferece proteção com odd menor.",
    intro:
      "Dupla chance é um mercado que cobre dois dos três resultados possíveis em uma partida de futebol: vitória do mandante, empate ou vitória do visitante. Ele reduz risco, mas também costuma reduzir o retorno.",
    sections: [
      {
        title: "Como funcionam 1X, X2 e 12",
        body: [
          "A opção 1X vence se o mandante ganha ou empata. A opção X2 vence se o visitante ganha ou empata. A opção 12 vence se qualquer time vencer, mas perde se houver empate.",
          "Como você cobre dois cenários em vez de um, a odd geralmente é menor do que no mercado 1x2 tradicional. A proteção tem custo no preço.",
        ],
      },
      {
        title: "Quando a dupla chance pode fazer sentido",
        body: [
          "Esse mercado pode ser útil quando você vê vantagem em um lado, mas considera que o empate é um risco forte. Também pode aparecer em estratégias mais conservadoras, desde que o preço ainda faça sentido.",
          "A análise não deve ser apenas sobre segurança. É preciso comparar a probabilidade combinada dos cenários cobertos com a probabilidade implícita da odd oferecida.",
        ],
      },
      {
        title: "Erro comum",
        body: [
          "O erro comum é achar que dupla chance é automaticamente uma boa aposta porque cobre mais resultados. Se a odd estiver baixa demais, o mercado pode ser seguro na aparência e ruim no preço.",
        ],
      },
    ],
    productNote:
      "No prevIA, a leitura de mercados como dupla chance deve considerar probabilidade estimada, preço disponível e custo da proteção contra cenários adversos.",
    faq: [
      {
        question: "Dupla chance elimina o risco da aposta?",
        answer:
          "Não. Ela cobre dois resultados, mas ainda existe um terceiro cenário que pode perder a aposta.",
      },
      {
        question: "Dupla chance paga menos que vitória simples?",
        answer:
          "Geralmente sim, porque cobre mais resultados e reduz o risco do mercado.",
      },
    ],
  },

  en: {
    seoTitle: "Double chance: what 1X, X2, and 12 mean in football betting",
    seoDescription:
      "Understand double chance markets, how 1X, X2, and 12 work, and why added protection usually lowers the odds.",
    intro:
      "Double chance covers two of the three possible football results: home win, draw, or away win. It reduces risk, but usually also reduces return.",
    sections: [
      {
        title: "How 1X, X2, and 12 work",
        body: [
          "1X wins if the home team wins or draws. X2 wins if the away team wins or draws. 12 wins if either team wins but loses if the match draws.",
          "Because two scenarios are covered instead of one, the odds are usually lower than a traditional 1X2 selection.",
        ],
      },
      {
        title: "When it may make sense",
        body: [
          "It can be useful when you see an advantage for one side but consider the draw a strong risk.",
        ],
      },
      {
        title: "Common mistake",
        body: [
          "A common mistake is assuming double chance is automatically good because it covers more outcomes. If the price is too low, it can still be poor value.",
        ],
      },
    ],
    productNote:
      "In prevIA, double chance should be judged by estimated probability, available price, and the cost of protection.",
    faq: [
      {
        question: "Does double chance remove risk?",
        answer:
          "No. It covers two outcomes but still loses in the third scenario.",
      },
      {
        question: "Does double chance pay less than a straight win?",
        answer:
          "Usually yes, because it reduces risk by covering more outcomes.",
      },
    ],
  },

  es: {
    seoTitle: "Doble oportunidad: qué significan 1X, X2 y 12",
    seoDescription:
      "Entiende el mercado doble oportunidad, cómo funcionan 1X, X2 y 12, y por qué la protección suele bajar la cuota.",
    intro:
      "Doble oportunidad cubre dos de los tres resultados posibles en fútbol: local, empate o visitante. Reduce riesgo, pero también suele reducir retorno.",
    sections: [
      {
        title: "Cómo funcionan 1X, X2 y 12",
        body: [
          "1X gana si el local gana o empata. X2 gana si el visitante gana o empata. 12 gana si cualquier equipo gana, pero pierde con empate.",
          "Como cubre dos escenarios en vez de uno, la cuota suele ser menor que en 1X2 tradicional.",
        ],
      },
      {
        title: "Cuándo puede tener sentido",
        body: [
          "Puede ser útil cuando ves ventaja en un lado, pero consideras que el empate es un riesgo fuerte.",
        ],
      },
      {
        title: "Error común",
        body: [
          "Un error común es pensar que doble oportunidad es automáticamente buena por cubrir más resultados. Si el precio es muy bajo, puede no tener valor.",
        ],
      },
    ],
    productNote:
      "En prevIA, doble oportunidad debe evaluarse con probabilidad estimada, precio disponible y costo de protección.",
    faq: [
      {
        question: "¿Doble oportunidad elimina el riesgo?",
        answer:
          "No. Cubre dos resultados, pero pierde en el tercer escenario.",
      },
      {
        question: "¿Paga menos que victoria simple?",
        answer:
          "Generalmente sí, porque reduce riesgo cubriendo más resultados.",
      },
    ],
  },
};
