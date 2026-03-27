import type { Lang } from "../../../i18n";

export type GlossaryCategory =
  | "odds"
  | "probability"
  | "markets"
  | "bankroll"
  | "strategy";

export type GlossaryTranslation = {
  term: string;
  slug: string;
  shortDef: string;
  fullDef: string;
  example?: string;
  relatedIds?: string[];
};

export type GlossaryTerm = {
  id: string;
  category: GlossaryCategory;
  translations: Record<Lang, GlossaryTranslation>;
};

export const GLOSSARY_CATEGORY_LABELS: Record<
  Lang,
  Record<GlossaryCategory, string>
> = {
  pt: {
    odds: "Odds",
    probability: "Probabilidade",
    markets: "Mercados",
    bankroll: "Gestão de banca",
    strategy: "Estratégia",
  },
  en: {
    odds: "Odds",
    probability: "Probability",
    markets: "Markets",
    bankroll: "Bankroll",
    strategy: "Strategy",
  },
  es: {
    odds: "Cuotas",
    probability: "Probabilidad",
    markets: "Mercados",
    bankroll: "Gestión de banca",
    strategy: "Estrategia",
  },
};




export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "decimal-odds",
    category: "odds",
    translations: {
      pt: {
        term: "Odd decimal",
        slug: "odd-decimal",
        shortDef: "Formato de odd mais comum, como 1.80, 2.10 ou 3.50.",
        fullDef:
          "Odd decimal representa o retorno total para cada 1 unidade apostada, já incluindo o valor da stake. Se a odd é 2.00, uma aposta de 100 retorna 200 no total: 100 da stake e 100 de lucro.",
        example:
          "Se você aposta R$50 em uma odd 2.40 e vence, recebe R$120 no total.",
        relatedIds: ["implied-probability", "overround"],
      },
      en: {
        term: "Decimal odds",
        slug: "decimal-odds",
        shortDef: "The most common odds format, such as 1.80, 2.10, or 3.50.",
        fullDef:
          "Decimal odds represent the total return for each 1 unit staked, including the original stake. If the odds are 2.00, a 100 stake returns 200 total: 100 stake plus 100 profit.",
        example:
          "If you bet 50 at 2.40 and win, your total return is 120.",
        relatedIds: ["implied-probability", "overround"],
      },
      es: {
        term: "Cuota decimal",
        slug: "cuota-decimal",
        shortDef: "El formato de cuota más común, como 1.80, 2.10 o 3.50.",
        fullDef:
          "La cuota decimal representa el retorno total por cada 1 unidad apostada, incluyendo la stake inicial. Si la cuota es 2.00, una apuesta de 100 devuelve 200 en total: 100 de stake y 100 de ganancia.",
        example:
          "Si apuestas 50 a cuota 2.40 y aciertas, recibes 120 en total.",
        relatedIds: ["implied-probability", "overround"],
      },
    },
  },
  {
    id: "implied-probability",
    category: "probability",
    translations: {
      pt: {
        term: "Probabilidade implícita",
        slug: "probabilidade-implicita",
        shortDef: "Probabilidade que está embutida em uma odd.",
        fullDef:
          "A probabilidade implícita é a conversão da odd em chance percentual. Em odds decimais, a fórmula básica é 1 dividido pela odd. Isso ajuda a comparar a visão da casa com a sua estimativa real de chance.",
        example:
          "Uma odd 2.00 implica probabilidade de 50%. Uma odd 4.00 implica 25%.",
        relatedIds: ["decimal-odds", "value-bet"],
      },
      en: {
        term: "Implied probability",
        slug: "implied-probability",
        shortDef: "The probability embedded in an odds price.",
        fullDef:
          "Implied probability converts odds into a percentage chance. In decimal odds, the basic formula is 1 divided by the odds. This helps compare the bookmaker’s view with your own estimated probability.",
        example:
          "Odds of 2.00 imply 50%. Odds of 4.00 imply 25%.",
        relatedIds: ["decimal-odds", "value-bet"],
      },
      es: {
        term: "Probabilidad implícita",
        slug: "probabilidad-implicita",
        shortDef: "La probabilidad que está incorporada en una cuota.",
        fullDef:
          "La probabilidad implícita convierte la cuota en una probabilidad porcentual. En cuotas decimales, la fórmula básica es 1 dividido por la cuota. Esto ayuda a comparar la visión de la casa con tu propia estimación.",
        example:
          "Una cuota 2.00 implica 50%. Una cuota 4.00 implica 25%.",
        relatedIds: ["decimal-odds", "value-bet"],
      },
    },
  },
  {
    id: "value-bet",
    category: "strategy",
    translations: {
      pt: {
        term: "Value bet",
        slug: "value-bet",
        shortDef: "Aposta em que a odd oferecida está acima da probabilidade real estimada por você.",
        fullDef:
          "Existe value bet quando a odd do mercado paga mais do que deveria segundo sua estimativa de probabilidade. Não significa acerto garantido em uma aposta isolada, mas vantagem matemática ao longo de uma amostra.",
        example:
          "Se você estima 60% de chance para um evento, a odd justa seria 1.67. Se o mercado oferece 1.90, pode haver valor.",
        relatedIds: ["implied-probability", "expected-value", "closing-line-value"],
      },
      en: {
        term: "Value bet",
        slug: "value-bet",
        shortDef: "A bet where the offered odds are higher than your estimated true probability.",
        fullDef:
          "A value bet exists when the market price pays more than it should according to your probability estimate. It does not guarantee a single win, but it suggests a mathematical edge over a large sample.",
        example:
          "If you estimate a 60% chance, fair odds are 1.67. If the market offers 1.90, there may be value.",
        relatedIds: ["implied-probability", "expected-value", "closing-line-value"],
      },
      es: {
        term: "Value bet",
        slug: "value-bet",
        shortDef: "Apuesta en la que la cuota ofrecida está por encima de la probabilidad real estimada por ti.",
        fullDef:
          "Existe value bet cuando el mercado paga más de lo que debería según tu estimación de probabilidad. No garantiza acierto en una apuesta individual, pero sí una ventaja matemática en una muestra amplia.",
        example:
          "Si estimas 60% de probabilidad, la cuota justa sería 1.67. Si el mercado ofrece 1.90, puede haber valor.",
        relatedIds: ["implied-probability", "expected-value", "closing-line-value"],
      },
    },
  },
  {
    id: "expected-value",
    category: "strategy",
    translations: {
      pt: {
        term: "Expected value",
        slug: "expected-value",
        shortDef: "Valor esperado de uma aposta ao longo do tempo.",
        fullDef:
          "Expected value, ou EV, mede o retorno médio esperado de uma aposta se o mesmo cenário fosse repetido muitas vezes. É uma forma de avaliar se uma aposta é lucrativa no longo prazo, combinando probabilidade e preço.",
        example:
          "Uma aposta pode ter EV positivo mesmo perdendo hoje, desde que o preço seja melhor do que a chance real.",
        relatedIds: ["value-bet", "implied-probability"],
      },
      en: {
        term: "Expected value",
        slug: "expected-value",
        shortDef: "The long-term expected return of a bet.",
        fullDef:
          "Expected value, or EV, measures the average outcome of a bet if the same scenario were repeated many times. It is used to evaluate whether a bet is profitable in the long run by combining probability and price.",
        example:
          "A bet can have positive EV even if it loses today, as long as the price beats the true probability.",
        relatedIds: ["value-bet", "implied-probability"],
      },
      es: {
        term: "Valor esperado",
        slug: "valor-esperado",
        shortDef: "El retorno esperado de una apuesta a largo plazo.",
        fullDef:
          "El valor esperado, o EV, mide el resultado promedio de una apuesta si el mismo escenario se repitiera muchas veces. Sirve para evaluar si una apuesta es rentable a largo plazo, combinando probabilidad y precio.",
        example:
          "Una apuesta puede tener EV positivo aunque pierda hoy, si el precio supera la probabilidad real.",
        relatedIds: ["value-bet", "implied-probability"],
      },
    },
  },
  {
    id: "overround",
    category: "odds",
    translations: {
      pt: {
        term: "Overround",
        slug: "overround",
        shortDef: "Margem embutida da casa nas odds.",
        fullDef:
          "Overround é a soma das probabilidades implícitas de todos os resultados de um mercado. Quando essa soma passa de 100%, a diferença representa a margem da casa. Quanto maior o overround, pior tende a ser o preço para o apostador.",
        example:
          "Se um mercado soma 106% em probabilidades implícitas, há cerca de 6% de margem bruta da casa.",
        relatedIds: ["decimal-odds", "implied-probability"],
      },
      en: {
        term: "Overround",
        slug: "overround",
        shortDef: "The bookmaker’s built-in margin in the odds.",
        fullDef:
          "Overround is the sum of implied probabilities across all outcomes in a market. When that total exceeds 100%, the difference is the bookmaker margin. The higher the overround, the worse the price tends to be for the bettor.",
        example:
          "If a market sums to 106% implied probability, there is roughly a 6% gross margin.",
        relatedIds: ["decimal-odds", "implied-probability"],
      },
      es: {
        term: "Overround",
        slug: "overround",
        shortDef: "Margen incorporado de la casa en las cuotas.",
        fullDef:
          "El overround es la suma de las probabilidades implícitas de todos los resultados de un mercado. Cuando esa suma supera el 100%, la diferencia representa el margen de la casa. Cuanto mayor es el overround, peor suele ser el precio para el apostador.",
        example:
          "Si un mercado suma 106% de probabilidad implícita, hay aproximadamente un 6% de margen bruto.",
        relatedIds: ["decimal-odds", "implied-probability"],
      },
    },
  },
  {
    id: "bankroll",
    category: "bankroll",
    translations: {
      pt: {
        term: "Bankroll",
        slug: "bankroll",
        shortDef: "Capital separado exclusivamente para apostas.",
        fullDef:
          "Bankroll é o valor reservado exclusivamente para apostar. A ideia central é separar o dinheiro de apostas das finanças pessoais e administrar esse capital com disciplina para sobreviver à variância.",
        example:
          "Se sua banca é R$1.000, suas stakes devem ser proporcionais a esse valor, e não ao impulso de uma aposta isolada.",
        relatedIds: ["stake", "expected-value"],
      },
      en: {
        term: "Bankroll",
        slug: "bankroll",
        shortDef: "A dedicated pool of money reserved for betting.",
        fullDef:
          "A bankroll is the amount of money set aside exclusively for betting. The key idea is to separate betting capital from personal finances and manage it with discipline to survive variance.",
        example:
          "If your bankroll is 1,000, your stakes should be sized around that number, not around one emotional bet.",
        relatedIds: ["stake", "expected-value"],
      },
      es: {
        term: "Bankroll",
        slug: "bankroll",
        shortDef: "Capital reservado exclusivamente para apostar.",
        fullDef:
          "El bankroll es la cantidad de dinero apartada exclusivamente para apuestas. La idea central es separar ese capital de las finanzas personales y gestionarlo con disciplina para soportar la varianza.",
        example:
          "Si tu banca es 1.000, tus stakes deben ajustarse a esa cifra y no al impulso de una sola apuesta.",
        relatedIds: ["stake", "expected-value"],
      },
    },
  },
  {
    id: "stake",
    category: "bankroll",
    translations: {
      pt: {
        term: "Stake",
        slug: "stake",
        shortDef: "Valor colocado em uma aposta específica.",
        fullDef:
          "Stake é o tamanho da aposta. Pode ser definido em valor absoluto, porcentagem da banca ou em unidades. Controlar stake é essencial para gestão de risco e consistência no longo prazo.",
        example:
          "Uma stake de 2% numa banca de R$1.000 equivale a R$20.",
        relatedIds: ["bankroll"],
      },
      en: {
        term: "Stake",
        slug: "stake",
        shortDef: "The amount risked on a specific bet.",
        fullDef:
          "Stake is the size of the bet. It can be defined as an absolute amount, a percentage of bankroll, or units. Managing stake is essential for risk control and long-term consistency.",
        example:
          "A 2% stake on a 1,000 bankroll equals 20.",
        relatedIds: ["bankroll"],
      },
      es: {
        term: "Stake",
        slug: "stake",
        shortDef: "Cantidad arriesgada en una apuesta específica.",
        fullDef:
          "La stake es el tamaño de la apuesta. Puede definirse como monto absoluto, porcentaje de banca o unidades. Controlarla es clave para la gestión del riesgo y la consistencia a largo plazo.",
        example:
          "Una stake del 2% sobre una banca de 1.000 equivale a 20.",
        relatedIds: ["bankroll"],
      },
    },
  },
  {
    id: "asian-handicap",
    category: "markets",
    translations: {
      pt: {
        term: "Asian handicap",
        slug: "asian-handicap",
        shortDef: "Mercado que aplica vantagem ou desvantagem artificial a um dos lados.",
        fullDef:
          "Asian handicap é um mercado que ajusta o placar com linhas como -0.5, +0.25 ou -1.0 para equilibrar confronto e preço. Dependendo da linha, pode haver devolução parcial ou total em caso de empate no handicap.",
        example:
          "Time A -1.0: se vencer por um gol exato, a aposta é devolvida; por dois ou mais, vence.",
        relatedIds: ["draw-no-bet", "overround"],
      },
      en: {
        term: "Asian handicap",
        slug: "asian-handicap",
        shortDef: "A market that applies an artificial head start to one side.",
        fullDef:
          "Asian handicap adjusts the score with lines such as -0.5, +0.25, or -1.0 to balance matchups and price. Depending on the line, a bet can be partially or fully refunded if the handicap result lands on a push.",
        example:
          "Team A -1.0: if it wins by exactly one goal, the bet is refunded; by two or more, it wins.",
        relatedIds: ["draw-no-bet", "overround"],
      },
      es: {
        term: "Asian handicap",
        slug: "asian-handicap",
        shortDef: "Mercado que aplica una ventaja o desventaja artificial a uno de los lados.",
        fullDef:
          "El Asian handicap ajusta el marcador con líneas como -0.5, +0.25 o -1.0 para equilibrar el enfrentamiento y el precio. Según la línea, puede haber reembolso parcial o total si el resultado cae en push.",
        example:
          "Equipo A -1.0: si gana por exactamente un gol, la apuesta se devuelve; por dos o más, gana.",
        relatedIds: ["draw-no-bet", "overround"],
      },
    },
  },
  {
    id: "draw-no-bet",
    category: "markets",
    translations: {
      pt: {
        term: "Draw no bet",
        slug: "draw-no-bet",
        shortDef: "Mercado em que a aposta é devolvida se o jogo empatar.",
        fullDef:
          "Draw no bet remove o empate da equação. Você escolhe um time para vencer, e se a partida terminar empatada, a stake é devolvida. É um mercado intermediário entre moneyline/1x2 e handicap.",
        example:
          "Se você aposta no mandante em draw no bet e o jogo acaba 1x1, recebe reembolso.",
        relatedIds: ["asian-handicap"],
      },
      en: {
        term: "Draw no bet",
        slug: "draw-no-bet",
        shortDef: "A market where the stake is refunded if the match ends in a draw.",
        fullDef:
          "Draw no bet removes the draw from the equation. You pick one team to win, and if the match finishes level, the stake is refunded. It sits between moneyline/1x2 and handicap markets.",
        example:
          "If you back the home team draw no bet and the game ends 1-1, you get your stake back.",
        relatedIds: ["asian-handicap"],
      },
      es: {
        term: "Draw no bet",
        slug: "draw-no-bet",
        shortDef: "Mercado donde la stake se devuelve si el partido termina empatado.",
        fullDef:
          "Draw no bet elimina el empate de la ecuación. Eliges un equipo para ganar y, si el partido termina igualado, la stake se devuelve. Es un mercado intermedio entre 1x2 y handicap.",
        example:
          "Si apuestas al local en draw no bet y el partido termina 1-1, recuperas tu stake.",
        relatedIds: ["asian-handicap"],
      },
    },
  },
  {
    id: "btts",
    category: "markets",
    translations: {
      pt: {
        term: "Both teams to score",
        slug: "both-teams-to-score",
        shortDef: "Mercado que avalia se os dois times marcarão ao menos um gol.",
        fullDef:
          "Both teams to score, também chamado de BTTS, é um mercado binário: sim ou não. Ele ignora quem vence e foca apenas se ambos os lados conseguem marcar pelo menos uma vez.",
        example:
          "Se o jogo termina 2x1, BTTS Sim vence. Se termina 2x0, BTTS Sim perde.",
        relatedIds: ["over-under"],
      },
      en: {
        term: "Both teams to score",
        slug: "both-teams-to-score",
        shortDef: "A market on whether both teams will score at least once.",
        fullDef:
          "Both teams to score, often called BTTS, is a binary market: yes or no. It ignores the winner and focuses only on whether each side scores at least one goal.",
        example:
          "If the match ends 2-1, BTTS Yes wins. If it ends 2-0, BTTS Yes loses.",
        relatedIds: ["over-under"],
      },
      es: {
        term: "Ambos marcan",
        slug: "ambos-marcan",
        shortDef: "Mercado que evalúa si ambos equipos marcarán al menos un gol.",
        fullDef:
          "Ambos marcan, también conocido como BTTS, es un mercado binario: sí o no. No importa quién gane, solo si ambos equipos logran anotar al menos una vez.",
        example:
          "Si el partido termina 2-1, Ambos marcan Sí gana. Si termina 2-0, pierde.",
        relatedIds: ["over-under"],
      },
    },
  },
  {
    id: "over-under",
    category: "markets",
    translations: {
      pt: {
        term: "Over/Under",
        slug: "over-under",
        shortDef: "Mercado baseado no total de gols, pontos ou eventos acima/abaixo de uma linha.",
        fullDef:
          "Over/Under define uma linha de total — como 2.5 gols — e você aposta se o resultado final ficará acima ou abaixo dela. É um mercado muito comum e aparece em vários esportes.",
        example:
          "Over 2.5 gols vence se o jogo terminar com 3 ou mais gols.",
        relatedIds: ["btts"],
      },
      en: {
        term: "Over/Under",
        slug: "over-under",
        shortDef: "A market based on totals above or below a set line.",
        fullDef:
          "Over/Under sets a total line — such as 2.5 goals — and you bet on whether the final outcome lands above or below it. It is one of the most common betting markets across sports.",
        example:
          "Over 2.5 goals wins if the match ends with 3 or more total goals.",
        relatedIds: ["btts"],
      },
      es: {
        term: "Over/Under",
        slug: "over-under",
        shortDef: "Mercado basado en totales por encima o por debajo de una línea.",
        fullDef:
          "Over/Under fija una línea total — por ejemplo 2.5 goles — y apuestas si el resultado final quedará por encima o por debajo. Es uno de los mercados más comunes en varios deportes.",
        example:
          "Over 2.5 goles gana si el partido termina con 3 o más goles.",
        relatedIds: ["btts"],
      },
    },
  },
  {
    id: "closing-line-value",
    category: "strategy",
    translations: {
      pt: {
        term: "Closing line value",
        slug: "closing-line-value",
        shortDef: "Mede se sua odd foi melhor do que a odd de fechamento do mercado.",
        fullDef:
          "Closing line value, ou CLV, compara o preço que você pegou com o preço de fechamento do mercado. Bater consistentemente a closing line costuma ser um sinal de boa leitura de preço, ainda que resultados de curto prazo variem.",
        example:
          "Se você apostou a 2.10 e a odd fecha em 1.95, em tese você capturou CLV positivo.",
        relatedIds: ["value-bet", "expected-value"],
      },
      en: {
        term: "Closing line value",
        slug: "closing-line-value",
        shortDef: "Measures whether your price beat the market closing price.",
        fullDef:
          "Closing line value, or CLV, compares the odds you took with the market’s closing price. Consistently beating the closing line is often a sign of good pricing judgment, even if short-term results vary.",
        example:
          "If you bet at 2.10 and the line closes at 1.95, you likely captured positive CLV.",
        relatedIds: ["value-bet", "expected-value"],
      },
      es: {
        term: "Closing line value",
        slug: "closing-line-value",
        shortDef: "Mide si tu cuota fue mejor que la cuota de cierre del mercado.",
        fullDef:
          "El closing line value, o CLV, compara la cuota que tomaste con la cuota de cierre del mercado. Superar consistentemente la closing line suele ser señal de buena lectura de precio, aunque los resultados de corto plazo varíen.",
        example:
          "Si apostaste a 2.10 y el mercado cerró en 1.95, probablemente capturaste CLV positivo.",
        relatedIds: ["value-bet", "expected-value"],
      },
    },
  },
  {
    id: "fractional-odds",
    category: "odds",
    translations: {
      pt: {
        term: "Odd fracionária",
        slug: "odd-fracionaria",
        shortDef: "Formato de odd expresso em fração, como 5/2 ou 11/10.",
        fullDef: "Expressa o lucro em relação à stake, sem embutir o retorno total no número mostrado.",
        relatedIds: ["decimal-odds", "american-odds"],
      },
      en: {
        term: "Fractional odds",
        slug: "fractional-odds",
        shortDef: "An odds format shown as a fraction, such as 5/2 or 11/10.",
        fullDef: "It expresses profit relative to stake instead of showing total return inside the quoted number.",
        relatedIds: ["decimal-odds", "american-odds"],
      },
      es: {
        term: "Cuota fraccionaria",
        slug: "cuota-fraccionaria",
        shortDef: "Formato de cuota expresado como fracción, por ejemplo 5/2 u 11/10.",
        fullDef: "Expresa la ganancia en relación con la stake, sin incluir el retorno total dentro del número mostrado.",
        relatedIds: ["decimal-odds", "american-odds"],
      },
    },
  },
  {
    id: "american-odds",
    category: "odds",
    translations: {
      pt: {
        term: "Odd americana",
        slug: "odd-americana",
        shortDef: "Formato com sinais positivo e negativo, como +150 ou -120.",
        fullDef: "Odds positivas mostram lucro por 100 apostados; odds negativas mostram quanto apostar para lucrar 100.",
        relatedIds: ["decimal-odds", "fractional-odds", "implied-probability"],
      },
      en: {
        term: "American odds",
        slug: "american-odds",
        shortDef: "A format with plus and minus signs, such as +150 or -120.",
        fullDef: "Positive odds show profit per 100 staked, while negative odds show how much must be risked to win 100.",
        relatedIds: ["decimal-odds", "fractional-odds", "implied-probability"],
      },
      es: {
        term: "Cuota americana",
        slug: "cuota-americana",
        shortDef: "Formato con signos positivo y negativo, como +150 o -120.",
        fullDef: "Las cuotas positivas muestran la ganancia por cada 100 apostados, y las negativas cuánto debes apostar para ganar 100.",
        relatedIds: ["decimal-odds", "fractional-odds", "implied-probability"],
      },
    },
  },
  {
    id: "fair-odds",
    category: "probability",
    translations: {
      pt: {
        term: "Odd justa",
        slug: "odd-justa",
        shortDef: "Preço teórico de uma aposta sem margem da casa.",
        fullDef: "É a cotação que representa exatamente sua probabilidade estimada, sem overround nem comissão.",
        relatedIds: ["implied-probability", "value-bet", "overround"],
      },
      en: {
        term: "Fair odds",
        slug: "fair-odds",
        shortDef: "The theoretical price of a bet without bookmaker margin.",
        fullDef: "It is the price that exactly matches your estimated probability, with no overround or commission included.",
        relatedIds: ["implied-probability", "value-bet", "overround"],
      },
      es: {
        term: "Cuota justa",
        slug: "cuota-justa",
        shortDef: "Precio teórico de una apuesta sin margen de la casa.",
        fullDef: "Es el precio que refleja exactamente tu probabilidad estimada, sin overround ni comisión.",
        relatedIds: ["implied-probability", "value-bet", "overround"],
      },
    },
  },
  {
    id: "true-probability",
    category: "probability",
    translations: {
      pt: {
        term: "Probabilidade real",
        slug: "probabilidade-real",
        shortDef: "Estimativa da chance real de um evento, independente da odd publicada.",
        fullDef: "É a sua melhor estimativa da chance de um evento acontecer após remover margem, ruído e vieses.",
        relatedIds: ["implied-probability", "fair-odds", "edge"],
      },
      en: {
        term: "True probability",
        slug: "true-probability",
        shortDef: "Your estimate of the real chance of an event, independent of listed odds.",
        fullDef: "It is your best estimate of the actual chance after stripping out margin, noise, and bias.",
        relatedIds: ["implied-probability", "fair-odds", "edge"],
      },
      es: {
        term: "Probabilidad real",
        slug: "probabilidad-real",
        shortDef: "Estimación de la probabilidad real de un evento, al margen de la cuota publicada.",
        fullDef: "Es tu mejor estimación de la probabilidad real después de quitar margen, ruido y sesgos.",
        relatedIds: ["implied-probability", "fair-odds", "edge"],
      },
    },
  },
  {
    id: "no-vig-probability",
    category: "probability",
    translations: {
      pt: {
        term: "Probabilidade sem vigorish",
        slug: "probabilidade-sem-vigorish",
        shortDef: "Probabilidade ajustada após remover a margem da casa.",
        fullDef: "Tenta reconstruir a leitura do mercado sem o overround para comparação mais limpa.",
        relatedIds: ["implied-probability", "overround", "true-probability"],
      },
      en: {
        term: "No-vig probability",
        slug: "no-vig-probability",
        shortDef: "Probability adjusted after removing bookmaker margin.",
        fullDef: "It reconstructs the market view without overround so you can compare against a cleaner baseline.",
        relatedIds: ["implied-probability", "overround", "true-probability"],
      },
      es: {
        term: "Probabilidad sin vigorish",
        slug: "probabilidad-sin-vigorish",
        shortDef: "Probabilidad ajustada tras eliminar el margen de la casa.",
        fullDef: "Reconstruye la visión del mercado sin overround para una comparación más limpia.",
        relatedIds: ["implied-probability", "overround", "true-probability"],
      },
    },
  },
  {
    id: "model-probability",
    category: "probability",
    translations: {
      pt: {
        term: "Probabilidade do modelo",
        slug: "probabilidade-do-modelo",
        shortDef: "Probabilidade gerada por um modelo estatístico ou algoritmo.",
        fullDef: "É a estimativa produzida pela sua própria camada analítica, e não diretamente pela casa.",
        relatedIds: ["true-probability", "edge", "calibration"],
      },
      en: {
        term: "Model probability",
        slug: "model-probability",
        shortDef: "A probability generated by a statistical model or algorithm.",
        fullDef: "It is the estimate produced by your own analytical model rather than directly by the sportsbook.",
        relatedIds: ["true-probability", "edge", "calibration"],
      },
      es: {
        term: "Probabilidad del modelo",
        slug: "probabilidad-del-modelo",
        shortDef: "Probabilidad generada por un modelo estadístico o algoritmo.",
        fullDef: "Es la estimación producida por tu propio modelo analítico y no directamente por la casa.",
        relatedIds: ["true-probability", "edge", "calibration"],
      },
    },
  },
  {
    id: "edge",
    category: "probability",
    translations: {
      pt: {
        term: "Edge",
        slug: "edge",
        shortDef: "Vantagem matemática entre sua estimativa e o preço do mercado.",
        fullDef: "Mede o quanto sua leitura supera o preço disponível naquela linha específica.",
        relatedIds: ["value-bet", "fair-odds", "expected-value"],
      },
      en: {
        term: "Edge",
        slug: "edge",
        shortDef: "The mathematical advantage between your estimate and the market price.",
        fullDef: "It measures how much your view beats the available price on that specific line.",
        relatedIds: ["value-bet", "fair-odds", "expected-value"],
      },
      es: {
        term: "Edge",
        slug: "edge",
        shortDef: "Ventaja matemática entre tu estimación y el precio del mercado.",
        fullDef: "Mide cuánto supera tu lectura al precio disponible en esa línea concreta.",
        relatedIds: ["value-bet", "fair-odds", "expected-value"],
      },
    },
  },
  {
    id: "line-shopping",
    category: "odds",
    translations: {
      pt: {
        term: "Line shopping",
        slug: "line-shopping",
        shortDef: "Comparar várias casas em busca do melhor preço disponível.",
        fullDef: "Pequenas diferenças de odd fazem grande diferença no longo prazo, então vale procurar o melhor preço.",
        relatedIds: ["value-bet", "closing-line-value", "line-movement"],
      },
      en: {
        term: "Line shopping",
        slug: "line-shopping",
        shortDef: "Comparing multiple books to find the best available price.",
        fullDef: "Small differences in odds matter a lot over the long run, so hunting for price is important.",
        relatedIds: ["value-bet", "closing-line-value", "line-movement"],
      },
      es: {
        term: "Line shopping",
        slug: "line-shopping",
        shortDef: "Comparar varias casas para encontrar el mejor precio disponible.",
        fullDef: "Pequeñas diferencias de cuota importan mucho a largo plazo, por eso conviene buscar el mejor precio.",
        relatedIds: ["value-bet", "closing-line-value", "line-movement"],
      },
    },
  },
  {
    id: "line-movement",
    category: "odds",
    translations: {
      pt: {
        term: "Movimento de linha",
        slug: "movimento-de-linha",
        shortDef: "Alteração de odds ou handicap ao longo do tempo.",
        fullDef: "Pode refletir dinheiro novo, informação nova, ajuste de risco ou reação coletiva do mercado.",
        relatedIds: ["closing-line-value", "steam-move", "line-shopping"],
      },
      en: {
        term: "Line movement",
        slug: "line-movement",
        shortDef: "A change in odds or handicap over time.",
        fullDef: "It may reflect new money, new information, risk balancing, or a broader market reaction.",
        relatedIds: ["closing-line-value", "steam-move", "line-shopping"],
      },
      es: {
        term: "Movimiento de línea",
        slug: "movimiento-de-linea",
        shortDef: "Cambio de cuotas o handicap a lo largo del tiempo.",
        fullDef: "Puede reflejar dinero nuevo, información nueva, ajuste de riesgo o reacción general del mercado.",
        relatedIds: ["closing-line-value", "steam-move", "line-shopping"],
      },
    },
  },
  {
    id: "steam-move",
    category: "odds",
    translations: {
      pt: {
        term: "Steam move",
        slug: "steam-move",
        shortDef: "Movimento rápido e forte de preço por pressão concentrada no mercado.",
        fullDef: "Costuma acontecer quando entra muito volume ou surge informação relevante em pouco tempo.",
        relatedIds: ["line-movement", "closing-line-value", "liquidity"],
      },
      en: {
        term: "Steam move",
        slug: "steam-move",
        shortDef: "A sharp and fast price move caused by concentrated market pressure.",
        fullDef: "It usually happens when large volume or important information hits the market quickly.",
        relatedIds: ["line-movement", "closing-line-value", "liquidity"],
      },
      es: {
        term: "Steam move",
        slug: "steam-move",
        shortDef: "Movimiento rápido y fuerte del precio por presión concentrada en el mercado.",
        fullDef: "Suele ocurrir cuando entra mucho volumen o aparece información relevante en poco tiempo.",
        relatedIds: ["line-movement", "closing-line-value", "liquidity"],
      },
    },
  },
  {
    id: "moneyline",
    category: "markets",
    translations: {
      pt: {
        term: "Moneyline",
        slug: "moneyline",
        shortDef: "Mercado simples de vencedor, sem handicap nem total.",
        fullDef: "Foca apenas em quem vence o evento, embora a regra exata possa variar em esportes com empate.",
        relatedIds: ["draw-no-bet", "double-chance"],
      },
      en: {
        term: "Moneyline",
        slug: "moneyline",
        shortDef: "A simple winner market with no handicap or total attached.",
        fullDef: "It focuses only on the event winner, though exact rules may vary in sports where draws exist.",
        relatedIds: ["draw-no-bet", "double-chance"],
      },
      es: {
        term: "Moneyline",
        slug: "moneyline",
        shortDef: "Mercado simple de ganador, sin handicap ni total asociado.",
        fullDef: "Se centra solo en el ganador del evento, aunque la regla exacta puede variar en deportes con empate.",
        relatedIds: ["draw-no-bet", "double-chance"],
      },
    },
  },
  {
    id: "double-chance",
    category: "markets",
    translations: {
      pt: {
        term: "Dupla chance",
        slug: "dupla-chance",
        shortDef: "Mercado em que dois dos três resultados do 1x2 cobrem a aposta.",
        fullDef: "Combina dois resultados possíveis no mesmo bilhete e por isso costuma pagar menos.",
        relatedIds: ["draw-no-bet", "moneyline"],
      },
      en: {
        term: "Double chance",
        slug: "double-chance",
        shortDef: "A market where two of the three 1x2 outcomes are covered.",
        fullDef: "It combines two possible outcomes in the same ticket, so the price is usually lower.",
        relatedIds: ["draw-no-bet", "moneyline"],
      },
      es: {
        term: "Doble oportunidad",
        slug: "doble-oportunidad",
        shortDef: "Mercado en el que dos de los tres resultados del 1x2 cubren la apuesta.",
        fullDef: "Combina dos resultados posibles en el mismo boleto y por eso suele pagar menos.",
        relatedIds: ["draw-no-bet", "moneyline"],
      },
    },
  },
  {
    id: "push",
    category: "markets",
    translations: {
      pt: {
        term: "Push",
        slug: "push",
        shortDef: "Situação em que a aposta é anulada e a stake é devolvida.",
        fullDef: "Acontece quando o resultado cai exatamente na linha que gera reembolso em vez de vitória ou derrota.",
        relatedIds: ["over-under", "asian-handicap"],
      },
      en: {
        term: "Push",
        slug: "push",
        shortDef: "A situation where the bet is voided and the stake is refunded.",
        fullDef: "It happens when the final result lands exactly on the refund line instead of producing a win or loss.",
        relatedIds: ["over-under", "asian-handicap"],
      },
      es: {
        term: "Push",
        slug: "push",
        shortDef: "Situación en la que la apuesta se anula y la stake se devuelve.",
        fullDef: "Ocurre cuando el resultado final cae exactamente en la línea de reembolso en lugar de victoria o derrota.",
        relatedIds: ["over-under", "asian-handicap"],
      },
    },
  },
  {
    id: "half-win",
    category: "markets",
    translations: {
      pt: {
        term: "Meia vitória",
        slug: "meia-vitoria",
        shortDef: "Resultado parcial positivo em linhas asiáticas fracionadas.",
        fullDef: "Parte da stake vence e parte é devolvida, algo comum em linhas como -0.25 ou 2.25.",
        relatedIds: ["asian-handicap", "half-loss", "asian-total"],
      },
      en: {
        term: "Half win",
        slug: "half-win",
        shortDef: "A partial winning result on split Asian lines.",
        fullDef: "Part of the stake wins and part is refunded, which is common on lines such as -0.25 or 2.25.",
        relatedIds: ["asian-handicap", "half-loss", "asian-total"],
      },
      es: {
        term: "Media victoria",
        slug: "media-victoria",
        shortDef: "Resultado parcialmente ganador en líneas asiáticas fraccionadas.",
        fullDef: "Una parte de la stake gana y otra se devuelve, algo común en líneas como -0.25 o 2.25.",
        relatedIds: ["asian-handicap", "half-loss", "asian-total"],
      },
    },
  },
  {
    id: "half-loss",
    category: "markets",
    translations: {
      pt: {
        term: "Meia derrota",
        slug: "meia-derrota",
        shortDef: "Resultado parcial negativo em linhas asiáticas fracionadas.",
        fullDef: "Metade da stake é perdida e a outra metade devolvida, em vez de uma perda total.",
        relatedIds: ["asian-handicap", "half-win", "asian-total"],
      },
      en: {
        term: "Half loss",
        slug: "half-loss",
        shortDef: "A partial losing result on split Asian lines.",
        fullDef: "Half of the stake loses and the other half is refunded instead of a full loss.",
        relatedIds: ["asian-handicap", "half-win", "asian-total"],
      },
      es: {
        term: "Media derrota",
        slug: "media-derrota",
        shortDef: "Resultado parcialmente perdedor en líneas asiáticas fraccionadas.",
        fullDef: "La mitad de la stake se pierde y la otra mitad se devuelve, en lugar de una pérdida completa.",
        relatedIds: ["asian-handicap", "half-win", "asian-total"],
      },
    },
  },
  {
    id: "parlay",
    category: "markets",
    translations: {
      pt: {
        term: "Parlay",
        slug: "parlay",
        shortDef: "Aposta múltipla em que todas as seleções precisam bater.",
        fullDef: "Combina várias seleções no mesmo bilhete multiplicando odds, mas basta uma errada para perder tudo.",
        relatedIds: ["same-game-parlay", "expected-value"],
      },
      en: {
        term: "Parlay",
        slug: "parlay",
        shortDef: "A multi-leg bet where every selection must win.",
        fullDef: "It combines several selections on one ticket, but one losing leg kills the whole bet.",
        relatedIds: ["same-game-parlay", "expected-value"],
      },
      es: {
        term: "Parlay",
        slug: "parlay",
        shortDef: "Apuesta múltiple en la que todas las selecciones deben acertarse.",
        fullDef: "Combina varias selecciones en un mismo boleto, pero un solo fallo arruina toda la apuesta.",
        relatedIds: ["same-game-parlay", "expected-value"],
      },
    },
  },
  {
    id: "same-game-parlay",
    category: "markets",
    translations: {
      pt: {
        term: "Same game parlay",
        slug: "same-game-parlay",
        shortDef: "Múltipla com seleções do mesmo evento.",
        fullDef: "Combina mercados do mesmo jogo, normalmente com correlações e precificação mais complexa.",
        relatedIds: ["parlay", "prop-bet", "team-total"],
      },
      en: {
        term: "Same game parlay",
        slug: "same-game-parlay",
        shortDef: "A multi-leg bet built from selections inside the same event.",
        fullDef: "It combines markets from the same game, often with correlation and more complex pricing.",
        relatedIds: ["parlay", "prop-bet", "team-total"],
      },
      es: {
        term: "Same game parlay",
        slug: "same-game-parlay",
        shortDef: "Combinada construida con selecciones del mismo evento.",
        fullDef: "Combina mercados del mismo partido, normalmente con correlaciones y precios más complejos.",
        relatedIds: ["parlay", "prop-bet", "team-total"],
      },
    },
  },
  {
    id: "prop-bet",
    category: "markets",
    translations: {
      pt: {
        term: "Prop bet",
        slug: "prop-bet",
        shortDef: "Mercado baseado em estatísticas ou eventos específicos do jogo.",
        fullDef: "Vai além do placar final e foca em jogador marcar, cartões, escanteios, finalizações e outros eventos.",
        relatedIds: ["same-game-parlay", "team-total", "correct-score"],
      },
      en: {
        term: "Prop bet",
        slug: "prop-bet",
        shortDef: "A market based on specific stats or in-game events.",
        fullDef: "It goes beyond the final result and focuses on player props, cards, corners, shots, and similar events.",
        relatedIds: ["same-game-parlay", "team-total", "correct-score"],
      },
      es: {
        term: "Prop bet",
        slug: "prop-bet",
        shortDef: "Mercado basado en estadísticas o eventos específicos del juego.",
        fullDef: "Va más allá del resultado final y se centra en jugador marcar, tarjetas, córners, tiros y eventos similares.",
        relatedIds: ["same-game-parlay", "team-total", "correct-score"],
      },
    },
  },
  {
    id: "team-total",
    category: "markets",
    translations: {
      pt: {
        term: "Total do time",
        slug: "total-do-time",
        shortDef: "Mercado de gols ou pontos marcados por apenas uma equipe.",
        fullDef: "Isola a produção ofensiva de um lado em vez de olhar o total combinado do jogo.",
        relatedIds: ["over-under", "prop-bet", "moneyline"],
      },
      en: {
        term: "Team total",
        slug: "team-total",
        shortDef: "A goals or points market tied to only one team.",
        fullDef: "It isolates one team’s offensive output instead of the game’s combined total.",
        relatedIds: ["over-under", "prop-bet", "moneyline"],
      },
      es: {
        term: "Total del equipo",
        slug: "total-del-equipo",
        shortDef: "Mercado de goles o puntos marcado solo por un equipo.",
        fullDef: "Aísla la producción ofensiva de un solo lado en lugar del total combinado del partido.",
        relatedIds: ["over-under", "prop-bet", "moneyline"],
      },
    },
  },
  {
    id: "correct-score",
    category: "markets",
    translations: {
      pt: {
        term: "Placar exato",
        slug: "placar-exato",
        shortDef: "Mercado em que você precisa acertar o resultado final exato.",
        fullDef: "Como a exigência é alta, as odds tendem a ser elevadas e a variância também.",
        relatedIds: ["over-under", "moneyline", "prop-bet"],
      },
      en: {
        term: "Correct score",
        slug: "correct-score",
        shortDef: "A market where you must predict the exact final score.",
        fullDef: "Because the bar is high, prices tend to be large and variance tends to be high as well.",
        relatedIds: ["over-under", "moneyline", "prop-bet"],
      },
      es: {
        term: "Marcador exacto",
        slug: "marcador-exacto",
        shortDef: "Mercado en el que debes acertar el resultado final exacto.",
        fullDef: "Como la exigencia es alta, las cuotas suelen ser elevadas y la varianza también.",
        relatedIds: ["over-under", "moneyline", "prop-bet"],
      },
    },
  },
  {
    id: "clean-sheet",
    category: "markets",
    translations: {
      pt: {
        term: "Clean sheet",
        slug: "clean-sheet",
        shortDef: "Mercado ligado a uma equipe não sofrer gols.",
        fullDef: "Pode aparecer como mercado próprio ou embutido em combinações e props.",
        relatedIds: ["btts", "correct-score", "moneyline"],
      },
      en: {
        term: "Clean sheet",
        slug: "clean-sheet",
        shortDef: "A market tied to a team not conceding a goal.",
        fullDef: "It may appear as a standalone market or inside combinations and props.",
        relatedIds: ["btts", "correct-score", "moneyline"],
      },
      es: {
        term: "Portería a cero",
        slug: "porteria-a-cero",
        shortDef: "Mercado ligado a que un equipo no encaje gol.",
        fullDef: "Puede aparecer como mercado propio o dentro de combinaciones y props.",
        relatedIds: ["btts", "correct-score", "moneyline"],
      },
    },
  },
  {
    id: "asian-total",
    category: "markets",
    translations: {
      pt: {
        term: "Total asiático",
        slug: "total-asiatico",
        shortDef: "Mercado de gols ou pontos com linhas asiáticas fracionadas.",
        fullDef: "Aplica a lógica de 2.25, 2.75 e similares ao over/under, criando meia vitória ou meia derrota.",
        relatedIds: ["over-under", "half-win", "half-loss"],
      },
      en: {
        term: "Asian total",
        slug: "asian-total",
        shortDef: "A totals market using split Asian lines.",
        fullDef: "It applies lines like 2.25 and 2.75 to totals, creating half-win and half-loss outcomes.",
        relatedIds: ["over-under", "half-win", "half-loss"],
      },
      es: {
        term: "Total asiático",
        slug: "total-asiatico",
        shortDef: "Mercado de goles o puntos con líneas asiáticas fraccionadas.",
        fullDef: "Aplica líneas como 2.25 y 2.75 al over/under, creando media victoria o media derrota.",
        relatedIds: ["over-under", "half-win", "half-loss"],
      },
    },
  },
  {
    id: "unit",
    category: "bankroll",
    translations: {
      pt: {
        term: "Unidade",
        slug: "unidade",
        shortDef: "Forma padronizada de medir stake sem expor o valor absoluto da banca.",
        fullDef: "Em vez de falar em dinheiro, você define que 1 unidade representa uma fração fixa da banca.",
        relatedIds: ["stake", "bankroll", "flat-staking"],
      },
      en: {
        term: "Unit",
        slug: "unit",
        shortDef: "A standardized way to express stake without revealing bankroll size.",
        fullDef: "Instead of speaking in cash terms, you define 1 unit as a fixed fraction of bankroll.",
        relatedIds: ["stake", "bankroll", "flat-staking"],
      },
      es: {
        term: "Unidad",
        slug: "unidad",
        shortDef: "Forma estandarizada de medir la stake sin exponer el tamaño absoluto de la banca.",
        fullDef: "En lugar de hablar en dinero, defines que 1 unidad representa una fracción fija de la banca.",
        relatedIds: ["stake", "bankroll", "flat-staking"],
      },
    },
  },
  {
    id: "flat-staking",
    category: "bankroll",
    translations: {
      pt: {
        term: "Flat staking",
        slug: "flat-staking",
        shortDef: "Método em que as apostas usam stake fixa ou quase fixa.",
        fullDef: "Reduz erro de sizing e ajuda a comparar desempenho com mais disciplina.",
        relatedIds: ["stake", "unit", "kelly-criterion"],
      },
      en: {
        term: "Flat staking",
        slug: "flat-staking",
        shortDef: "A staking method where bets use a fixed or near-fixed size.",
        fullDef: "It reduces sizing errors and makes disciplined performance tracking easier.",
        relatedIds: ["stake", "unit", "kelly-criterion"],
      },
      es: {
        term: "Flat staking",
        slug: "flat-staking",
        shortDef: "Método en el que las apuestas usan una stake fija o casi fija.",
        fullDef: "Reduce errores de sizing y facilita un seguimiento más disciplinado del rendimiento.",
        relatedIds: ["stake", "unit", "kelly-criterion"],
      },
    },
  },
  {
    id: "kelly-criterion",
    category: "bankroll",
    translations: {
      pt: {
        term: "Critério de Kelly",
        slug: "criterio-de-kelly",
        shortDef: "Modelo de staking que dimensiona a aposta conforme vantagem estimada e odd.",
        fullDef: "Na teoria maximiza crescimento de banca no longo prazo, mas costuma ser usado de forma fracionada.",
        relatedIds: ["value-bet", "edge", "fractional-kelly"],
      },
      en: {
        term: "Kelly criterion",
        slug: "kelly-criterion",
        shortDef: "A staking model that sizes bets according to estimated edge and odds.",
        fullDef: "In theory it maximizes bankroll growth, though many bettors use only a fraction of it.",
        relatedIds: ["value-bet", "edge", "fractional-kelly"],
      },
      es: {
        term: "Criterio de Kelly",
        slug: "criterio-de-kelly",
        shortDef: "Modelo de staking que dimensiona la apuesta según ventaja estimada y cuota.",
        fullDef: "En teoría maximiza el crecimiento de la banca, aunque muchos apostadores usan solo una fracción.",
        relatedIds: ["value-bet", "edge", "fractional-kelly"],
      },
    },
  },
  {
    id: "fractional-kelly",
    category: "bankroll",
    translations: {
      pt: {
        term: "Kelly fracionado",
        slug: "kelly-fracionado",
        shortDef: "Uso parcial do tamanho sugerido pelo critério de Kelly.",
        fullDef: "Reduz a agressividade do Kelly cheio e protege melhor a banca contra erro de estimação.",
        relatedIds: ["kelly-criterion", "variance", "drawdown"],
      },
      en: {
        term: "Fractional Kelly",
        slug: "fractional-kelly",
        shortDef: "Using only a fraction of the stake suggested by Kelly.",
        fullDef: "It reduces full-Kelly aggressiveness and protects better against estimation error.",
        relatedIds: ["kelly-criterion", "variance", "drawdown"],
      },
      es: {
        term: "Kelly fraccionado",
        slug: "kelly-fraccionado",
        shortDef: "Uso parcial del tamaño sugerido por Kelly.",
        fullDef: "Reduce la agresividad del Kelly completo y protege mejor frente al error de estimación.",
        relatedIds: ["kelly-criterion", "variance", "drawdown"],
      },
    },
  },
  {
    id: "drawdown",
    category: "bankroll",
    translations: {
      pt: {
        term: "Drawdown",
        slug: "drawdown",
        shortDef: "Queda acumulada da banca a partir de um pico anterior.",
        fullDef: "Mostra a profundidade das perdas antes da recuperação e é central para gestão de risco.",
        relatedIds: ["bankroll", "variance", "risk-of-ruin"],
      },
      en: {
        term: "Drawdown",
        slug: "drawdown",
        shortDef: "The decline in bankroll from a previous peak.",
        fullDef: "It shows the depth of losses before recovery and is central to risk management.",
        relatedIds: ["bankroll", "variance", "risk-of-ruin"],
      },
      es: {
        term: "Drawdown",
        slug: "drawdown",
        shortDef: "Caída acumulada de la banca desde un pico anterior.",
        fullDef: "Muestra la profundidad de las pérdidas antes de la recuperación y es central para la gestión de riesgo.",
        relatedIds: ["bankroll", "variance", "risk-of-ruin"],
      },
    },
  },
  {
    id: "risk-of-ruin",
    category: "bankroll",
    translations: {
      pt: {
        term: "Risco de ruína",
        slug: "risco-de-ruina",
        shortDef: "Probabilidade de quebrar a banca ou chegar a um nível crítico de capital.",
        fullDef: "Depende de edge, variância, tamanho de stake e disciplina de gestão.",
        relatedIds: ["bankroll", "drawdown", "kelly-criterion"],
      },
      en: {
        term: "Risk of ruin",
        slug: "risk-of-ruin",
        shortDef: "The probability of busting the bankroll or reaching a critical level.",
        fullDef: "It depends on edge, variance, stake sizing, and bankroll discipline.",
        relatedIds: ["bankroll", "drawdown", "kelly-criterion"],
      },
      es: {
        term: "Riesgo de ruina",
        slug: "riesgo-de-ruina",
        shortDef: "Probabilidad de quebrar la banca o llegar a un nivel crítico.",
        fullDef: "Depende del edge, la varianza, el tamaño de stake y la disciplina de gestión.",
        relatedIds: ["bankroll", "drawdown", "kelly-criterion"],
      },
    },
  },
  {
    id: "stop-loss",
    category: "bankroll",
    translations: {
      pt: {
        term: "Stop loss",
        slug: "stop-loss",
        shortDef: "Limite pré-definido de perda para encerrar ou reduzir exposição.",
        fullDef: "Em apostas funciona mais como disciplina operacional do que como trava automática de mercado.",
        relatedIds: ["bankroll", "drawdown", "flat-staking"],
      },
      en: {
        term: "Stop loss",
        slug: "stop-loss",
        shortDef: "A predefined loss limit used to stop or reduce exposure.",
        fullDef: "In betting it works more as an operating discipline than as an automatic market trigger.",
        relatedIds: ["bankroll", "drawdown", "flat-staking"],
      },
      es: {
        term: "Stop loss",
        slug: "stop-loss",
        shortDef: "Límite predefinido de pérdida para cortar o reducir exposición.",
        fullDef: "En apuestas funciona más como disciplina operativa que como disparador automático de mercado.",
        relatedIds: ["bankroll", "drawdown", "flat-staking"],
      },
    },
  },
  {
    id: "variance",
    category: "strategy",
    translations: {
      pt: {
        term: "Variância",
        slug: "variancia",
        shortDef: "Oscilação natural dos resultados no curto prazo.",
        fullDef: "Mesmo apostas com valor podem perder várias vezes seguidas por efeito de amostra curta.",
        relatedIds: ["expected-value", "sample-size", "bankroll"],
      },
      en: {
        term: "Variance",
        slug: "variance",
        shortDef: "The natural short-term fluctuation in results.",
        fullDef: "Even good value bets can lose many times in a row because of short-term sample noise.",
        relatedIds: ["expected-value", "sample-size", "bankroll"],
      },
      es: {
        term: "Varianza",
        slug: "varianza",
        shortDef: "Oscilación natural de los resultados en el corto plazo.",
        fullDef: "Incluso las apuestas con valor pueden perder muchas veces seguidas por efecto de muestra corta.",
        relatedIds: ["expected-value", "sample-size", "bankroll"],
      },
    },
  },
  {
    id: "sample-size",
    category: "strategy",
    translations: {
      pt: {
        term: "Tamanho de amostra",
        slug: "tamanho-de-amostra",
        shortDef: "Quantidade de apostas ou observações usada para avaliar desempenho.",
        fullDef: "Quanto menor a amostra, maior o risco de confundir variância com habilidade real.",
        relatedIds: ["variance", "roi", "calibration"],
      },
      en: {
        term: "Sample size",
        slug: "sample-size",
        shortDef: "The number of bets or observations used to evaluate performance.",
        fullDef: "The smaller the sample, the easier it is to confuse variance with real skill.",
        relatedIds: ["variance", "roi", "calibration"],
      },
      es: {
        term: "Tamaño de muestra",
        slug: "tamano-de-muestra",
        shortDef: "Cantidad de apuestas u observaciones usada para evaluar rendimiento.",
        fullDef: "Cuanto más pequeña sea la muestra, más fácil es confundir varianza con habilidad real.",
        relatedIds: ["variance", "roi", "calibration"],
      },
    },
  },
  {
    id: "roi",
    category: "strategy",
    translations: {
      pt: {
        term: "ROI",
        slug: "roi",
        shortDef: "Retorno sobre investimento em relação ao total apostado ou investido.",
        fullDef: "Resume quanto foi ganho ou perdido em proporção ao capital investido.",
        relatedIds: ["yield", "sample-size", "expected-value"],
      },
      en: {
        term: "ROI",
        slug: "roi",
        shortDef: "Return on investment relative to the amount staked or invested.",
        fullDef: "It summarizes how much was won or lost in proportion to invested capital.",
        relatedIds: ["yield", "sample-size", "expected-value"],
      },
      es: {
        term: "ROI",
        slug: "roi",
        shortDef: "Retorno sobre la inversión respecto al total apostado o invertido.",
        fullDef: "Resume cuánto se ganó o perdió en proporción al capital invertido.",
        relatedIds: ["yield", "sample-size", "expected-value"],
      },
    },
  },
  {
    id: "yield",
    category: "strategy",
    translations: {
      pt: {
        term: "Yield",
        slug: "yield",
        shortDef: "Lucro percentual em relação ao volume apostado.",
        fullDef: "Ajuda a comparar eficiência entre estratégias com volumes diferentes.",
        relatedIds: ["roi", "expected-value", "sample-size"],
      },
      en: {
        term: "Yield",
        slug: "yield",
        shortDef: "Profit percentage relative to staked volume.",
        fullDef: "It helps compare efficiency across strategies with different amounts of turnover.",
        relatedIds: ["roi", "expected-value", "sample-size"],
      },
      es: {
        term: "Yield",
        slug: "yield",
        shortDef: "Beneficio porcentual respecto al volumen apostado.",
        fullDef: "Ayuda a comparar eficiencia entre estrategias con distintos volúmenes de apuesta.",
        relatedIds: ["roi", "expected-value", "sample-size"],
      },
    },
  },
  {
    id: "hit-rate",
    category: "strategy",
    translations: {
      pt: {
        term: "Taxa de acerto",
        slug: "taxa-de-acerto",
        shortDef: "Percentual de apostas vencedoras dentro de uma amostra.",
        fullDef: "Sozinha pode enganar, porque odds médias diferentes exigem taxas de acerto diferentes para dar lucro.",
        relatedIds: ["roi", "sample-size", "expected-value"],
      },
      en: {
        term: "Hit rate",
        slug: "hit-rate",
        shortDef: "The percentage of winning bets in a sample.",
        fullDef: "On its own it can mislead, because different average odds require different win rates to be profitable.",
        relatedIds: ["roi", "sample-size", "expected-value"],
      },
      es: {
        term: "Tasa de acierto",
        slug: "tasa-de-acierto",
        shortDef: "Porcentaje de apuestas ganadas dentro de una muestra.",
        fullDef: "Por sí sola puede engañar, porque distintas cuotas medias exigen distintas tasas de acierto para ser rentables.",
        relatedIds: ["roi", "sample-size", "expected-value"],
      },
    },
  },
  {
    id: "calibration",
    category: "strategy",
    translations: {
      pt: {
        term: "Calibração",
        slug: "calibracao",
        shortDef: "Grau em que probabilidades previstas combinam com frequências observadas.",
        fullDef: "É essencial para confiar em probabilidades como base de precificação e comparação com o mercado.",
        relatedIds: ["true-probability", "brier-score", "log-loss"],
      },
      en: {
        term: "Calibration",
        slug: "calibration",
        shortDef: "How closely predicted probabilities match observed frequencies.",
        fullDef: "It is essential if you want to trust probabilities as a pricing input.",
        relatedIds: ["true-probability", "brier-score", "log-loss"],
      },
      es: {
        term: "Calibración",
        slug: "calibracion",
        shortDef: "Grado en que las probabilidades previstas coinciden con frecuencias observadas.",
        fullDef: "Es esencial si quieres confiar en las probabilidades como base de precio.",
        relatedIds: ["true-probability", "brier-score", "log-loss"],
      },
    },
  },
  {
    id: "log-loss",
    category: "strategy",
    translations: {
      pt: {
        term: "Log Loss",
        slug: "log-loss",
        shortDef: "Métrica que penaliza probabilidades confiantes e erradas de forma forte.",
        fullDef: "É usada para medir a qualidade de previsões probabilísticas, não apenas acerto simples.",
        relatedIds: ["calibration", "brier-score", "true-probability"],
      },
      en: {
        term: "Log loss",
        slug: "log-loss",
        shortDef: "A metric that heavily penalizes confident but wrong probabilities.",
        fullDef: "It is used to measure probability quality rather than simple hit rate.",
        relatedIds: ["calibration", "brier-score", "true-probability"],
      },
      es: {
        term: "Log Loss",
        slug: "log-loss",
        shortDef: "Métrica que penaliza con fuerza las probabilidades muy seguras pero erróneas.",
        fullDef: "Se usa para medir la calidad de la probabilidad y no solo el acierto simple.",
        relatedIds: ["calibration", "brier-score", "true-probability"],
      },
    },
  },
  {
    id: "brier-score",
    category: "strategy",
    translations: {
      pt: {
        term: "Brier Score",
        slug: "brier-score",
        shortDef: "Métrica de erro quadrático para previsões probabilísticas.",
        fullDef: "Quanto menor o valor, melhor tende a ser a qualidade média da previsão.",
        relatedIds: ["calibration", "log-loss", "true-probability"],
      },
      en: {
        term: "Brier score",
        slug: "brier-score",
        shortDef: "A quadratic error metric for probabilistic forecasts.",
        fullDef: "Lower values usually indicate better average forecast quality.",
        relatedIds: ["calibration", "log-loss", "true-probability"],
      },
      es: {
        term: "Brier Score",
        slug: "brier-score",
        shortDef: "Métrica de error cuadrático para pronósticos probabilísticos.",
        fullDef: "Cuanto menor es el valor, mejor suele ser la calidad media del pronóstico.",
        relatedIds: ["calibration", "log-loss", "true-probability"],
      },
    },
  },
  {
    id: "back-lay",
    category: "markets",
    translations: {
      pt: {
        term: "Back e Lay",
        slug: "back-e-lay",
        shortDef: "Operações típicas de exchange: apostar a favor ou contra um resultado.",
        fullDef: "São conceitos centrais em exchanges e em estratégias de trading leve.",
        relatedIds: ["trading-out", "liquidity", "commission"],
      },
      en: {
        term: "Back and lay",
        slug: "back-and-lay",
        shortDef: "Typical exchange actions: betting for or against an outcome.",
        fullDef: "They are core concepts in exchanges and light trading strategies.",
        relatedIds: ["trading-out", "liquidity", "commission"],
      },
      es: {
        term: "Back y Lay",
        slug: "back-y-lay",
        shortDef: "Operaciones típicas de exchange: apostar a favor o en contra de un resultado.",
        fullDef: "Son conceptos centrales en exchanges y estrategias de trading ligero.",
        relatedIds: ["trading-out", "liquidity", "commission"],
      },
    },
  },
  {
    id: "commission",
    category: "markets",
    translations: {
      pt: {
        term: "Comissão",
        slug: "comissao",
        shortDef: "Taxa cobrada pela exchange sobre o lucro das operações.",
        fullDef: "Precisa entrar no cálculo da odd justa e do EV porque reduz o retorno real.",
        relatedIds: ["back-lay", "fair-odds", "expected-value"],
      },
      en: {
        term: "Commission",
        slug: "commission",
        shortDef: "The fee charged by an exchange on winning trades or bets.",
        fullDef: "It must be included in fair-odds and EV calculations because it reduces real return.",
        relatedIds: ["back-lay", "fair-odds", "expected-value"],
      },
      es: {
        term: "Comisión",
        slug: "comision",
        shortDef: "Tasa cobrada por la exchange sobre el beneficio de las operaciones.",
        fullDef: "Debe entrar en el cálculo de cuota justa y EV porque reduce el retorno real.",
        relatedIds: ["back-lay", "fair-odds", "expected-value"],
      },
    },
  },
  {
    id: "liquidity",
    category: "markets",
    translations: {
      pt: {
        term: "Liquidez",
        slug: "liquidez",
        shortDef: "Volume disponível para casar apostas sem distorcer muito o preço.",
        fullDef: "Mercados líquidos aceitam stakes maiores, spreads menores e execução mais estável.",
        relatedIds: ["back-lay", "steam-move", "trading-out"],
      },
      en: {
        term: "Liquidity",
        slug: "liquidity",
        shortDef: "The available volume that can be matched without moving price too much.",
        fullDef: "Liquid markets support larger stakes, tighter spreads, and more stable execution.",
        relatedIds: ["back-lay", "steam-move", "trading-out"],
      },
      es: {
        term: "Liquidez",
        slug: "liquidez",
        shortDef: "Volumen disponible para casar apuestas sin mover demasiado el precio.",
        fullDef: "Los mercados líquidos aceptan stakes mayores, spreads más estrechos y ejecución más estable.",
        relatedIds: ["back-lay", "steam-move", "trading-out"],
      },
    },
  },
  {
    id: "market-depth",
    category: "markets",
    translations: {
      pt: {
        term: "Profundidade de mercado",
        slug: "profundidade-de-mercado",
        shortDef: "Distribuição de ofertas e volumes em diferentes preços de um mercado.",
        fullDef: "Ajuda a entender se sua stake será executada facilmente ou se o preço pode escapar.",
        relatedIds: ["liquidity", "back-lay", "trading-out"],
      },
      en: {
        term: "Market depth",
        slug: "market-depth",
        shortDef: "The distribution of offers and volume across different prices in a market.",
        fullDef: "It helps you judge whether your stake will execute smoothly or whether price may slip away.",
        relatedIds: ["liquidity", "back-lay", "trading-out"],
      },
      es: {
        term: "Profundidad de mercado",
        slug: "profundidad-de-mercado",
        shortDef: "Distribución de ofertas y volumen en distintos precios de un mercado.",
        fullDef: "Ayuda a entender si tu stake se ejecutará con facilidad o si el precio puede escaparse.",
        relatedIds: ["liquidity", "back-lay", "trading-out"],
      },
    },
  },
  {
    id: "trading-out",
    category: "strategy",
    translations: {
      pt: {
        term: "Trading out",
        slug: "trading-out",
        shortDef: "Fechamento parcial ou total de uma posição antes do evento terminar.",
        fullDef: "É usado para travar lucro, reduzir risco ou limitar perda aproveitando movimento de preço.",
        relatedIds: ["back-lay", "cash-out", "liquidity"],
      },
      en: {
        term: "Trading out",
        slug: "trading-out",
        shortDef: "Closing part or all of a position before the event ends.",
        fullDef: "It is used to lock profit, reduce risk, or cap losses by taking advantage of price movement.",
        relatedIds: ["back-lay", "cash-out", "liquidity"],
      },
      es: {
        term: "Trading out",
        slug: "trading-out",
        shortDef: "Cierre parcial o total de una posición antes de que termine el evento.",
        fullDef: "Se usa para asegurar beneficio, reducir riesgo o limitar pérdidas aprovechando el movimiento del precio.",
        relatedIds: ["back-lay", "cash-out", "liquidity"],
      },
    },
  },
  {
    id: "cash-out",
    category: "strategy",
    translations: {
      pt: {
        term: "Cash out",
        slug: "cash-out",
        shortDef: "Encerramento antecipado da aposta por oferta automática da plataforma.",
        fullDef: "Pode ajudar no controle de risco, mas normalmente embute custo adicional na precificação.",
        relatedIds: ["trading-out", "expected-value", "line-movement"],
      },
      en: {
        term: "Cash out",
        slug: "cash-out",
        shortDef: "An early settlement option automatically offered by the platform.",
        fullDef: "It can help with risk control, but it usually carries extra hidden cost in the price.",
        relatedIds: ["trading-out", "expected-value", "line-movement"],
      },
      es: {
        term: "Cash out",
        slug: "cash-out",
        shortDef: "Cierre anticipado de la apuesta mediante oferta automática de la plataforma.",
        fullDef: "Puede ayudar a controlar riesgo, pero normalmente incorpora coste oculto en el precio.",
        relatedIds: ["trading-out", "expected-value", "line-movement"],
      },
    },
  },
  {
    id: "price-sensitivity",
    category: "strategy",
    translations: {
      pt: {
        term: "Sensibilidade ao preço",
        slug: "sensibilidade-ao-preco",
        shortDef: "Impacto que pequenas mudanças de odd têm sobre o valor esperado.",
        fullDef: "Ajuda a definir até onde aceitar preço pior e quando vale passar da entrada.",
        relatedIds: ["edge", "fair-odds", "line-shopping"],
      },
      en: {
        term: "Price sensitivity",
        slug: "price-sensitivity",
        shortDef: "How much small odds changes affect expected value.",
        fullDef: "It helps define how far price can move before the bet stops being attractive.",
        relatedIds: ["edge", "fair-odds", "line-shopping"],
      },
      es: {
        term: "Sensibilidad al precio",
        slug: "sensibilidad-al-precio",
        shortDef: "Impacto que pequeños cambios de cuota tienen sobre el valor esperado.",
        fullDef: "Ayuda a definir hasta dónde aceptar un precio peor y cuándo conviene pasar.",
        relatedIds: ["edge", "fair-odds", "line-shopping"],
      },
    },
  },
  {
    id: "arbitrage",
    category: "strategy",
    translations: {
      pt: {
        term: "Arbitragem",
        slug: "arbitragem",
        shortDef: "Estratégia de cobrir todos os resultados com lucro teórico garantido.",
        fullDef: "A arbitragem acontece quando diferenças de preço entre casas ou mercados permitem distribuir stakes de forma que qualquer desfecho gere retorno positivo ou neutro.",
        relatedIds: ["line-shopping", "hold", "stake-limit"],
      },
      en: {
        term: "Arbitrage",
        slug: "arbitrage",
        shortDef: "A strategy that covers all outcomes for a theoretical guaranteed profit.",
        fullDef: "Arbitrage happens when price differences across books or markets let you distribute stakes so that every outcome produces a positive or neutral return.",
        relatedIds: ["line-shopping", "hold", "stake-limit"],
      },
      es: {
        term: "Arbitraje",
        slug: "arbitraje",
        shortDef: "Estrategia de cubrir todos los resultados con beneficio teórico garantizado.",
        fullDef: "El arbitraje ocurre cuando diferencias de precio entre casas o mercados permiten repartir stakes de forma que cualquier resultado deje retorno positivo o neutro.",
        relatedIds: ["line-shopping", "hold", "stake-limit"],
      },
    },
  },
  {
    id: "middling",
    category: "strategy",
    translations: {
      pt: {
        term: "Middling",
        slug: "middling",
        shortDef: "Estratégia de pegar lados opostos em linhas diferentes tentando acertar os dois.",
        fullDef: "O middling surge quando a linha se move e permite entrar nos dois lados com números diferentes. Em alguns placares, ambas as apostas vencem; em outros, uma vence e a outra perde ou é devolvida.",
        relatedIds: ["line-movement", "asian-handicap", "arbitrage"],
      },
      en: {
        term: "Middling",
        slug: "middling",
        shortDef: "A strategy of taking opposite sides at different lines while trying to hit both.",
        fullDef: "Middling appears when the line moves and lets you bet both sides at different numbers. On some scores, both bets win; on others, one wins while the other loses or pushes.",
        relatedIds: ["line-movement", "asian-handicap", "arbitrage"],
      },
      es: {
        term: "Middling",
        slug: "middling",
        shortDef: "Estrategia de tomar lados opuestos en líneas distintas buscando acertar ambas.",
        fullDef: "El middling aparece cuando la línea se mueve y te permite entrar en ambos lados con números diferentes. En algunos marcadores ganan ambas apuestas; en otros, una gana y la otra pierde o hace push.",
        relatedIds: ["line-movement", "asian-handicap", "arbitrage"],
      },
    },
  },
  {
    id: "stake-limit",
    category: "bankroll",
    translations: {
      pt: {
        term: "Limite de stake",
        slug: "limite-de-stake",
        shortDef: "Valor máximo aceito por uma casa ou exchange em determinada aposta.",
        fullDef: "O limite de stake pode variar por mercado, perfil de conta, liquidez e momento do evento. Ele afeta execução, escalabilidade e até a viabilidade de arbitragem.",
        relatedIds: ["bankroll", "liquidity", "arbitrage"],
      },
      en: {
        term: "Stake limit",
        slug: "stake-limit",
        shortDef: "The maximum amount accepted by a book or exchange on a given bet.",
        fullDef: "Stake limits can vary by market, account profile, liquidity, and event timing. They affect execution, scalability, and even the viability of arbitrage.",
        relatedIds: ["bankroll", "liquidity", "arbitrage"],
      },
      es: {
        term: "Límite de stake",
        slug: "limite-de-stake",
        shortDef: "Importe máximo aceptado por una casa o exchange en una apuesta concreta.",
        fullDef: "El límite de stake puede variar según mercado, perfil de cuenta, liquidez y momento del evento. Afecta ejecución, escalabilidad e incluso la viabilidad del arbitraje.",
        relatedIds: ["bankroll", "liquidity", "arbitrage"],
      },
    },
  },
  {
    id: "sharp-money",
    category: "markets",
    translations: {
      pt: {
        term: "Sharp money",
        slug: "sharp-money",
        shortDef: "Volume associado a apostadores ou grupos considerados mais informados.",
        fullDef: "Sharp money é o dinheiro que o mercado tende a respeitar mais, porque costuma vir de perfis que batem linha com consistência. Nem todo movimento é sharp, mas muitos ajustes fortes são atribuídos a esse tipo de entrada.",
        relatedIds: ["line-movement", "steam-move", "public-money"],
      },
      en: {
        term: "Sharp money",
        slug: "sharp-money",
        shortDef: "Betting volume associated with more informed or respected players.",
        fullDef: "Sharp money is the action the market tends to respect more, because it often comes from profiles that beat prices consistently. Not every move is sharp, but many strong adjustments are linked to this type of action.",
        relatedIds: ["line-movement", "steam-move", "public-money"],
      },
      es: {
        term: "Sharp money",
        slug: "sharp-money",
        shortDef: "Volumen asociado a apostadores o grupos considerados más informados.",
        fullDef: "Sharp money es el dinero que el mercado suele respetar más, porque normalmente viene de perfiles que baten líneas con consistencia. No todo movimiento es sharp, pero muchos ajustes fuertes se atribuyen a este tipo de entrada.",
        relatedIds: ["line-movement", "steam-move", "public-money"],
      },
    },
  },
  {
    id: "public-money",
    category: "markets",
    translations: {
      pt: {
        term: "Public money",
        slug: "public-money",
        shortDef: "Volume vindo do público geral, normalmente menos disciplinado em preço.",
        fullDef: "Public money representa o fluxo mais recreativo do mercado. Em alguns eventos muito populares, esse dinheiro pode pressionar linhas por narrativa, favoritismo ou viés emocional.",
        relatedIds: ["sharp-money", "line-movement", "market-efficiency"],
      },
      en: {
        term: "Public money",
        slug: "public-money",
        shortDef: "Betting volume coming from the general public, often less price-disciplined.",
        fullDef: "Public money represents the more recreational side of the market. In major events, it can push lines because of narratives, favoritism, or emotional bias.",
        relatedIds: ["sharp-money", "line-movement", "market-efficiency"],
      },
      es: {
        term: "Public money",
        slug: "public-money",
        shortDef: "Volumen procedente del público general, normalmente menos disciplinado con el precio.",
        fullDef: "Public money representa el flujo más recreativo del mercado. En eventos populares, puede empujar líneas por narrativa, favoritismo o sesgo emocional.",
        relatedIds: ["sharp-money", "line-movement", "market-efficiency"],
      },
    },
  },
  {
    id: "hold",
    category: "odds",
    translations: {
      pt: {
        term: "Hold",
        slug: "hold",
        shortDef: "Margem operacional que a casa retém em um mercado.",
        fullDef: "Hold é a parcela teórica que fica com a casa após a estrutura de preços do mercado. Na prática, ele é uma leitura operacional próxima da margem embutida e ajuda a comparar mercados mais ou menos caros.",
        relatedIds: ["overround", "fair-odds", "arbitrage"],
      },
      en: {
        term: "Hold",
        slug: "hold",
        shortDef: "The operating margin a sportsbook keeps in a market.",
        fullDef: "Hold is the theoretical share the sportsbook keeps from a market’s pricing structure. In practice, it is closely related to built-in margin and helps compare cheaper or more expensive markets.",
        relatedIds: ["overround", "fair-odds", "arbitrage"],
      },
      es: {
        term: "Hold",
        slug: "hold",
        shortDef: "Margen operativo que la casa retiene en un mercado.",
        fullDef: "El hold es la parte teórica que conserva la casa por la estructura de precios del mercado. En la práctica está muy ligado al margen embebido y ayuda a comparar mercados más caros o más baratos.",
        relatedIds: ["overround", "fair-odds", "arbitrage"],
      },
    },
  },
  {
    id: "market-efficiency",
    category: "strategy",
    translations: {
      pt: {
        term: "Eficiência de mercado",
        slug: "eficiencia-de-mercado",
        shortDef: "Grau em que as odds refletem rapidamente a informação disponível.",
        fullDef: "Quanto mais eficiente o mercado, menor tende a ser o espaço para encontrar preços muito errados. Mercados líquidos e maduros costumam corrigir distorções mais rápido.",
        relatedIds: ["line-movement", "sharp-money", "edge"],
      },
      en: {
        term: "Market efficiency",
        slug: "market-efficiency",
        shortDef: "The degree to which odds quickly reflect available information.",
        fullDef: "The more efficient the market, the less room there is to find badly priced odds. Liquid and mature markets usually correct distortions faster.",
        relatedIds: ["line-movement", "sharp-money", "edge"],
      },
      es: {
        term: "Eficiencia de mercado",
        slug: "eficiencia-de-mercado",
        shortDef: "Grado en que las cuotas reflejan rápidamente la información disponible.",
        fullDef: "Cuanto más eficiente es el mercado, menos espacio hay para encontrar precios muy mal ajustados. Los mercados líquidos y maduros suelen corregir distorsiones más rápido.",
        relatedIds: ["line-movement", "sharp-money", "edge"],
      },
    },
  },
  {
    id: "correlation",
    category: "strategy",
    translations: {
      pt: {
        term: "Correlação",
        slug: "correlacao",
        shortDef: "Relação entre eventos ou mercados que tendem a acontecer juntos.",
        fullDef: "Correlação é importante porque mercados aparentemente diferentes podem depender da mesma dinâmica de jogo. Ignorá-la pode distorcer avaliação de múltiplas, same game parlays e exposição total.",
        relatedIds: ["same-game-parlay", "expected-value", "price-sensitivity"],
      },
      en: {
        term: "Correlation",
        slug: "correlation",
        shortDef: "A relationship between events or markets that tend to occur together.",
        fullDef: "Correlation matters because seemingly different markets may depend on the same game dynamic. Ignoring it can distort the evaluation of parlays, same-game parlays, and total exposure.",
        relatedIds: ["same-game-parlay", "expected-value", "price-sensitivity"],
      },
      es: {
        term: "Correlación",
        slug: "correlacion",
        shortDef: "Relación entre eventos o mercados que tienden a ocurrir juntos.",
        fullDef: "La correlación importa porque mercados aparentemente distintos pueden depender de la misma dinámica de partido. Ignorarla puede distorsionar la evaluación de combinadas, same game parlays y la exposición total.",
        relatedIds: ["same-game-parlay", "expected-value", "price-sensitivity"],
      },
    },
  },
  {
    id: "expected-goals",
    category: "strategy",
    translations: {
      pt: {
        term: "Expected goals (xG)",
        slug: "expected-goals",
        shortDef: "Métrica que estima a qualidade das chances criadas e concedidas.",
        fullDef: "Expected goals, ou xG, atribui probabilidade a cada finalização com base em contexto como posição, tipo de assistência e ângulo. É útil para análise de performance além do placar bruto.",
        relatedIds: ["model-probability", "calibration", "true-probability"],
      },
      en: {
        term: "Expected goals (xG)",
        slug: "expected-goals",
        shortDef: "A metric that estimates the quality of chances created and conceded.",
        fullDef: "Expected goals, or xG, assigns probability to each shot based on context such as location, assist type, and angle. It is useful for evaluating performance beyond the raw scoreline.",
        relatedIds: ["model-probability", "calibration", "true-probability"],
      },
      es: {
        term: "Expected goals (xG)",
        slug: "expected-goals",
        shortDef: "Métrica que estima la calidad de las ocasiones creadas y concedidas.",
        fullDef: "Expected goals, o xG, asigna probabilidad a cada disparo según contexto como posición, tipo de asistencia y ángulo. Es útil para analizar rendimiento más allá del marcador bruto.",
        relatedIds: ["model-probability", "calibration", "true-probability"],
      },
    },
  },
  {
    id: "liability",
    category: "markets",
    translations: {
      pt: {
        term: "Liability",
        slug: "liability",
        shortDef: "Perda máxima potencial ao fazer lay em uma exchange.",
        fullDef: "Na aposta lay, a liability é o valor que você pode perder se o resultado contra o qual apostou acontecer. Ela é central para entender risco real em exchanges.",
        relatedIds: ["back-lay", "commission", "bankroll"],
      },
      en: {
        term: "Liability",
        slug: "liability",
        shortDef: "The maximum potential loss when placing a lay bet on an exchange.",
        fullDef: "In a lay bet, liability is the amount you can lose if the outcome you opposed actually happens. It is central to understanding real exchange risk.",
        relatedIds: ["back-lay", "commission", "bankroll"],
      },
      es: {
        term: "Liability",
        slug: "liability",
        shortDef: "La pérdida máxima potencial al hacer lay en una exchange.",
        fullDef: "En una apuesta lay, la liability es el importe que puedes perder si ocurre el resultado contra el que apostaste. Es clave para entender el riesgo real en exchanges.",
        relatedIds: ["back-lay", "commission", "bankroll"],
      },
    },
  }
];

export function getGlossaryTerms(lang: Lang) {
  return GLOSSARY_TERMS.map((term) => ({
    id: term.id,
    category: term.category,
    ...term.translations[lang],
  }));
}

export function getGlossaryTermBySlug(lang: Lang, slug: string) {
  const found = GLOSSARY_TERMS.find(
    (term) => term.translations[lang].slug === slug
  );

  if (!found) return null;

  return {
    id: found.id,
    category: found.category,
    ...found.translations[lang],
  };
}

export function getGlossaryTermById(lang: Lang, id: string) {
  const found = GLOSSARY_TERMS.find((term) => term.id === id);
  if (!found) return null;

  return {
    id: found.id,
    category: found.category,
    ...found.translations[lang],
  };
}