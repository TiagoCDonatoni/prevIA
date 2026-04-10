import type { Lang } from "../../../../../i18n";
import type { NarrativeProfile } from "../../../core/profiles";
import type { NarrativeBlock, NarrativeResponse, SportNarrativeRequest } from "../../../core/types";
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

function fmtLine(line: number | null | undefined) {
  if (typeof line !== "number" || !Number.isFinite(line)) return "2.5";
  return line.toFixed(1);
}

function fmtPct(prob: number | null | undefined) {
  if (typeof prob !== "number" || !Number.isFinite(prob)) return "—";
  return `${(prob * 100).toFixed(1)}%`;
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

function totalsLabelOptions(lang: Lang, direction: TotalsDirection, strength: TotalsStrength) {
  if (direction === "balanced" || strength === "balanced") {
    return [
      langText(lang, "Linha equilibrada", "Balanced totals line", "Línea equilibrada"),
      langText(lang, "Totais equilibrados", "Even totals setup", "Totales equilibrados"),
    ];
  }

  const key = direction === "over" ? "over" : "under";
  const labels = {
    pt: {
      over: {
        slight: ["Leve viés para over", "Sinal leve de over"],
        moderate: ["Viés moderado para over", "Over melhor posicionado"],
        strong: ["Sinal forte de over", "Over se destaca"],
      },
      under: {
        slight: ["Leve viés para under", "Sinal leve de under"],
        moderate: ["Viés moderado para under", "Under melhor posicionado"],
        strong: ["Sinal forte de under", "Under se destaca"],
      },
    },
    en: {
      over: {
        slight: ["Slight lean to over", "Light over signal"],
        moderate: ["Moderate lean to over", "Over in a better spot"],
        strong: ["Strong over signal", "Over stands out"],
      },
      under: {
        slight: ["Slight lean to under", "Light under signal"],
        moderate: ["Moderate lean to under", "Under in a better spot"],
        strong: ["Strong under signal", "Under stands out"],
      },
    },
    es: {
      over: {
        slight: ["Leve sesgo al over", "Señal ligera de over"],
        moderate: ["Sesgo moderado al over", "Over mejor posicionado"],
        strong: ["Señal fuerte de over", "Over destaca"],
      },
      under: {
        slight: ["Leve sesgo al under", "Señal ligera de under"],
        moderate: ["Sesgo moderado al under", "Under mejor posicionado"],
        strong: ["Señal fuerte de under", "Under destaca"],
      },
    },
  };

  if (lang === "en") return labels.en[key][strength as Exclude<TotalsStrength, "balanced">];
  if (lang === "es") return labels.es[key][strength as Exclude<TotalsStrength, "balanced">];
  return labels.pt[key][strength as Exclude<TotalsStrength, "balanced">];
}

function totalsHeadlineOptions(
  lang: Lang,
  direction: TotalsDirection,
  strength: TotalsStrength
) {
  if (direction === "balanced" || strength === "balanced") {
    return [
      langText(
        lang,
        "A linha de {line} gols parece bem equilibrada neste confronto.",
        "The {line} goals line looks well balanced in this matchup.",
        "La línea de {line} goles luce bastante equilibrada en este partido."
      ),
      langText(
        lang,
        "O modelo não separa muito over e under em {line}.",
        "The model does not separate over and under much on {line}.",
        "El modelo no separa demasiado over y under en {line}."
      ),
    ];
  }

  if (direction === "over") {
    const pt = {
      slight: [
        "Há uma leve inclinação para over {line} gols.",
        "Over {line} fica um pouco à frente no modelo.",
      ],
      moderate: [
        "O modelo se inclina com alguma consistência para over {line} gols.",
        "Há uma configuração razoavelmente favorável para over {line}.",
      ],
      strong: [
        "Over {line} gols se destaca com clareza na leitura atual.",
        "O modelo mostra apoio forte para over {line} aqui.",
      ],
    };
    const en = {
      slight: [
        "There is a slight lean toward over {line} goals.",
        "Over {line} sits a touch ahead in the model.",
      ],
      moderate: [
        "The model leans with some consistency toward over {line} goals.",
        "There is a reasonably favorable setup for over {line}.",
      ],
      strong: [
        "Over {line} goals stands out clearly in the current read.",
        "The model shows strong support for over {line} here.",
      ],
    };
    const es = {
      slight: [
        "Hay una leve inclinación hacia over {line} goles.",
        "Over {line} queda apenas por delante en el modelo.",
      ],
      moderate: [
        "El modelo se inclina con cierta consistencia hacia over {line} goles.",
        "Hay una configuración razonablemente favorable para over {line}.",
      ],
      strong: [
        "Over {line} goles destaca con claridad en la lectura actual.",
        "El modelo muestra apoyo fuerte para over {line} aquí.",
      ],
    };

    if (lang === "en") return en[strength as Exclude<TotalsStrength, "balanced">];
    if (lang === "es") return es[strength as Exclude<TotalsStrength, "balanced">];
    return pt[strength as Exclude<TotalsStrength, "balanced">];
  }

  const pt = {
    slight: [
      "Há uma leve inclinação para under {line} gols.",
      "Under {line} fica um pouco à frente no modelo.",
    ],
    moderate: [
      "O modelo se inclina com alguma consistência para under {line} gols.",
      "Há uma configuração razoavelmente favorável para under {line}.",
    ],
    strong: [
      "Under {line} gols se destaca com clareza na leitura atual.",
      "O modelo mostra apoio forte para under {line} aqui.",
    ],
  };
  const en = {
    slight: [
      "There is a slight lean toward under {line} goals.",
      "Under {line} sits a touch ahead in the model.",
    ],
    moderate: [
      "The model leans with some consistency toward under {line} goals.",
      "There is a reasonably favorable setup for under {line}.",
    ],
    strong: [
      "Under {line} goals stands out clearly in the current read.",
      "The model shows strong support for under {line} here.",
    ],
  };
  const es = {
    slight: [
      "Hay una leve inclinación hacia under {line} goles.",
      "Under {line} queda apenas por delante en el modelo.",
    ],
    moderate: [
      "El modelo se inclina con cierta consistencia hacia under {line} goles.",
      "Hay una configuración razonablemente favorable para under {line}.",
    ],
    strong: [
      "Under {line} goles destaca con claridad en la lectura actual.",
      "El modelo muestra apoyo fuerte para under {line} aquí.",
    ],
  };

  if (lang === "en") return en[strength as Exclude<TotalsStrength, "balanced">];
  if (lang === "es") return es[strength as Exclude<TotalsStrength, "balanced">];
  return pt[strength as Exclude<TotalsStrength, "balanced">];
}

function bttsLabelOptions(lang: Lang, direction: BttsDirection, strength: BttsStrength) {
  if (direction === "neutral" || strength === "neutral") {
    return [
      langText(lang, "BTTS equilibrado", "Balanced BTTS", "BTTS equilibrado"),
      langText(lang, "Sem vantagem clara em BTTS", "No clear BTTS edge", "Sin ventaja clara en BTTS"),
    ];
  }

  const key = direction === "yes" ? "yes" : "no";
  const labels = {
    pt: {
      yes: {
        slight: ["Leve viés para BTTS Sim", "Sinal leve de BTTS Sim"],
        moderate: ["Viés moderado para BTTS Sim", "BTTS Sim melhor posicionado"],
        strong: ["Sinal forte de BTTS Sim", "BTTS Sim se destaca"],
      },
      no: {
        slight: ["Leve viés para BTTS Não", "Sinal leve de BTTS Não"],
        moderate: ["Viés moderado para BTTS Não", "BTTS Não melhor posicionado"],
        strong: ["Sinal forte de BTTS Não", "BTTS Não se destaca"],
      },
    },
    en: {
      yes: {
        slight: ["Slight BTTS Yes lean", "Light BTTS Yes signal"],
        moderate: ["Moderate BTTS Yes lean", "BTTS Yes in a decent spot"],
        strong: ["Strong BTTS Yes signal", "BTTS Yes stands out"],
      },
      no: {
        slight: ["Slight BTTS No lean", "Light BTTS No signal"],
        moderate: ["Moderate BTTS No lean", "BTTS No in a decent spot"],
        strong: ["Strong BTTS No signal", "BTTS No stands out"],
      },
    },
    es: {
      yes: {
        slight: ["Leve sesgo a BTTS Sí", "Señal ligera de BTTS Sí"],
        moderate: ["Sesgo moderado a BTTS Sí", "BTTS Sí mejor posicionado"],
        strong: ["Señal fuerte de BTTS Sí", "BTTS Sí destaca"],
      },
      no: {
        slight: ["Leve sesgo a BTTS No", "Señal ligera de BTTS No"],
        moderate: ["Sesgo moderado a BTTS No", "BTTS No mejor posicionado"],
        strong: ["Señal fuerte de BTTS No", "BTTS No destaca"],
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
        "BTTS parece equilibrado neste confronto.",
        "BTTS looks balanced in this matchup.",
        "BTTS luce equilibrado en este partido."
      ),
      langText(
        lang,
        "O mercado de ambos marcam segue bastante parelho.",
        "The both-teams-to-score market stays fairly even.",
        "El mercado de ambos marcan se mantiene bastante parejo."
      ),
    ];
  }

  if (direction === "yes") {
    const pt = {
      slight: [
        "Há uma leve inclinação para BTTS Sim.",
        "BTTS Sim fica um pouco à frente na leitura atual.",
      ],
      moderate: [
        "BTTS Sim carrega apoio moderado neste confronto.",
        "Há sinais decentes para BTTS Sim aqui.",
      ],
      strong: [
        "BTTS Sim se destaca com clareza na leitura atual.",
        "O modelo mostra apoio forte para os dois times marcarem aqui.",
      ],
    };
    const en = {
      slight: [
        "There is a slight lean toward BTTS Yes.",
        "BTTS Yes sits a touch ahead in the current read.",
      ],
      moderate: [
        "BTTS Yes carries moderate support in this matchup.",
        "There are decent signs for BTTS Yes here.",
      ],
      strong: [
        "BTTS Yes stands out clearly in the current read.",
        "The model shows strong support for both teams scoring here.",
      ],
    };
    const es = {
      slight: [
        "Hay una leve inclinación hacia BTTS Sí.",
        "BTTS Sí queda apenas por delante en la lectura actual.",
      ],
      moderate: [
        "BTTS Sí carga con apoyo moderado en este partido.",
        "Hay señales decentes para BTTS Sí aquí.",
      ],
      strong: [
        "BTTS Sí destaca con claridad en la lectura actual.",
        "El modelo muestra apoyo fuerte a que ambos equipos marquen aquí.",
      ],
    };

    if (lang === "en") return en[strength as Exclude<BttsStrength, "neutral">];
    if (lang === "es") return es[strength as Exclude<BttsStrength, "neutral">];
    return pt[strength as Exclude<BttsStrength, "neutral">];
  }

  const pt = {
    slight: [
      "Há uma leve inclinação para BTTS Não.",
      "BTTS Não fica um pouco à frente na leitura atual.",
    ],
    moderate: [
      "BTTS Não carrega apoio moderado neste confronto.",
      "Há sinais decentes para BTTS Não aqui.",
    ],
    strong: [
      "BTTS Não se destaca com clareza na leitura atual.",
      "O modelo mostra apoio forte contra os dois times marcarem aqui.",
    ],
  };
  const en = {
    slight: [
      "There is a slight lean toward BTTS No.",
      "BTTS No sits a touch ahead in the current read.",
    ],
    moderate: [
      "BTTS No carries moderate support in this matchup.",
      "There are decent signs for BTTS No here.",
    ],
    strong: [
      "BTTS No stands out clearly in the current read.",
      "The model shows strong support against both teams scoring here.",
    ],
  };
  const es = {
    slight: [
      "Hay una leve inclinación hacia BTTS No.",
      "BTTS No queda apenas por delante en la lectura actual.",
    ],
    moderate: [
      "BTTS No carga con apoyo moderado en este partido.",
      "Hay señales decentes para BTTS No aquí.",
    ],
    strong: [
      "BTTS No destaca con claridad en la lectura actual.",
      "El modelo muestra apoyo fuerte contra ambos equipos marquen aquí.",
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
      "Probabilidade de gol da casa: {homeGoal} • Probabilidade de gol do visitante: {awayGoal}.",
      "Home goal probability: {homeGoal} • Away goal probability: {awayGoal}.",
      "Probabilidad de gol local: {homeGoal} • Probabilidad de gol visitante: {awayGoal}."
    ),
    langText(
      lang,
      "A chance de marcar fica em {homeGoal} para a casa e {awayGoal} para o visitante.",
      "Chance of scoring stays at {homeGoal} for the home side and {awayGoal} for the away side.",
      "La chance de marcar queda en {homeGoal} para el local y {awayGoal} para el visitante."
    ),
  ];
}

export function generateFootballGoalsNarrative(
  req: SportNarrativeRequest,
  profile: NarrativeProfile
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
        totalsLabelOptions(req.lang, totals.direction, strength),
        profile.maxHeadlineVariants
      ),
    });

    blocks.push({
      type: "summary",
      text: choose(
        `${req.eventId}:goals:totals:${totals.direction}:${strength}:headline`,
        totalsHeadlineOptions(req.lang, totals.direction, strength),
        profile.maxSummaryVariants,
        { line }
      ),
    });

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