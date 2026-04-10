import type { Lang } from "../../../i18n";
import type { PlanId } from "../../../entitlements";

export type NarrativePlanProfileId = "free" | "basic" | "light" | "pro";

export type NarrativeBlockType =
  | "headline"
  | "summary"
  | "bullet"
  | "warning"
  | "disclaimer"
  | "price"
  | "pricePro";

export type NarrativeBlock = {
  type: NarrativeBlockType;
  text: string;
};

export type NarrativeResponse = {
  ok: true;
  version: "narrative.v2";
  blocks: NarrativeBlock[];
  tags: string[];
  state?: string | null;
};

export type Narrative1x2Probs = {
  H: number;
  D: number;
  A: number;
};

export type Narrative1x2Odds = {
  H: number | null;
  D: number | null;
  A: number | null;
};

export type SportNarrativeRequest = {
  sportKey: string;
  lang: Lang;
  plan: PlanId;
  eventId: string;
  match: {
    homeTeam: string;
    awayTeam: string;
  };
  model: {
    probs1x2?: Narrative1x2Probs | null;
    status?: string | null;
  };
  market?: {
    odds1x2Best?: Narrative1x2Odds | null;
    totals?: {
      line?: number | null;
      pOver?: number | null;
      pUnder?: number | null;
    } | null;
    btts?: {
      pYes?: number | null;
      pNo?: number | null;
    } | null;
    inputs?: {
      lambdaHome?: number | null;
      lambdaAway?: number | null;
      lambdaTotal?: number | null;
    } | null;
  } | null;
};

export type SportNarrativeBundle = {
  main: NarrativeResponse | null;
  goals: NarrativeResponse | null;
  sportKey: string;
  profile: NarrativePlanProfileId;
};