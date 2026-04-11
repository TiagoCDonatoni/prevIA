import { narrativeProfileForPlan } from "./profiles";
import { resolveNarrativeStyle } from "./style";
import type { SportNarrativeBundle, SportNarrativeRequest } from "./types";
import { generateFootballNarratives } from "../sports/football";

export function generateNarrativesForSport(
  req: SportNarrativeRequest
): SportNarrativeBundle {
  const profile = narrativeProfileForPlan(req.plan);
  const style = req.style ? resolveNarrativeStyle(req.style) : null;

  if (
    req.sportKey === "soccer" ||
    req.sportKey === "football" ||
    req.sportKey.startsWith("soccer_")
  ) {
    return generateFootballNarratives(req, profile, style);
  }

  return generateFootballNarratives(
    { ...req, sportKey: "football" },
    profile,
    style
  );
}