import type { PlanId } from "../../../entitlements";
import type { NarrativePlanProfileId } from "./types";

export type NarrativeProfile = {
  id: NarrativePlanProfileId;
  strengthLevels1x2: Array<"balanced" | "slight" | "moderate" | "relevant" | "strong" | "clear">;
  totalsLevels: Array<"balanced" | "slight" | "moderate" | "strong">;
  bttsLevels: Array<"neutral" | "slight" | "moderate" | "strong">;
  maxHeadlineVariants: number;
  maxSummaryVariants: number;
  maxPriceVariants: number;
  includeContextBullet: boolean;
  includeRiskBullet: boolean;
  includePriceBlock: boolean;
  includePriceDetails: boolean;
};

const PROFILES: Record<NarrativePlanProfileId, NarrativeProfile> = {
  free: {
    id: "free",
    strengthLevels1x2: ["balanced", "slight"],
    totalsLevels: ["balanced", "slight"],
    bttsLevels: ["neutral", "slight"],
    maxHeadlineVariants: 1,
    maxSummaryVariants: 1,
    maxPriceVariants: 1,
    includeContextBullet: false,
    includeRiskBullet: false,
    includePriceBlock: false,
    includePriceDetails: false,
  },
  basic: {
    id: "basic",
    strengthLevels1x2: ["balanced", "slight", "relevant", "clear"],
    totalsLevels: ["balanced", "slight", "strong"],
    bttsLevels: ["neutral", "slight", "strong"],
    maxHeadlineVariants: 2,
    maxSummaryVariants: 2,
    maxPriceVariants: 1,
    includeContextBullet: false,
    includeRiskBullet: false,
    includePriceBlock: true,
    includePriceDetails: false,
  },
  light: {
    id: "light",
    strengthLevels1x2: ["balanced", "slight", "moderate", "relevant", "strong", "clear"],
    totalsLevels: ["balanced", "slight", "moderate", "strong"],
    bttsLevels: ["neutral", "slight", "moderate", "strong"],
    maxHeadlineVariants: 3,
    maxSummaryVariants: 3,
    maxPriceVariants: 2,
    includeContextBullet: true,
    includeRiskBullet: false,
    includePriceBlock: true,
    includePriceDetails: false,
  },
  pro: {
    id: "pro",
    strengthLevels1x2: ["balanced", "slight", "moderate", "relevant", "strong", "clear"],
    totalsLevels: ["balanced", "slight", "moderate", "strong"],
    bttsLevels: ["neutral", "slight", "moderate", "strong"],
    maxHeadlineVariants: 4,
    maxSummaryVariants: 4,
    maxPriceVariants: 3,
    includeContextBullet: true,
    includeRiskBullet: true,
    includePriceBlock: true,
    includePriceDetails: true,
  },
};

export function narrativeProfileForPlan(plan: PlanId): NarrativeProfile {
  if (plan === "PRO") return PROFILES.pro;
  if (plan === "LIGHT") return PROFILES.light;
  if (plan === "BASIC") return PROFILES.basic;
  if (plan === "FREE") return PROFILES.free;
  return PROFILES.free;
}