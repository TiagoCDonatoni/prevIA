import type { Lang } from "../../../../../i18n";
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
      langText(lang, "Linha de gols bem ajustada", "Balanced goal line", "Línea de goles equilibrada"),
      langText(lang, "Mercado de gols bem parelho", "Even goals market", "Mercado de goles bastante parejo"),
    ];
  }

  const key = direction === "over" ? "over" : "under";
  const labels = {
    pt: {
      over: {
        slight: ["Leve sinal de over", "Over um pouco melhor"],
        moderate: ["Over com boa cara", "Over melhor posicionado"],
        strong: ["Over chama atenção", "Over vem forte"],
      },
      under: {
        slight: ["Leve sinal de under", "Under um pouco melhor"],
        moderate: ["Under com boa cara", "Under melhor posicionado"],
        strong: ["Under chama atenção", "Under vem forte"],
      },
    },
    en: {
      over: {
        slight: ["Slight over signal", "Over looks a bit better"],
        moderate: ["Over has a decent look", "Over is in the better spot"],
        strong: ["Over stands out", "Over comes in strong"],
      },
      under: {
        slight: ["Slight under signal", "Under looks a bit better"],
        moderate: ["Under has a decent look", "Under is in the better spot"],
        strong: ["Under stands out", "Under comes in strong"],
      },
    },
    es: {
      over: {
        slight: ["Leve señal de over", "Over aparece un poco mejor"],
        moderate: ["Over tiene buena pinta", "Over queda mejor posicionado"],
        strong: ["Over llama la atención", "Over viene fuerte"],
      },
      under: {
        slight: ["Leve señal de under", "Under aparece un poco mejor"],
        moderate: ["Under tiene buena pinta", "Under queda mejor posicionado"],
        strong: ["Under llama la atención", "Under viene fuerte"],
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
        "A linha de {line} gols parece bem ajustada para este jogo.",
        "The {line} goals line looks well set for this game.",
        "La línea de {line} goles parece bien ajustada para este partido."
      ),
      langText(
        lang,
        "Aqui o over e o under aparecem bem próximos na leitura.",
        "Here over and under show up very close in the read.",
        "Aquí over y under aparecen muy cerca en la lectura."
      ),
    ];
  }

  if (direction === "over") {
    const pt = {
      slight: [
        "O jogo aponta um pouco para over {line}.",
        "Over {line} aparece levemente à frente neste confronto.",
      ],
      moderate: [
        "Over {line} aparece com uma cara interessante aqui.",
        "Os números dão um apoio razoável para over {line}.",
      ],
      strong: [
        "Over {line} ganha força neste jogo.",
        "A leitura de gols puxa bem para over {line} aqui.",
      ],
    };
    const en = {
      slight: [
        "The game leans a bit toward over {line}.",
        "Over {line} sits slightly ahead in this matchup.",
      ],
      moderate: [
        "Over {line} has an interesting look here.",
        "The numbers give fair support to over {line}.",
      ],
      strong: [
        "Over {line} gains real strength in this game.",
        "The goals read leans strongly toward over {line} here.",
      ],
    };
    const es = {
      slight: [
        "El partido apunta un poco hacia over {line}.",
        "Over {line} aparece ligeramente por delante en este cruce.",
      ],
      moderate: [
        "Over {line} tiene una pinta interesante aquí.",
        "Los números dan un apoyo razonable para over {line}.",
      ],
      strong: [
        "Over {line} gana fuerza en este partido.",
        "La lectura de goles tira con fuerza hacia over {line} aquí.",
      ],
    };

    if (lang === "en") return en[strength as Exclude<TotalsStrength, "balanced">];
    if (lang === "es") return es[strength as Exclude<TotalsStrength, "balanced">];
    return pt[strength as Exclude<TotalsStrength, "balanced">];
  }

  const pt = {
    slight: [
      "O jogo aponta um pouco para under {line}.",
      "Under {line} aparece levemente à frente neste confronto.",
    ],
    moderate: [
      "Under {line} aparece com uma cara interessante aqui.",
      "Os números dão um apoio razoável para under {line}.",
    ],
    strong: [
      "Under {line} ganha força neste jogo.",
      "A leitura de gols puxa bem para under {line} aqui.",
    ],
  };
  const en = {
    slight: [
      "The game leans a bit toward under {line}.",
      "Under {line} sits slightly ahead in this matchup.",
    ],
    moderate: [
      "Under {line} has an interesting look here.",
      "The numbers give fair support to under {line}.",
    ],
    strong: [
      "Under {line} gains real strength in this game.",
      "The goals read leans strongly toward under {line} here.",
    ],
  };
  const es = {
    slight: [
      "El partido apunta un poco hacia under {line}.",
      "Under {line} aparece ligeramente por delante en este cruce.",
    ],
    moderate: [
      "Under {line} tiene una pinta interesante aquí.",
      "Los números dan un apoyo razonable para under {line}.",
    ],
    strong: [
      "Under {line} gana fuerza en este partido.",
      "La lectura de goles tira con fuerza hacia under {line} aquí.",
    ],
  };

  if (lang === "en") return en[strength as Exclude<TotalsStrength, "balanced">];
  if (lang === "es") return es[strength as Exclude<TotalsStrength, "balanced">];
  return pt[strength as Exclude<TotalsStrength, "balanced">];
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
  _style: NarrativeStyleId
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