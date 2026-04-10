import { narrativeProfileForPlan } from "./profiles";
import type { SportNarrativeBundle, SportNarrativeRequest } from "./types";
import { generateFootballNarratives } from "../sports/football";

export function generateNarrativesForSport(req: SportNarrativeRequest): SportNarrativeBundle {
  const profile = narrativeProfileForPlan(req.plan);

  if (
    req.sportKey === "soccer" ||
    req.sportKey === "football" ||
    req.sportKey.startsWith("soccer_")
  ) {
    return generateFootballNarratives(req, profile);
  }

  return generateFootballNarratives({ ...req, sportKey: "football" }, profile);
}