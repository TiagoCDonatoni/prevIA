import { t, type Lang } from "../../../../../i18n";
import type { NarrativeProfile } from "../../../core/profiles";
import type {
  NarrativeBlock,
  NarrativeResponse,
  NarrativeStyleId,
  SportNarrativeRequest,
} from "../../../core/types";
import { pickVariant } from "../../../core/selectors";

type TotalsStrength = "balanced" | "slight" | "moderate" | "strong";
type BttsStrength = "neutral" | "slight" | "moderate" | "strong";
type TotalsDirection = "over" | "under" | "balanced";
type BttsDirection = "yes" | "no" | "neutral";

function langText(lang: Lang, pt: string, en: string, es: string) {
  if (lang === "en") return en;
  if (lang === "es") return es;
  return pt;
}

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function choose(seed: string, options: string[], maxVariants: number, vars?: Record<string, string>) {
  const picked = pickVariant(options, seed, maxVariants);
  return vars ? fill(picked, vars) : picked;
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

function fmtLine(line: number | null | undefined) {
  if (typeof line !== "number" || !Number.isFinite(line)) return "2.5";
  return line.toFixed(1);
}

function fmtPct(prob: number | null | undefined) {
  if (typeof prob !== "number" || !Number.isFinite(prob)) return "—";
  return `${(prob * 100).toFixed(1)}%`;
}

function fmtOddValue(odd: number | null | undefined) {
  if (typeof odd !== "number" || !Number.isFinite(odd) || odd <= 1) return "—";
  return odd.toFixed(2);
}

function fmtSignedPp(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)} p.p.`;
}

function fmtSignedPct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function canShowTotalsMarketComparison(plan: SportNarrativeRequest["plan"]) {
  return plan === "LIGHT" || plan === "PRO";
}

function calcTotalsMarketProbs(bestOver: number | null | undefined, bestUnder: number | null | undefined) {
  const overOdd =
    typeof bestOver === "number" && Number.isFinite(bestOver) && bestOver > 1
      ? bestOver
      : null;
  const underOdd =
    typeof bestUnder === "number" && Number.isFinite(bestUnder) && bestUnder > 1
      ? bestUnder
      : null;

  if (overOdd == null || underOdd == null) return null;

  const rawOver = 1 / overOdd;
  const rawUnder = 1 / underOdd;
  const total = rawOver + rawUnder;

  if (!Number.isFinite(total) || total <= 0) return null;

  return {
    over: rawOver / total,
    under: rawUnder / total,
    overround: total - 1,
  };
}

function totalsMarketComparisonOptions(
  lang: Lang,
  plan: SportNarrativeRequest["plan"],
  line: string,
  pOver: number | null | undefined,
  pUnder: number | null | undefined,
  bestOver: number | null | undefined,
  bestUnder: number | null | undefined
) {
  if (!canShowTotalsMarketComparison(plan)) return [];

  const market = calcTotalsMarketProbs(bestOver, bestUnder);
  if (!market) return [];

  const candidates = [
    {
      side: "over" as const,
      modelProb: typeof pOver === "number" && Number.isFinite(pOver) ? pOver : null,
      marketProb: market.over,
      odd: bestOver,
    },
    {
      side: "under" as const,
      modelProb: typeof pUnder === "number" && Number.isFinite(pUnder) ? pUnder : null,
      marketProb: market.under,
      odd: bestUnder,
    },
  ]
    .filter((item) => {
      return (
        item.modelProb != null &&
        typeof item.odd === "number" &&
        Number.isFinite(item.odd) &&
        item.odd > 1
      );
    })
    .map((item) => {
      const edge = (item.modelProb ?? 0) - item.marketProb;
      const ev = (item.modelProb ?? 0) * Number(item.odd) - 1;

      return {
        ...item,
        edge,
        ev,
      };
    });

  if (!candidates.length) return [];

  const best = [...candidates].sort((a, b) => {
    if (b.ev !== a.ev) return b.ev - a.ev;
    return b.edge - a.edge;
  })[0];

  const sideLabel =
    best.side === "over"
      ? langText(lang, "over", "over", "over")
      : langText(lang, "under", "under", "under");

  const sideSentence =
    best.side === "over"
      ? langText(
          lang,
          `mais de ${line} gols`,
          `over ${line} goals`,
          `más de ${line} goles`
        )
      : langText(
          lang,
          `menos de ${line} gols`,
          `under ${line} goals`,
          `menos de ${line} goles`
        );

  const hasClearValue = best.edge >= 0.02 && best.ev > 0;

  if (!hasClearValue) {
    return [
      langText(
        lang,
        `As odds reais de over/under ${line} estão próximas do nosso modelo. Não há valor claro agora.`,
        `The real over/under ${line} odds are close to our model. There is no clear value right now.`,
        `Las odds reales de over/under ${line} están cerca de nuestro modelo. No hay valor claro ahora.`
      ),
    ];
  }

  if (plan === "PRO") {
    return [
      langText(
        lang,
        `${sideLabel} ${line} com valor: odd ${fmtOddValue(best.odd)}, modelo ${fmtPct(best.modelProb)} vs mercado ${fmtPct(best.marketProb)}. Edge ${fmtSignedPp(best.edge)} e EV ${fmtSignedPct(best.ev)}.`,
        `${sideLabel} ${line} shows value: odds ${fmtOddValue(best.odd)}, model ${fmtPct(best.modelProb)} vs market ${fmtPct(best.marketProb)}. Edge ${fmtSignedPp(best.edge)} and EV ${fmtSignedPct(best.ev)}.`,
        `${sideLabel} ${line} tiene valor: odd ${fmtOddValue(best.odd)}, modelo ${fmtPct(best.modelProb)} vs mercado ${fmtPct(best.marketProb)}. Edge ${fmtSignedPp(best.edge)} y EV ${fmtSignedPct(best.ev)}.`
      ),
    ];
  }

  return [
    langText(
      lang,
      `O mercado paga ${fmtOddValue(best.odd)} para ${sideSentence}. Nosso modelo vê ${fmtPct(best.modelProb)}, acima dos ${fmtPct(best.marketProb)} do mercado.`,
      `The market pays ${fmtOddValue(best.odd)} for ${sideSentence}. Our model sees ${fmtPct(best.modelProb)}, above the market's ${fmtPct(best.marketProb)}.`,
      `El mercado paga ${fmtOddValue(best.odd)} para ${sideSentence}. Nuestro modelo ve ${fmtPct(best.modelProb)}, por encima del ${fmtPct(best.marketProb)} del mercado.`
    ),
  ];
}

function goalProbFromLambda(lam: number | null | undefined) {
  if (lam == null || !Number.isFinite(lam)) return null;
  return 1 - Math.exp(-lam);
}

function collapseTotalsStrength(strength: TotalsStrength, profile: NarrativeProfile): TotalsStrength {
  if (profile.totalsLevels.includes(strength)) return strength;
  if (strength === "moderate") return profile.totalsLevels.includes("slight") ? "slight" : "strong";
  return profile.totalsLevels[profile.totalsLevels.length - 1] ?? "slight";
}

function collapseBttsStrength(strength: BttsStrength, profile: NarrativeProfile): BttsStrength {
  if (profile.bttsLevels.includes(strength)) return strength;
  if (strength === "moderate") return profile.bttsLevels.includes("slight") ? "slight" : "strong";
  return profile.bttsLevels[profile.bttsLevels.length - 1] ?? "slight";
}

function classifyTotals(pOver: number | null | undefined, pUnder: number | null | undefined) {
  const over = typeof pOver === "number" && Number.isFinite(pOver) ? pOver : null;
  const under = typeof pUnder === "number" && Number.isFinite(pUnder) ? pUnder : null;
  if (over == null && under == null) return null;

  const direction: TotalsDirection =
    over != null && under != null
      ? over === under
        ? "balanced"
        : over > under
        ? "over"
        : "under"
      : over != null
      ? "over"
      : under != null
      ? "under"
      : "balanced";

  const dominant = Math.max(over ?? 0, under ?? 0);
  let strength: TotalsStrength = "balanced";
  if (dominant >= 0.62) strength = "strong";
  else if (dominant >= 0.56) strength = "moderate";
  else if (dominant >= 0.52) strength = "slight";

  return { direction, strength };
}

function classifyBtts(pYes: number | null | undefined, pNo: number | null | undefined) {
  const yes = typeof pYes === "number" && Number.isFinite(pYes) ? pYes : null;
  const no = typeof pNo === "number" && Number.isFinite(pNo) ? pNo : null;
  if (yes == null && no == null) return null;

  const direction: BttsDirection =
    yes != null && no != null
      ? yes === no
        ? "neutral"
        : yes > no
        ? "yes"
        : "no"
      : yes != null
      ? "yes"
      : no != null
      ? "no"
      : "neutral";

  const dominant = Math.max(yes ?? 0, no ?? 0);
  let strength: BttsStrength = "neutral";
  if (dominant >= 0.66) strength = "strong";
  else if (dominant >= 0.58) strength = "moderate";
  else if (dominant >= 0.52) strength = "slight";

  return { direction, strength };
}

function totalsLabelOptions(
  lang: Lang,
  direction: TotalsDirection,
  strength: TotalsStrength,
  line: string
) {
  if (direction === "balanced" || strength === "balanced") {
    return [
      langText(
        lang,
        "Gols sem tendência clara",
        "No clear goals lean",
        "Sin tendencia clara en goles"
      ),
      langText(
        lang,
        `Linha ${line} bem ajustada`,
        `Line ${line} looks well set`,
        `Línea ${line} bien ajustada`
      ),
    ];
  }

  const labels = {
    pt: {
      over: {
        slight: [`Leve chance de mais de ${line} gols`, `Chance um pouco maior para mais de ${line} gols`],
        moderate: [`Boa chance de mais de ${line} gols`, `Boa probabilidade de over ${line}`],
        strong: [`Alta chance de mais de ${line} gols`, `Alta probabilidade de over ${line}`],
      },
      under: {
        slight: [`Leve chance de menos de ${line} gols`, `Chance um pouco maior para menos de ${line} gols`],
        moderate: [`Boa chance de menos de ${line} gols`, `Boa probabilidade de under ${line}`],
        strong: [`Alta chance de menos de ${line} gols`, `Alta probabilidade de under ${line}`],
      },
    },
    en: {
      over: {
        slight: [`Slight chance of over ${line} goals`, `Slightly higher chance of over ${line}`],
        moderate: [`Good chance of over ${line} goals`, `Good probability of over ${line}`],
        strong: [`High chance of over ${line} goals`, `High probability of over ${line}`],
      },
      under: {
        slight: [`Slight chance of under ${line} goals`, `Slightly higher chance of under ${line}`],
        moderate: [`Good chance of under ${line} goals`, `Good probability of under ${line}`],
        strong: [`High chance of under ${line} goals`, `High probability of under ${line}`],
      },
    },
    es: {
      over: {
        slight: [`Leve probabilidad de más de ${line} goles`, `Probabilidad un poco mayor de más de ${line} goles`],
        moderate: [`Buena probabilidad de más de ${line} goles`, `Buena probabilidad de over ${line}`],
        strong: [`Alta probabilidad de más de ${line} goles`, `Alta probabilidad de over ${line}`],
      },
      under: {
        slight: [`Leve probabilidad de menos de ${line} goles`, `Probabilidad un poco mayor de menos de ${line} goles`],
        moderate: [`Buena probabilidad de menos de ${line} goles`, `Buena probabilidad de under ${line}`],
        strong: [`Alta probabilidad de menos de ${line} goles`, `Alta probabilidad de under ${line}`],
      },
    },
  };

  const key = direction === "over" ? "over" : "under";
  const strengthKey = strength as Exclude<TotalsStrength, "balanced">;

  if (lang === "en") return labels.en[key][strengthKey];
  if (lang === "es") return labels.es[key][strengthKey];
  return labels.pt[key][strengthKey];
}

function totalsHeadlineOptions(
  lang: Lang,
  direction: TotalsDirection,
  strength: TotalsStrength,
  line: string
) {
  const baseKey = "narrative.v2.goals.totals.headline";

  if (direction === "balanced" || strength === "balanced") {
    return [
      t(lang, `${baseKey}.balanced.1`, { line }),
      t(lang, `${baseKey}.balanced.2`, { line }),
    ];
  }

  const sideKey = direction === "over" ? "over" : "under";
  const strengthKey = strength as Exclude<TotalsStrength, "balanced">;

  return [
    t(lang, `${baseKey}.${sideKey}.${strengthKey}.1`, { line }),
    t(lang, `${baseKey}.${sideKey}.${strengthKey}.2`, { line }),
  ];
}

function bttsLabelOptions(lang: Lang, direction: BttsDirection, strength: BttsStrength) {
  if (direction === "neutral" || strength === "neutral") {
    return [
      langText(lang, "BTTS bem equilibrado", "Balanced BTTS", "BTTS bastante equilibrado"),
      langText(lang, "BTTS sem lado tão claro", "No clear BTTS side", "BTTS sin un lado tan claro"),
    ];
  }

  const key = direction === "yes" ? "yes" : "no";
  const labels = {
    pt: {
      yes: {
        slight: ["Leve sinal para BTTS Sim", "BTTS Sim um pouco melhor"],
        moderate: ["BTTS Sim com boa cara", "BTTS Sim melhor posicionado"],
        strong: ["BTTS Sim chama atenção", "BTTS Sim vem forte"],
      },
      no: {
        slight: ["Leve sinal para BTTS Não", "BTTS Não um pouco melhor"],
        moderate: ["BTTS Não com boa cara", "BTTS Não melhor posicionado"],
        strong: ["BTTS Não chama atenção", "BTTS Não vem forte"],
      },
    },
    en: {
      yes: {
        slight: ["Slight BTTS Yes signal", "BTTS Yes looks a bit better"],
        moderate: ["BTTS Yes has a decent look", "BTTS Yes is in the better spot"],
        strong: ["BTTS Yes stands out", "BTTS Yes comes in strong"],
      },
      no: {
        slight: ["Slight BTTS No signal", "BTTS No looks a bit better"],
        moderate: ["BTTS No has a decent look", "BTTS No is in the better spot"],
        strong: ["BTTS No stands out", "BTTS No comes in strong"],
      },
    },
    es: {
      yes: {
        slight: ["Leve señal para BTTS Sí", "BTTS Sí aparece un poco mejor"],
        moderate: ["BTTS Sí tiene buena pinta", "BTTS Sí queda mejor posicionado"],
        strong: ["BTTS Sí llama la atención", "BTTS Sí viene fuerte"],
      },
      no: {
        slight: ["Leve señal para BTTS No", "BTTS No aparece un poco mejor"],
        moderate: ["BTTS No tiene buena pinta", "BTTS No queda mejor posicionado"],
        strong: ["BTTS No llama la atención", "BTTS No viene fuerte"],
      },
    },
  };

  if (lang === "en") return labels.en[key][strength as Exclude<BttsStrength, "neutral">];
  if (lang === "es") return labels.es[key][strength as Exclude<BttsStrength, "neutral">];
  return labels.pt[key][strength as Exclude<BttsStrength, "neutral">];
}

function bttsHeadlineOptions(lang: Lang, direction: BttsDirection, strength: BttsStrength) {
  if (direction === "neutral" || strength === "neutral") {
    return [
      langText(
        lang,
        "O BTTS aparece bem equilibrado neste confronto.",
        "BTTS looks well balanced in this matchup.",
        "El BTTS aparece bastante equilibrado en este partido."
      ),
      langText(
        lang,
        "Aqui o mercado de ambos marcam não mostra uma vantagem tão clara.",
        "Here the both-teams-to-score market does not show such a clear edge.",
        "Aquí el mercado de ambos marcan no muestra una ventaja tan clara."
      ),
    ];
  }

  if (direction === "yes") {
    const pt = {
      slight: [
        "O jogo aponta um pouco para BTTS Sim.",
        "BTTS Sim aparece levemente melhor neste confronto.",
      ],
      moderate: [
        "BTTS Sim aparece com uma boa cara aqui.",
        "Os números dão um apoio razoável para BTTS Sim.",
      ],
      strong: [
        "BTTS Sim ganha força neste jogo.",
        "A leitura de ambos marcam vem forte por aqui.",
      ],
    };
    const en = {
      slight: [
        "The game leans a bit toward BTTS Yes.",
        "BTTS Yes looks slightly better in this matchup.",
      ],
      moderate: [
        "BTTS Yes has a decent look here.",
        "The numbers give fair support to BTTS Yes.",
      ],
      strong: [
        "BTTS Yes gains strength in this game.",
        "The both-teams-to-score read comes in strong here.",
      ],
    };
    const es = {
      slight: [
        "El partido apunta un poco hacia BTTS Sí.",
        "BTTS Sí aparece ligeramente mejor en este cruce.",
      ],
      moderate: [
        "BTTS Sí tiene buena pinta aquí.",
        "Los números dan un apoyo razonable para BTTS Sí.",
      ],
      strong: [
        "BTTS Sí gana fuerza en este partido.",
        "La lectura de ambos marcan viene fuerte por aquí.",
      ],
    };

    if (lang === "en") return en[strength as Exclude<BttsStrength, "neutral">];
    if (lang === "es") return es[strength as Exclude<BttsStrength, "neutral">];
    return pt[strength as Exclude<BttsStrength, "neutral">];
  }

  const pt = {
    slight: [
      "O jogo aponta um pouco para BTTS Não.",
      "BTTS Não aparece levemente melhor neste confronto.",
    ],
    moderate: [
      "BTTS Não aparece com uma boa cara aqui.",
      "Os números dão um apoio razoável para BTTS Não.",
    ],
    strong: [
      "BTTS Não ganha força neste jogo.",
      "A leitura de ambos marcam não vem forte por aqui.",
    ],
  };
  const en = {
    slight: [
      "The game leans a bit toward BTTS No.",
      "BTTS No looks slightly better in this matchup.",
    ],
    moderate: [
      "BTTS No has a decent look here.",
      "The numbers give fair support to BTTS No.",
    ],
    strong: [
      "BTTS No gains strength in this game.",
      "The both-teams-to-score read is clearly weaker here.",
    ],
  };
  const es = {
    slight: [
      "El partido apunta un poco hacia BTTS No.",
      "BTTS No aparece ligeramente mejor en este cruce.",
    ],
    moderate: [
      "BTTS No tiene buena pinta aquí.",
      "Los números dan un apoyo razonable para BTTS No.",
    ],
    strong: [
      "BTTS No gana fuerza en este partido.",
      "La lectura de ambos marcan pierde bastante fuerza por aquí.",
    ],
  };

  if (lang === "en") return en[strength as Exclude<BttsStrength, "neutral">];
  if (lang === "es") return es[strength as Exclude<BttsStrength, "neutral">];
  return pt[strength as Exclude<BttsStrength, "neutral">];
}

function teamGoalsOptions(lang: Lang) {
  return [
    langText(
      lang,
      "Chance de a casa marcar: {homeGoal} • chance de o visitante marcar: {awayGoal}.",
      "Home team scoring chance: {homeGoal} • away team scoring chance: {awayGoal}.",
      "Chance de gol del local: {homeGoal} • chance de gol del visitante: {awayGoal}."
    ),
    langText(
      lang,
      "Nos números do jogo, a casa tem {homeGoal} de chance de marcar e o visitante {awayGoal}.",
      "In the game numbers, the home side has {homeGoal} to score and the away side {awayGoal}.",
      "En los números del partido, el local tiene {homeGoal} de marcar y el visitante {awayGoal}."
    ),
  ];
}

export function generateFootballGoalsNarrative(
  req: SportNarrativeRequest,
  profile: NarrativeProfile,
  style: NarrativeStyleId | null
): NarrativeResponse | null {
  const totals = classifyTotals(req.market?.totals?.pOver, req.market?.totals?.pUnder);
  const btts = classifyBtts(req.market?.btts?.pYes, req.market?.btts?.pNo);

  if (!totals && !btts) {
    return null;
  }

  const blocks: NarrativeBlock[] = [];
  const tags: string[] = [];
  const line = fmtLine(req.market?.totals?.line);

  if (totals) {
    const strength = collapseTotalsStrength(totals.strength, profile);

    blocks.push({
      type: "headline",
      text: choose(
        `${req.eventId}:goals:totals:${totals.direction}:${strength}:label`,
        totalsLabelOptions(req.lang, totals.direction, strength, line),
        profile.maxHeadlineVariants
      ),
    });

    blocks.push({
      type: "summary",
      text: applySummaryTone(
        req.lang,
        style,
        choose(
          `${req.eventId}:goals:totals:${totals.direction}:${strength}:headline`,
          totalsHeadlineOptions(req.lang, totals.direction, strength, line),
          profile.maxSummaryVariants
        )
      ),
    });

    const totalsMarketComparison = totalsMarketComparisonOptions(
      req.lang,
      req.plan,
      line,
      req.market?.totals?.pOver,
      req.market?.totals?.pUnder,
      req.market?.totals?.bestOver,
      req.market?.totals?.bestUnder
    );

    if (totalsMarketComparison.length) {
      blocks.push({
        type: req.plan === "PRO" ? "pricePro" : "price",
        text: choose(
          `${req.eventId}:goals:totals:${totals.direction}:${strength}:market-comparison`,
          totalsMarketComparison,
          profile.maxSummaryVariants
        ),
      });
    }

    tags.push(`totals_${totals.direction}_${strength}`);
  }

  if (btts) {
    const strength = collapseBttsStrength(btts.strength, profile);

    blocks.push({
      type: blocks.length ? "bullet" : "headline",
      text: choose(
        `${req.eventId}:goals:btts:${btts.direction}:${strength}:label`,
        bttsLabelOptions(req.lang, btts.direction, strength),
        profile.maxHeadlineVariants
      ),
    });

    blocks.push({
      type: blocks.length > 1 ? "bullet" : "summary",
      text: choose(
        `${req.eventId}:goals:btts:${btts.direction}:${strength}:headline`,
        bttsHeadlineOptions(req.lang, btts.direction, strength),
        profile.maxSummaryVariants
      ),
    });

    tags.push(`btts_${btts.direction}_${strength}`);
  }

  const homeGoal = fmtPct(goalProbFromLambda(req.market?.inputs?.lambdaHome));
  const awayGoal = fmtPct(goalProbFromLambda(req.market?.inputs?.lambdaAway));

  if (profile.includeContextBullet && homeGoal !== "—" && awayGoal !== "—") {
    blocks.push({
      type: "bullet",
      text: choose(
        `${req.eventId}:goals:team-goals`,
        teamGoalsOptions(req.lang),
        profile.maxSummaryVariants,
        { homeGoal, awayGoal }
      ),
    });
  }

  return {
    ok: true,
    version: "narrative.v2",
    blocks,
    tags,
    state: tags[0] ?? null,
  };
}