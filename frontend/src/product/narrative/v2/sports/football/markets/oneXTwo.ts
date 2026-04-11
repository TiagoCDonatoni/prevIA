import type { Lang } from "../../../../../i18n";
import type { NarrativeProfile } from "../../../core/profiles";
import type {
  Narrative1x2Odds,
  Narrative1x2Probs,
  NarrativeBlock,
  NarrativeResponse,
  NarrativeStyleId,
  SportNarrativeRequest,
} from "../../../core/types";
import { pickVariant } from "../../../core/selectors";

type OutcomeKey = "H" | "D" | "A";
type StrengthLevel = "balanced" | "slight" | "moderate" | "relevant" | "strong" | "clear";
type ConfidenceLevel = "low" | "medium" | "high";
type DrawPressure = "low" | "medium" | "high";

type PriceEval = {
  outcome: OutcomeKey;
  edge: number;
  fairOdd: number | null;
  marketOdd: number | null;
  tag: "GOOD" | "ALIGNED" | "BAD";
};

type OneXTwoState = {
  dominant: OutcomeKey | null;
  topP: number;
  margin: number;
  strength: StrengthLevel;
  drawPressure: DrawPressure;
};

function pct(x: number) {
  return Math.round(x * 100);
}

function safeOdd(x: unknown): number | null {
  const value = typeof x === "number" ? x : x == null ? null : Number(x);
  if (value == null || !Number.isFinite(value) || value <= 1.0001) return null;
  return value;
}

function impliedProbFromOdd(odd: number | null): number | null {
  if (odd == null) return null;
  return 1 / odd;
}

function fairOddFromProb(prob: number | null): number | null {
  if (prob == null || !Number.isFinite(prob) || prob <= 0.0001) return null;
  return 1 / prob;
}

function confidenceFromStatus(status?: string | null): ConfidenceLevel {
  const raw = String(status ?? "").toUpperCase();
  if (raw === "EXACT") return "high";
  if (raw === "PROBABLE" || raw === "MODEL_FOUND") return "medium";
  return "low";
}

function collapseStrength(
  strength: StrengthLevel,
  levels: NarrativeProfile["strengthLevels1x2"]
): StrengthLevel {
  if (levels.includes(strength)) return strength;
  if (strength === "moderate") return levels.includes("slight") ? "slight" : "relevant";
  if (strength === "strong") return levels.includes("relevant") ? "relevant" : "clear";
  return levels[levels.length - 1] ?? "slight";
}

function pickState(probs?: Narrative1x2Probs | null): OneXTwoState | null {
  if (!probs) return null;

  const entries: Array<[OutcomeKey, number]> = [
    ["H", probs.H],
    ["D", probs.D],
    ["A", probs.A],
  ];
  entries.sort((a, b) => b[1] - a[1]);

  const dominant = entries[0]?.[0] ?? null;
  const topP = entries[0]?.[1] ?? 0;
  const secondP = entries[1]?.[1] ?? 0;
  const margin = topP - secondP;
  const drawP = probs.D;

  let strength: StrengthLevel = "balanced";
  if (topP < 0.4 || margin < 0.035) strength = "balanced";
  else if (topP < 0.47 || margin < 0.07) strength = "slight";
  else if (topP < 0.52 || margin < 0.11) strength = "moderate";
  else if (topP < 0.57 || margin < 0.16) strength = "relevant";
  else if (topP < 0.62 || margin < 0.22) strength = "strong";
  else strength = "clear";

  const drawPressure: DrawPressure =
    drawP >= 0.31 ? "high" : drawP >= 0.26 ? "medium" : "low";

  return { dominant, topP, margin, strength, drawPressure };
}

function evaluatePrices(
  probs: Narrative1x2Probs | null | undefined,
  odds: Narrative1x2Odds | null | undefined
): PriceEval[] {
  if (!probs || !odds) return [];

  return (["H", "D", "A"] as const)
    .map((outcome) => {
      const marketOdd = safeOdd(odds[outcome]);
      const marketProb = impliedProbFromOdd(marketOdd);
      if (marketProb == null) return null;

      const edge = probs[outcome] - marketProb;
      const fairOdd = fairOddFromProb(probs[outcome]);
      const tag: PriceEval["tag"] =
        edge >= 0.02 ? "GOOD" : edge <= -0.02 ? "BAD" : "ALIGNED";

      return {
        outcome,
        edge,
        fairOdd,
        marketOdd,
        tag,
      } satisfies PriceEval;
    })
    .filter((item): item is PriceEval => !!item);
}

function pickPrice(
  probs: Narrative1x2Probs | null | undefined,
  odds: Narrative1x2Odds | null | undefined,
  dominant: OutcomeKey | null
): PriceEval | null {
  const prices = evaluatePrices(probs, odds);
  if (!prices.length) return null;

  if (dominant) {
    const dominantPrice = prices.find((item) => item.outcome === dominant);
    if (dominantPrice) return dominantPrice;
  }

  const bestPositive = [...prices].sort((a, b) => b.edge - a.edge)[0] ?? null;
  if ((bestPositive?.edge ?? -1) > 0) return bestPositive;

  return [...prices].sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))[0] ?? null;
}

function langText(lang: Lang, pt: string, en: string, es: string) {
  if (lang === "en") return en;
  if (lang === "es") return es;
  return pt;
}

function interpolate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] == null ? `{${key}}` : String(vars[key])
  );
}

function choose(
  seed: string,
  options: string[],
  maxVariants: number,
  vars: Record<string, string | number>
) {
  return interpolate(pickVariant(options, seed, maxVariants), vars);
}

function applySummaryTone(
  lang: Lang,
  style: NarrativeStyleId | null,
  text: string
) {
  if (style === "leve") {
    return langText(
      lang,
      `Leitura leve: ${text}`,
      `Lighter read: ${text}`,
      `Lectura ligera: ${text}`
    );
  }

  if (style === "equilibrado") {
    return langText(
      lang,
      `Leitura estruturada: ${text}`,
      `Structured read: ${text}`,
      `Lectura estructurada: ${text}`
    );
  }

  if (style === "pro") {
    return langText(
      lang,
      `Recorte editorial: ${text}`,
      `Editorial angle: ${text}`,
      `Enfoque editorial: ${text}`
    );
  }

  return text;
}

function describeOutcome(lang: Lang, outcome: OutcomeKey, home: string, away: string) {
  if (lang === "en") {
    if (outcome === "H") return `home (${home})`;
    if (outcome === "A") return `away (${away})`;
    return "draw";
  }
  if (lang === "es") {
    if (outcome === "H") return `local (${home})`;
    if (outcome === "A") return `visitante (${away})`;
    return "empate";
  }
  if (outcome === "H") return `casa (${home})`;
  if (outcome === "A") return `fora (${away})`;
  return "empate";
}

function balancedHeadlineOptions(lang: Lang) {
  return [
    langText(
      lang,
      "Jogo bem aberto, sem um favorito tão claro.",
      "This looks like an open game, without a clear favorite.",
      "Pinta de partido abierto, sin un favorito demasiado claro."
    ),
    langText(
      lang,
      "O confronto parece equilibrado e sem muita distância entre os cenários.",
      "The matchup looks balanced, with little distance between outcomes.",
      "El cruce luce equilibrado y con poca distancia entre escenarios."
    ),
    langText(
      lang,
      "Aqui o jogo parece mais parelho do que decidido.",
      "This one looks more even than settled.",
      "Aquí el partido parece más parejo que resuelto."
    ),
  ];
}

function sideHeadlineOptions(
  lang: Lang,
  dominant: OutcomeKey,
  strength: Exclude<StrengthLevel, "balanced">,
  home: string,
  away: string
) {
  const side = dominant === "H" ? home : dominant === "A" ? away : null;

  if (dominant === "D") {
    const pt: Record<typeof strength, string[]> = {
      slight: [
        "O empate aparece bastante no radar deste jogo.",
        "O empate segue bem vivo por aqui.",
      ],
      moderate: [
        "O empate até aparece um pouco melhor neste confronto.",
        "Os números deixam o empate com uma cara interessante aqui.",
      ],
      relevant: [
        "O empate ganha força e merece bastante atenção.",
        "Neste jogo, o empate vira um caminho bem respeitável.",
      ],
      strong: [
        "O empate vem forte neste confronto.",
        "Os números colocam o empate bem no centro da leitura aqui.",
      ],
      clear: [
        "O empate é o cenário que mais chama atenção aqui.",
        "Entre os caminhos do 1x2, o empate é o que aparece melhor neste jogo.",
      ],
    };

    const en: Record<typeof strength, string[]> = {
      slight: [
        "The draw is very much on the radar here.",
        "The draw stays very live in this matchup.",
      ],
      moderate: [
        "The draw even looks a bit better in this game.",
        "The numbers give the draw a decent look here.",
      ],
      relevant: [
        "The draw gains strength and deserves real attention.",
        "In this one, the draw becomes a very respectable path.",
      ],
      strong: [
        "The draw comes in strong for this matchup.",
        "The numbers place the draw right at the center of the read here.",
      ],
      clear: [
        "The draw is the outcome that stands out the most here.",
        "Among the 1x2 outcomes, the draw is the one that shows up best.",
      ],
    };

    const es: Record<typeof strength, string[]> = {
      slight: [
        "El empate aparece bastante en el radar de este partido.",
        "El empate sigue muy vivo por aquí.",
      ],
      moderate: [
        "El empate incluso luce un poco mejor en este cruce.",
        "Los números le dan al empate una pinta interesante aquí.",
      ],
      relevant: [
        "El empate gana fuerza y merece bastante atención.",
        "En este partido, el empate se vuelve un camino muy respetable.",
      ],
      strong: [
        "El empate viene fuerte en este encuentro.",
        "Los números colocan al empate en el centro de la lectura aquí.",
      ],
      clear: [
        "El empate es el resultado que más llama la atención aquí.",
        "Entre los caminos del 1x2, el empate es el que mejor aparece en este partido.",
      ],
    };

    if (lang === "en") return en[strength];
    if (lang === "es") return es[strength];
    return pt[strength];
  }

  const pt: Record<typeof strength, string[]> = {
    slight: [
      `${side} aparece um pouco melhor aqui.`,
      `Há uma leve vantagem para ${side} neste jogo.`,
    ],
    moderate: [
      `${side} chega com uma vantagem razoável, mas sem sobrar.`,
      `${side} vem na frente, embora o jogo siga bem aberto.`,
    ],
    relevant: [
      `${side} aparece melhor e merece respeito neste confronto.`,
      `${side} puxa a leitura principal deste jogo.`,
    ],
    strong: [
      `${side} entra como favorito mais nítido aqui.`,
      `${side} é o lado que mais convence neste confronto.`,
    ],
    clear: [
      `${side} é o lado mais forte do jogo.`,
      `${side} aparece com bastante força neste confronto.`,
    ],
  };

  const en: Record<typeof strength, string[]> = {
    slight: [
      `${side} looks a bit better here.`,
      `There is a slight edge toward ${side} in this game.`,
    ],
    moderate: [
      `${side} comes in with a fair edge, but not by much.`,
      `${side} is ahead, though the game still feels quite open.`,
    ],
    relevant: [
      `${side} looks better and deserves respect in this matchup.`,
      `${side} leads the main read for this game.`,
    ],
    strong: [
      `${side} comes in as the more obvious favorite here.`,
      `${side} is the side that makes the strongest case in this matchup.`,
    ],
    clear: [
      `${side} is the strongest side in this game.`,
      `${side} shows up with real strength in this matchup.`,
    ],
  };

  const es: Record<typeof strength, string[]> = {
    slight: [
      `${side} aparece un poco mejor aquí.`,
      `Hay una leve ventaja para ${side} en este partido.`,
    ],
    moderate: [
      `${side} llega con una ventaja razonable, pero sin sobrar.`,
      `${side} viene por delante, aunque el partido sigue bastante abierto.`,
    ],
    relevant: [
      `${side} aparece mejor y merece respeto en este cruce.`,
      `${side} lidera la lectura principal de este partido.`,
    ],
    strong: [
      `${side} entra como favorito más claro aquí.`,
      `${side} es el lado que más convence en este encuentro.`,
    ],
    clear: [
      `${side} es el lado más fuerte del partido.`,
      `${side} aparece con bastante fuerza en este cruce.`,
    ],
  };

  if (lang === "en") return en[strength];
  if (lang === "es") return es[strength];
  return pt[strength];
}

function summaryOptions(
  lang: Lang,
  balanced: boolean,
  confidence: ConfidenceLevel,
  dominantPct: number
) {
  const pctText = `${dominantPct}%`;

  if (balanced) {
    const pt: Record<ConfidenceLevel, string[]> = {
      high: [
        "Mesmo com um sinal estável do modelo, o jogo segue equilibrado demais para apontar um lado com segurança.",
        "Os números até se organizam bem, mas continuam mostrando um confronto bem parelho.",
      ],
      medium: [
        "Tem uma direção ali, mas ainda não com distância suficiente para falar em lado claro.",
        "É um daqueles jogos em que vale mais respeitar o equilíbrio do que forçar uma certeza.",
      ],
      low: [
        "Com a confiança mais baixa, o equilíbrio deste jogo pesa ainda mais.",
        "O confronto já parecia aberto, e a confiança limitada reforça essa cautela.",
      ],
    };

    const en: Record<ConfidenceLevel, string[]> = {
      high: [
        "Even with a stable model signal, the game still looks too balanced for a firm side.",
        "The numbers are orderly, but they still point to a very even matchup.",
      ],
      medium: [
        "There is some direction there, but not enough distance to call a clear side.",
        "This is one of those games where respecting the balance matters more than forcing certainty.",
      ],
      low: [
        "With lower confidence, the balance of this game matters even more.",
        "The matchup already looked open, and limited confidence only reinforces that caution.",
      ],
    };

    const es: Record<ConfidenceLevel, string[]> = {
      high: [
        "Incluso con una señal estable del modelo, el partido sigue demasiado equilibrado para marcar un lado con firmeza.",
        "Los números se ordenan bien, pero siguen mostrando un cruce muy parejo.",
      ],
      medium: [
        "Hay cierta dirección, pero todavía sin distancia suficiente para hablar de un lado claro.",
        "Es uno de esos partidos donde conviene respetar el equilibrio antes que forzar una certeza.",
      ],
      low: [
        "Con una confianza más baja, el equilibrio de este partido pesa todavía más.",
        "El cruce ya parecía abierto, y la confianza limitada refuerza esa cautela.",
      ],
    };

    if (lang === "en") return en[confidence];
    if (lang === "es") return es[confidence];
    return pt[confidence];
  }

  const pt: Record<ConfidenceLevel, string[]> = {
    high: [
      `Hoje o lado principal aparece perto de ${pctText}, com números relativamente firmes por trás.`,
      `Os números deixam o caminho principal em torno de ${pctText}, com uma base mais estável.`,
    ],
    medium: [
      `O lado que lidera o jogo gira perto de ${pctText}, mas ainda sem transformar isso em passeio.`,
      `A vantagem principal fica por volta de ${pctText}, ainda com espaço para o resto do jogo reagir.`,
    ],
    low: [
      `O lado principal aparece perto de ${pctText}, mas ainda com uma dose boa de incerteza.`,
      `Tem um lado na frente perto de ${pctText}, só que a confiança aqui pede mais calma.`,
    ],
  };

  const en: Record<ConfidenceLevel, string[]> = {
    high: [
      `Today the main side shows up near ${pctText}, with fairly solid numbers behind it.`,
      `The numbers place the main path around ${pctText}, with a steadier base underneath.`,
    ],
    medium: [
      `The leading side sits near ${pctText}, but not enough to call this a runaway spot.`,
      `The main edge is around ${pctText}, still with room for the rest of the game to push back.`,
    ],
    low: [
      `The main side shows up near ${pctText}, but still with a fair amount of uncertainty.`,
      `There is a side ahead near ${pctText}, though confidence here asks for a calmer read.`,
    ],
  };

  const es: Record<ConfidenceLevel, string[]> = {
    high: [
      `Hoy el lado principal aparece cerca del ${pctText}, con números bastante firmes detrás.`,
      `Los números dejan el camino principal alrededor del ${pctText}, con una base más estable.`,
    ],
    medium: [
      `El lado que lidera ronda el ${pctText}, pero todavía sin convertir esto en un paseo.`,
      `La ventaja principal queda cerca del ${pctText}, todavía con margen para que el resto del partido responda.`,
    ],
    low: [
      `El lado principal aparece cerca del ${pctText}, pero todavía con una buena dosis de incertidumbre.`,
      `Hay un lado por delante cerca del ${pctText}, aunque la confianza aquí pide más calma.`,
    ],
  };

  if (lang === "en") return en[confidence];
  if (lang === "es") return es[confidence];
  return pt[confidence];
}

function drawPressureOptions(lang: Lang, pressure: Exclude<DrawPressure, "low">) {
  const pt = {
    high: [
      "Mesmo com um lado na frente, o empate ainda pesa bastante aqui.",
      "O empate continua muito presente e segura um pouco esse favoritismo.",
    ],
    medium: [
      "O empate ainda aparece como pano de fundo importante deste jogo.",
      "Tem empate o bastante rondando o jogo para evitar qualquer leitura exagerada.",
    ],
  };

  const en = {
    high: [
      "Even with one side ahead, the draw still matters a lot here.",
      "The draw remains very present and cools that favoritism a bit.",
    ],
    medium: [
      "The draw still sits in the background as an important part of this game.",
      "There is enough draw pressure here to avoid any exaggerated read.",
    ],
  };

  const es = {
    high: [
      "Incluso con un lado por delante, el empate sigue pesando bastante aquí.",
      "El empate sigue muy presente y enfría un poco ese favoritismo.",
    ],
    medium: [
      "El empate todavía aparece como un fondo importante de este partido.",
      "Hay suficiente presión de empate aquí como para evitar una lectura exagerada.",
    ],
  };

  if (lang === "en") return en[pressure];
  if (lang === "es") return es[pressure];
  return pt[pressure];
}

function priceOptions(lang: Lang, tag: PriceEval["tag"], who: string) {
  const pt: Record<PriceEval["tag"], string[]> = {
    GOOD: [
      `A odd de ${who} parece boa para o cenário do jogo.`,
      `Pelo que os números mostram, o preço de ${who} parece interessante.`,
    ],
    ALIGNED: [
      `A odd de ${who} parece justa no momento.`,
      `Aqui o preço de ${who} parece bem próximo do que o jogo sugere.`,
    ],
    BAD: [
      `A odd de ${who} parece um pouco apertada para o risco.`,
      `Mesmo com algum apoio dos números, o preço de ${who} não parece tão convidativo.`,
    ],
  };

  const en: Record<PriceEval["tag"], string[]> = {
    GOOD: [
      `The odds on ${who} look good for the game setup.`,
      `From what the numbers show, the price on ${who} looks interesting.`,
    ],
    ALIGNED: [
      `The odds on ${who} look fair right now.`,
      `Here the price on ${who} feels close to what the game suggests.`,
    ],
    BAD: [
      `The odds on ${who} look a bit tight for the risk.`,
      `Even with some support from the numbers, the price on ${who} is not that inviting.`,
    ],
  };

  const es: Record<PriceEval["tag"], string[]> = {
    GOOD: [
      `La cuota de ${who} parece buena para este escenario.`,
      `Por lo que muestran los números, el precio de ${who} parece interesante.`,
    ],
    ALIGNED: [
      `La cuota de ${who} parece justa ahora mismo.`,
      `Aquí el precio de ${who} se siente bastante cerca de lo que sugiere el partido.`,
    ],
    BAD: [
      `La cuota de ${who} parece un poco ajustada para el riesgo.`,
      `Incluso con cierto apoyo de los números, el precio de ${who} no se ve tan atractivo.`,
    ],
  };

  if (lang === "en") return en[tag];
  if (lang === "es") return es[tag];
  return pt[tag];
}

function lowPayOptions(lang: Lang) {
  return [
    langText(
      lang,
      "Ter um lado a favor não significa, por si só, que a odd esteja boa.",
      "Having the side in your favor does not automatically mean the odds are good.",
      "Tener el lado a favor no significa, por sí solo, que la cuota sea buena."
    ),
    langText(
      lang,
      "Às vezes o jogo aponta para um lado, mas o preço já veio espremido demais.",
      "Sometimes the game points one way, but the price is already too squeezed.",
      "A veces el partido apunta hacia un lado, pero el precio ya viene demasiado apretado."
    ),
  ];
}

function lowConfidenceOptions(lang: Lang) {
  return [
    langText(
      lang,
      "A confiança aqui é mais baixa, então vale tratar essa leitura com um pouco mais de cuidado.",
      "Confidence is lower here, so this read deserves a bit more care.",
      "La confianza aquí es más baja, así que conviene tratar esta lectura con algo más de cuidado."
    ),
    langText(
      lang,
      "Os números ajudam a orientar, mas este jogo ainda deixa espaço para bastante variação.",
      "The numbers help guide the read, but this game still leaves room for plenty of variance.",
      "Los números ayudan a orientar, pero este partido todavía deja espacio para bastante variación."
    ),
  ];
}

export function generateFootball1x2Narrative(
  req: SportNarrativeRequest,
  profile: NarrativeProfile,
  style: NarrativeStyleId | null
): NarrativeResponse {
  const blocks: NarrativeBlock[] = [];
  const tags: string[] = [];

  const home = req.match.homeTeam;
  const away = req.match.awayTeam;
  const state = pickState(req.model.probs1x2);

  if (!state) {
    blocks.push({
      type: "headline",
      text: langText(
        req.lang,
        "Não deu para montar a leitura deste jogo agora.",
        "Could not build the read for this game right now.",
        "No fue posible montar la lectura de este partido ahora."
      ),
    });
    blocks.push({
      type: "warning",
      text: langText(
        req.lang,
        "As probabilidades do modelo não vieram disponíveis neste momento.",
        "The model probabilities are not available at the moment.",
        "Las probabilidades del modelo no están disponibles en este momento."
      ),
    });
    blocks.push({
      type: "disclaimer",
      text: langText(
        req.lang,
        "É uma leitura baseada nos números, não uma certeza do que vai acontecer.",
        "This is a numbers-based read, not a certainty of what will happen.",
        "Es una lectura basada en números, no una certeza de lo que va a pasar."
      ),
    });

    return {
      ok: true,
      version: "narrative.v2",
      blocks,
      tags: ["no_model"],
      state: "no_model",
    };
  }

  const confidence = confidenceFromStatus(req.model.status);
  const strength = collapseStrength(state.strength, profile.strengthLevels1x2);
  const dominant = state.dominant ?? "D";
  const vars = { home, away };

  if (strength === "balanced") {
    blocks.push({
      type: "headline",
      text: choose(
        `${req.eventId}:1x2:headline:balanced`,
        balancedHeadlineOptions(req.lang),
        profile.maxHeadlineVariants,
        vars
      ),
    });
  } else {
    blocks.push({
      type: "headline",
      text: choose(
        `${req.eventId}:1x2:headline:${dominant}:${strength}`,
        sideHeadlineOptions(
          req.lang,
          dominant,
          strength as Exclude<StrengthLevel, "balanced">,
          home,
          away
        ),
        profile.maxHeadlineVariants,
        vars
      ),
    });
  }

  blocks.push({
    type: "summary",
    text: applySummaryTone(
      req.lang,
      style,
      choose(
        `${req.eventId}:1x2:summary:${strength}:${confidence}`,
        summaryOptions(
          req.lang,
          strength === "balanced",
          confidence,
          pct(state.topP)
        ),
        profile.maxSummaryVariants,
        vars
      )
    ),
  });

  if (state.drawPressure !== "low" && dominant !== "D") {
    blocks.push({
      type: profile.includeContextBullet ? "bullet" : "summary",
      text: choose(
        `${req.eventId}:1x2:draw-pressure:${state.drawPressure}`,
        drawPressureOptions(req.lang, state.drawPressure),
        profile.maxSummaryVariants,
        vars
      ),
    });
  }

  if (profile.includePriceBlock) {
    const price = pickPrice(req.model.probs1x2 ?? null, req.market?.odds1x2Best ?? null, dominant);
    if (price) {
      const who = describeOutcome(req.lang, price.outcome, home, away);

      blocks.push({
        type: "price",
        text: choose(
          `${req.eventId}:1x2:price:${price.outcome}:${price.tag}`,
          priceOptions(req.lang, price.tag, who),
          profile.maxPriceVariants,
          vars
        ),
      });

      if (price.tag === "BAD") {
        blocks.push({
          type: "bullet",
          text: choose(
            `${req.eventId}:1x2:price-note:${price.outcome}`,
            lowPayOptions(req.lang),
            profile.maxPriceVariants,
            vars
          ),
        });
      }

      if (profile.includePriceDetails) {
        const edgePp = (Math.round(price.edge * 1000) / 10).toFixed(1);
        const fair = price.fairOdd != null ? price.fairOdd.toFixed(2) : "—";
        const market = price.marketOdd != null ? price.marketOdd.toFixed(2) : "—";

        blocks.push({
          type: "pricePro",
          text: langText(
            req.lang,
            `Nos números do modelo, ${who} estaria mais perto de ${fair}; o mercado está em ${market} (diferença de ${edgePp}pp).`,
            `On the model side, ${who} would sit closer to ${fair}; the market is at ${market} (${edgePp}pp gap).`,
            `En los números del modelo, ${who} estaría más cerca de ${fair}; el mercado está en ${market} (brecha de ${edgePp}pp).`
          ),
        });
      }
    }
  }

  if (profile.includeContextBullet) {
    blocks.push({
      type: "bullet",
      text: langText(
        req.lang,
        "Use isso como direção do jogo, não como garantia.",
        "Use this as a direction for the game, not as a guarantee.",
        "Usa esto como dirección del partido, no como garantía."
      ),
    });
  }

  if (profile.includeRiskBullet) {
    blocks.push({
      type: "bullet",
      text: langText(
        req.lang,
        "Quando empate e margens curtas seguem vivos, o risco do jogo pesa ainda mais.",
        "When draws and short margins stay alive, the game risk matters even more.",
        "Cuando el empate y los márgenes cortos siguen vivos, el riesgo del partido pesa aún más."
      ),
    });
  }

  if (confidence === "low") {
    blocks.push({
      type: "warning",
      text: choose(
        `${req.eventId}:1x2:warning:low`,
        lowConfidenceOptions(req.lang),
        profile.maxSummaryVariants,
        vars
      ),
    });
  }

  blocks.push({
    type: "disclaimer",
    text: langText(
      req.lang,
      "É uma leitura baseada nos números, não uma certeza do que vai acontecer.",
      "This is a numbers-based read, not a certainty of what will happen.",
      "Es una lectura basada en números, no una certeza de lo que va a pasar."
    ),
  });

  tags.push(`dominant_${dominant.toLowerCase()}`);
  tags.push(`strength_${strength}`);
  if (state.drawPressure !== "low") tags.push(`draw_pressure_${state.drawPressure}`);

  return {
    ok: true,
    version: "narrative.v2",
    blocks,
    tags,
    state: `${dominant}_${strength}`,
  };
}