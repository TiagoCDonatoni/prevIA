import { t, type Lang } from "../i18n";
import type { NarrativeRequest, NarrativeResponse, NarrativeBlock } from "./types";

function pct(x: number) {
  return Math.round(x * 100);
}

function safeOdd(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  if (v == null || !Number.isFinite(v) || v <= 1.0001) return null;
  return v;
}

function impliedProbFromOdd(odd: number | null): number | null {
  if (odd == null) return null;
  return 1 / odd;
}

function fairOddFromProb(p: number | null): number | null {
  if (p == null || !Number.isFinite(p) || p <= 0.0001) return null;
  return 1 / p;
}

type PriceEval = {
  outcome: "H" | "D" | "A";
  edge: number;              // p_model - p_market
  fairOdd: number | null;    // 1/p_model
  marketOdd: number | null;  // odd best
  tag: "GOOD" | "ALIGNED" | "BAD";
};

function evalPrice(
  probs: { H: number; D: number; A: number } | null | undefined,
  odds: { H: number | null; D: number | null; A: number | null } | null | undefined
): PriceEval | null {
  if (!probs || !odds) return null;

  const candidates: Array<PriceEval | null> = (["H", "D", "A"] as const).map((k) => {
    const p = probs[k];
    const mo = safeOdd((odds as any)[k]);
    const mp = impliedProbFromOdd(mo);
    if (mp == null) return null;

    const edge = p - mp; // + => “odd alta” vs modelo
    const fairOdd = fairOddFromProb(p);

    // thresholds simples (ajustamos depois):
    // > +2pp = bom | entre -2pp..+2pp = alinhado | < -2pp = ruim
    const tag: PriceEval["tag"] =
      edge >= 0.02 ? "GOOD" : edge <= -0.02 ? "BAD" : "ALIGNED";

    return { outcome: k, edge, fairOdd, marketOdd: mo, tag };
  });

  const list = candidates.filter(Boolean) as PriceEval[];
  if (!list.length) return null;

  // escolher o “mais relevante”: maior edge absoluto
  list.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
  return list[0];
}

function pick1x2(probs?: { H: number; D: number; A: number } | null) {
  if (!probs) return null;

  const entries = [
    ["H", probs.H],
    ["D", probs.D],
    ["A", probs.A],
  ] as const;

  entries.sort((a, b) => b[1] - a[1]);

  const [topK, topP] = entries[0];
  const secondP = entries[1]?.[1] ?? 0;
  const margin = topP - secondP;

  return { topK, topP, secondP, margin };
}

function confKeyFromStatus(status?: string | null) {
  const s = String(status ?? "").toUpperCase();
  if (s === "EXACT") return "high";
  if (s === "PROBABLE") return "medium";
  if (!s) return "medium";
  return "low";
}

export function generateNarrative(req: NarrativeRequest): NarrativeResponse {
  const lang = req.meta.lang as Lang;
  const tr = (k: string, vars?: Record<string, any>) => t(lang, k, vars);

  const blocks: NarrativeBlock[] = [];
  const tags: string[] = [];

  const home = req.match.homeTeam;
  const away = req.match.awayTeam;

  const pick = pick1x2(req.model.probs);
  if (!pick) {
    blocks.push({ type: "headline", text: tr("narrative.v1.headline.noModel") });
    blocks.push({ type: "warning", text: tr("narrative.v1.warning.noModel") });
    blocks.push({ type: "disclaimer", text: tr("narrative.v1.disclaimer") });
    return { ok: true, version: "narrative.v1", blocks, tags: ["no_model"] };
  }
  
  const topPct = pct(pick.topP);

  // Estágios intermediários por "margem estrutural"
  // margin = topP - secondP
  const margin = pick.margin;

  // Regras simples (ajustáveis depois):
  // - balanced: margem muito pequena (confronto aberto) OU topP baixo
  // - slight: margem >= 5pp
  // - consistent: margem >= 12pp
  // - clear: margem >= 20pp
  const isBalanced = pick.topP < 0.45 || margin < 0.05;

  let strength: "slight" | "consistent" | "clear" = "slight";
  if (margin >= 0.2) strength = "clear";
  else if (margin >= 0.12) strength = "consistent";

  if (isBalanced) {
    blocks.push({ type: "headline", text: tr("narrative.v1.headline.balanced") });
    tags.push("balanced");
  } else if (pick.topK === "H") {
    const k =
      strength === "clear"
        ? "narrative.v1.headline.homeClear"
        : strength === "consistent"
        ? "narrative.v1.headline.homeConsistent"
        : "narrative.v1.headline.homeLean";

    blocks.push({ type: "headline", text: tr(k, { home }) });
    tags.push(strength === "clear" ? "home_clear" : strength === "consistent" ? "home_consistent" : "home_lean");
  } else if (pick.topK === "A") {
    const k =
      strength === "clear"
        ? "narrative.v1.headline.awayClear"
        : strength === "consistent"
        ? "narrative.v1.headline.awayConsistent"
        : "narrative.v1.headline.awayLean";

    blocks.push({ type: "headline", text: tr(k, { away }) });
    tags.push(strength === "clear" ? "away_clear" : strength === "consistent" ? "away_consistent" : "away_lean");
  } else {
    const k =
      strength === "clear"
        ? "narrative.v1.headline.drawClear"
        : strength === "consistent"
        ? "narrative.v1.headline.drawConsistent"
        : "narrative.v1.headline.drawLean";

    blocks.push({ type: "headline", text: tr(k) });
    tags.push(strength === "clear" ? "draw_clear" : strength === "consistent" ? "draw_consistent" : "draw_lean");
  }

    // ===== Price evaluation (odds vs modelo) =====
  const oddsBest = req.market?.odds_1x2_best ?? null;
  const price = evalPrice(req.model.probs ?? null, oddsBest);

  if (price) {
    const who =
      price.outcome === "H"
        ? tr("narrative.v1.outcomes.home", { home })
        : price.outcome === "A"
        ? tr("narrative.v1.outcomes.away", { away })
        : tr("narrative.v1.outcomes.draw");

    // Leigo (depth 1..3): texto curto, interpretável
    if (req.meta.depth <= 3) {
      const key =
        price.tag === "GOOD"
          ? "narrative.v1.price.good"
          : price.tag === "BAD"
          ? "narrative.v1.price.bad"
          : "narrative.v1.price.aligned";

      blocks.push({
        type: "price",
        text: tr(key, { who }),
      });

      // Se for favorito mas “pagando pouco” (edge BAD) ajuda com uma frase prática
      if (price.tag === "BAD") {
        blocks.push({
          type: "bullet",
          text: tr("narrative.v1.price.noteLowPay", { who }),
        });
      }
    } else {
      // PRO (depth 4): texto técnico curto + números úteis
      const edgePp = Math.round(price.edge * 1000) / 10; // 1 casa (pp)
      const fair = price.fairOdd != null ? price.fairOdd.toFixed(2) : "—";
      const market = price.marketOdd != null ? price.marketOdd.toFixed(2) : "—";

      blocks.push({
        type: "price",
        text:
          price.tag === "GOOD"
            ? tr("narrative.v1.price.good", { who })
            : price.tag === "BAD"
            ? tr("narrative.v1.price.bad", { who })
            : tr("narrative.v1.price.aligned", { who }),
      });

      blocks.push({
        type: "pricePro",
        text: tr("narrative.v1.price.pro", {
          who,
          edgePp,
          fair,
          market,
        }),
      });
    }
  }

  const confKey = confKeyFromStatus(req.model.status);
  const depth = req.meta.depth;

  // summary
  blocks.push({
    type: "summary",
    text:
      depth <= 2
        ? tr(`narrative.v1.summary.depth${depth}.${confKey}`, { home, away })
        : tr(`narrative.v1.summary.depth${depth}.${confKey}`, { home, away, pct: topPct }),
  });

  // bullets
  if (depth >= 3) blocks.push({ type: "bullet", text: tr("narrative.v1.bullets.context") });
  if (depth >= 4) blocks.push({ type: "bullet", text: tr("narrative.v1.bullets.risk") });

  if (confKey === "low") blocks.push({ type: "warning", text: tr("narrative.v1.warning.lowConfidence") });

  blocks.push({ type: "disclaimer", text: tr("narrative.v1.disclaimer") });

  return { ok: true, version: "narrative.v1", blocks, tags };
}
