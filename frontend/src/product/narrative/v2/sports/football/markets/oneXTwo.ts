import type { Lang } from "../../../../../i18n";
import type { NarrativeProfile } from "../../../core/profiles";
import type {
  Narrative1x2Odds,
  Narrative1x2Probs,
  NarrativeBlock,
  NarrativeResponse,
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
      "Jogo aberto, sem um lado claramente dominante.",
      "Open matchup with no clearly dominant side.",
      "Partido abierto, sin un lado claramente dominante."
    ),
    langText(
      lang,
      "O confronto parece equilibrado e com pouca separação entre cenários.",
      "The game looks balanced, with limited separation between outcomes.",
      "El cruce se ve equilibrado y con poca separación entre escenarios."
    ),
    langText(
      lang,
      "Não há um favorito claro neste jogo.",
      "No side opens as a clear favorite here.",
      "No aparece un favorito claro en este partido."
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
        "O empate segue muito vivo neste jogo.",
        "O modelo mantém o empate claramente em jogo aqui.",
      ],
      moderate: [
        "O empate lidera a leitura, embora o jogo siga competitivo.",
        "O modelo se inclina para o empate, mas sem uma grande brecha.",
      ],
      relevant: [
        "O empate vira um resultado central e relevante aqui.",
        "O modelo vê o empate como cenário forte neste confronto.",
      ],
      strong: [
        "O empate aparece com muita força na projeção atual.",
        "Este é um cenário de empate forte em termos de 1x2.",
      ],
      clear: [
        "O empate é o cenário dominante do 1x2 aqui.",
        "O modelo transforma o empate no desfecho mais claro deste jogo.",
      ],
    };

    const en: Record<typeof strength, string[]> = {
      slight: [
        "Draw stays very live in this matchup.",
        "The model keeps the draw firmly in play here.",
      ],
      moderate: [
        "Draw edges the read, though the game still looks competitive.",
        "The model leans toward a draw, but not by a huge gap.",
      ],
      relevant: [
        "Draw becomes a relevant central outcome here.",
        "The model sees draw as a strong scenario in this game.",
      ],
      strong: [
        "Draw is strongly present in the current projection.",
        "This is a strong draw scenario in 1x2 terms.",
      ],
      clear: [
        "Draw is the dominant 1x2 scenario here.",
        "The model makes draw the clearest outcome in this matchup.",
      ],
    };

    const es: Record<typeof strength, string[]> = {
      slight: [
        "El empate sigue muy vivo en este partido.",
        "El modelo mantiene al empate claramente en juego aquí.",
      ],
      moderate: [
        "El empate encabeza la lectura, aunque el partido siga competitivo.",
        "El modelo se inclina por el empate, pero sin una gran brecha.",
      ],
      relevant: [
        "El empate se vuelve un resultado central y relevante aquí.",
        "El modelo ve al empate como un escenario fuerte en este partido.",
      ],
      strong: [
        "El empate aparece con mucha fuerza en la proyección actual.",
        "Este es un escenario de empate fuerte en términos de 1x2.",
      ],
      clear: [
        "El empate es el escenario dominante del 1x2 aquí.",
        "El modelo convierte al empate en el resultado más claro de este partido.",
      ],
    };

    if (lang === "en") return en[strength];
    if (lang === "es") return es[strength];
    return pt[strength];
  }

  const pt: Record<typeof strength, string[]> = {
    slight: [
      `${side} aparece um passo à frente, mas sem muita folga.`,
      `Há uma leve inclinação para ${side} neste confronto.`,
    ],
    moderate: [
      `${side} tem vantagem moderada, embora o jogo siga aberto.`,
      `O confronto favorece ${side}, mas ainda sem favoritismo claro.`,
    ],
    relevant: [
      `${side} carrega um favoritismo relevante na leitura atual.`,
      `O modelo dá uma vantagem perceptível para ${side}.`,
    ],
    strong: [
      `${side} chega como favorito forte, embora não em nível absoluto.`,
      `O modelo mostra favoritismo forte para ${side}.`,
    ],
    clear: [
      `${side} é o favorito claro aqui.`,
      `O modelo coloca ${side} bem à frente dos demais cenários.`,
    ],
  };

  const en: Record<typeof strength, string[]> = {
    slight: [
      `${side} is a step ahead, but without much room.`,
      `There is a slight lean toward ${side} in this matchup.`,
    ],
    moderate: [
      `${side} holds a moderate edge, though the game remains open.`,
      `The matchup favors ${side}, but not at a clear-favorite level.`,
    ],
    relevant: [
      `${side} carries relevant favoritism in the current read.`,
      `The model gives ${side} a noticeable edge here.`,
    ],
    strong: [
      `${side} comes in as a strong favorite, though not an absolute lock.`,
      `The model shows strong favoritism for ${side}.`,
    ],
    clear: [
      `${side} is the clear favorite here.`,
      `The model places ${side} well ahead of the rest.`,
    ],
  };

  const es: Record<typeof strength, string[]> = {
    slight: [
      `${side} aparece un paso por delante, pero sin demasiado margen.`,
      `Hay una leve inclinación hacia ${side} en este partido.`,
    ],
    moderate: [
      `${side} tiene una ventaja moderada, aunque el partido sigue abierto.`,
      `El cruce favorece a ${side}, pero aún sin favoritismo claro.`,
    ],
    relevant: [
      `${side} carga con un favoritismo relevante en la lectura actual.`,
      `El modelo da una ventaja visible a ${side}.`,
    ],
    strong: [
      `${side} llega como favorito fuerte, aunque no como un cierre absoluto.`,
      `El modelo muestra un favoritismo fuerte para ${side}.`,
    ],
    clear: [
      `${side} es el favorito claro aquí.`,
      `El modelo coloca a ${side} claramente por delante del resto.`,
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
        "Mesmo com um sinal estável do modelo, o jogo segue perto demais para apontar um lado claro.",
        "A leitura é organizada, embora equilibrada em termos de 1x2.",
      ],
      medium: [
        "O modelo aponta alguma direção, mas a brecha ainda é curta demais para cravar leitura forte.",
        "Este duelo parece equilibrado o suficiente para exigir cautela.",
      ],
      low: [
        "A baixa confiança reforça o caráter equilibrado deste confronto.",
        "Jogo apertado com confiança limitada pede cautela extra.",
      ],
    };

    const en: Record<ConfidenceLevel, string[]> = {
      high: [
        "Even with a stable model signal, the game stays close enough to avoid a clear side.",
        "The read is orderly, yet still balanced in 1x2 terms.",
      ],
      medium: [
        "The model points somewhere, but the gap is still too small for a firm call.",
        "This looks balanced enough to demand caution.",
      ],
      low: [
        "Low confidence reinforces the balanced nature of this matchup.",
        "A tight game with limited confidence deserves extra caution.",
      ],
    };

    const es: Record<ConfidenceLevel, string[]> = {
      high: [
        "Incluso con una señal estable del modelo, el partido sigue demasiado parejo para marcar un lado claro.",
        "La lectura es ordenada, aunque equilibrada en términos de 1x2.",
      ],
      medium: [
        "El modelo apunta hacia alguna dirección, pero la brecha sigue siendo corta para una lectura firme.",
        "Este cruce luce lo bastante equilibrado como para exigir cautela.",
      ],
      low: [
        "La baja confianza refuerza el carácter equilibrado de este partido.",
        "Un partido cerrado y con confianza limitada pide más cautela.",
      ],
    };

    if (lang === "en") return en[confidence];
    if (lang === "es") return es[confidence];
    return pt[confidence];
  }

  const pt: Record<ConfidenceLevel, string[]> = {
    high: [
      `O modelo coloca o cenário dominante perto de ${pctText}, com leitura relativamente estável por trás.`,
      `A projeção leva o desfecho principal para algo em torno de ${pctText}, apoiado por boa estabilidade.`,
    ],
    medium: [
      `O cenário principal gira em torno de ${pctText}, mas ainda com espaço para resistência do restante do campo.`,
      `O lado dominante chega à faixa de ${pctText}, mas ainda com alguma incerteza.`,
    ],
    low: [
      `O cenário principal gira em torno de ${pctText}, mas a confiança continua limitada.`,
      `Há um lado visível perto de ${pctText}, porém com sinal de confiança cauteloso.`,
    ],
  };

  const en: Record<ConfidenceLevel, string[]> = {
    high: [
      `The model puts the dominant side around ${pctText}, with a stable read behind it.`,
      `Projection points to roughly ${pctText} for the leading outcome, supported by good stability.`,
    ],
    medium: [
      `The leading scenario is around ${pctText}, but still with room for pushback from the field.`,
      `The dominant side reaches about ${pctText}, but the read still carries some uncertainty.`,
    ],
    low: [
      `The leading scenario is around ${pctText}, but confidence stays limited.`,
      `There is a visible leading side near ${pctText}, but with a cautious confidence signal.`,
    ],
  };

  const es: Record<ConfidenceLevel, string[]> = {
    high: [
      `El modelo coloca al escenario dominante cerca del ${pctText}, con una lectura bastante estable detrás.`,
      `La proyección lleva el resultado principal a alrededor de ${pctText}, apoyado por una buena estabilidad.`,
    ],
    medium: [
      `El escenario principal ronda el ${pctText}, pero todavía con margen para resistencia del resto.`,
      `El lado dominante llega a cerca del ${pctText}, pero aún con cierta incertidumbre.`,
    ],
    low: [
      `El escenario principal ronda el ${pctText}, pero la confianza sigue limitada.`,
      `Hay un lado visible cerca del ${pctText}, pero con una señal de confianza prudente.`,
    ],
  };

  if (lang === "en") return en[confidence];
  if (lang === "es") return es[confidence];
  return pt[confidence];
}

function drawPressureOptions(lang: Lang, pressure: Exclude<DrawPressure, "low">) {
  const pt = {
    high: [
      "O empate ainda merece bastante respeito na leitura final.",
      "A pressão do empate segue alta e esfria o favoritismo.",
    ],
    medium: [
      "O empate continua relevante no pano de fundo desta projeção.",
      "Ainda existe pressão suficiente de empate para evitar leitura de passeio.",
    ],
  };

  const en = {
    high: [
      "The draw still deserves strong respect in the final read.",
      "Draw pressure stays high enough to cool the favoritism.",
    ],
    medium: [
      "The draw remains relevant in the background of this projection.",
      "There is still enough draw pressure to avoid calling this a runaway spot.",
    ],
  };

  const es = {
    high: [
      "El empate todavía merece mucho respeto en la lectura final.",
      "La presión del empate sigue alta y enfría el favoritismo.",
    ],
    medium: [
      "El empate sigue siendo relevante en el fondo de esta proyección.",
      "Todavía hay suficiente presión de empate como para no hablar de un escenario desbocado.",
    ],
  };

  if (lang === "en") return en[pressure];
  if (lang === "es") return es[pressure];
  return pt[pressure];
}

function priceOptions(lang: Lang, tag: PriceEval["tag"], who: string) {
  const pt: Record<PriceEval["tag"], string[]> = {
    GOOD: [
      `O preço atual de ${who} parece um pouco generoso frente ao modelo.`,
      `A odd de ${who} fica acima da expectativa justa do modelo.`,
    ],
    ALIGNED: [
      `O preço de ${who} parece bem alinhado com o modelo.`,
      `Há pouco desencontro entre modelo e mercado para ${who}.`,
    ],
    BAD: [
      `O preço de ${who} parece curto para o risco envolvido.`,
      `Mesmo com apoio do modelo, a odd atual de ${who} não parece tão generosa.`,
    ],
  };

  const en: Record<PriceEval["tag"], string[]> = {
    GOOD: [
      `The current price for ${who} looks a bit generous versus the model.`,
      `The odds on ${who} sit above the model's fair expectation.`,
    ],
    ALIGNED: [
      `The price on ${who} looks broadly aligned with the model.`,
      `There is little mismatch between model and market for ${who}.`,
    ],
    BAD: [
      `The price on ${who} looks a bit short for the risk involved.`,
      `Even with support in the model, the current odds on ${who} are not very generous.`,
    ],
  };

  const es: Record<PriceEval["tag"], string[]> = {
    GOOD: [
      `La cuota actual de ${who} parece algo generosa frente al modelo.`,
      `La cuota de ${who} queda por encima del precio justo del modelo.`,
    ],
    ALIGNED: [
      `La cuota de ${who} luce bastante alineada con el modelo.`,
      `Hay poca diferencia entre modelo y mercado para ${who}.`,
    ],
    BAD: [
      `La cuota de ${who} se ve algo corta para el riesgo asumido.`,
      `Incluso con apoyo del modelo, la cuota actual de ${who} no parece muy generosa.`,
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
      "Mesmo com leitura favorável, o retorno pode ficar limitado nesse número.",
      "Even if the read is favorable, the payout may be limited at this number.",
      "Aunque el escenario sea favorable, el retorno puede verse limitado en esta cuota."
    ),
    langText(
      lang,
      "Ter apoio do modelo não torna o preço automaticamente atraente.",
      "Support from the model does not automatically make the price attractive.",
      "El apoyo del modelo no convierte automáticamente al precio en atractivo."
    ),
  ];
}

function lowConfidenceOptions(lang: Lang) {
  return [
    langText(
      lang,
      "A confiança aqui é baixa, então volatilidade e eficiência de mercado merecem mais respeito.",
      "Confidence is low here, so swings and market efficiency deserve extra respect.",
      "La confianza aquí es baja, así que la volatilidad y la eficiencia del mercado merecen más respeto."
    ),
    langText(
      lang,
      "Esta projeção traz incerteza suficiente para pedir cautela extra.",
      "This projection carries enough uncertainty to justify extra caution.",
      "Esta proyección trae suficiente incertidumbre como para exigir más cautela."
    ),
  ];
}

export function generateFootball1x2Narrative(
  req: SportNarrativeRequest,
  profile: NarrativeProfile
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
        "Análise indisponível no momento.",
        "Analysis unavailable right now.",
        "Análisis no disponible en este momento."
      ),
    });
    blocks.push({
      type: "warning",
      text: langText(
        req.lang,
        "Sem probabilidades do modelo disponíveis para este jogo.",
        "No model probabilities available for this match.",
        "No hay probabilidades del modelo disponibles para este partido."
      ),
    });
    blocks.push({
      type: "disclaimer",
      text: langText(
        req.lang,
        "Isso é uma estimativa estatística e não garante o resultado.",
        "This is a statistical estimate and does not guarantee the result.",
        "Esta es una estimación estadística y no garantiza el resultado."
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
    text: choose(
      `${req.eventId}:1x2:summary:${strength}:${confidence}`,
      summaryOptions(req.lang, strength === "balanced", confidence, pct(state.topP)),
      profile.maxSummaryVariants,
      vars
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
            `Preço do modelo para ${who}: mercado ${market} vs justo ${fair} (edge ${edgePp}pp).`,
            `Model pricing for ${who}: market ${market} vs fair ${fair} (edge ${edgePp}pp).`,
            `Precio del modelo para ${who}: mercado ${market} vs justo ${fair} (edge ${edgePp}pp).`
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
        "Use isso como leitura de direção, não como certeza.",
        "Use this as a directional read, not as a certainty.",
        "Usa esto como una lectura de dirección, no como certeza."
      ),
    });
  }

  if (profile.includeRiskBullet) {
    blocks.push({
      type: "bullet",
      text: langText(
        req.lang,
        "Gestão de risco pesa ainda mais quando empate e margens curtas seguem vivos.",
        "Risk management matters most when draws and short margins stay alive.",
        "La gestión de riesgo pesa aún más cuando el empate y los márgenes cortos siguen vivos."
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
      "Isso é uma estimativa estatística e não garante o resultado.",
      "This is a statistical estimate and does not guarantee the result.",
      "Esta es una estimación estadística y no garantiza el resultado."
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