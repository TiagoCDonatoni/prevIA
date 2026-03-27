export type ConfidenceBand = "LOW" | "MEDIUM" | "HIGH";
export type NarrativeDepth = 1 | 2 | 3 | 4;

export type NarrativeRequest = {
  meta: {
    version: "narrative.v1";
    lang: "pt" | "en" | "es";
    depth: NarrativeDepth;
  };

  match: {
    homeTeam: string;
    awayTeam: string;
  };

  model: {
    probs?: { H: number; D: number; A: number } | null;
    status?: string | null; // EXACT/PROBABLE/...
  };

  market?: {
    odds_1x2_best?: { H: number | null; D: number | null; A: number | null } | null;
  } | null;
};

export type NarrativeBlock =
  | { type: "headline"; text: string }
  | { type: "summary"; text: string }
  | { type: "bullet"; text: string }
  | { type: "warning"; text: string }
  | { type: "disclaimer"; text: string }
  | { type: "price"; text: string }
  | { type: "pricePro"; text: string };

export type NarrativeResponse = {
  ok: true;
  version: "narrative.v1";
  blocks: NarrativeBlock[];
  tags: string[];
};
