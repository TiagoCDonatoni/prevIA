import type { NarrativeProfile } from "../../core/profiles";
import type { SportNarrativeBundle, SportNarrativeRequest } from "../../core/types";
import { generateFootball1x2Narrative } from "./markets/oneXTwo";
import { generateFootballGoalsNarrative } from "./markets/goals";

export function generateFootballNarratives(
  req: SportNarrativeRequest,
  profile: NarrativeProfile
): SportNarrativeBundle {
  return {
    main: generateFootball1x2Narrative(req, profile),
    goals: generateFootballGoalsNarrative(req, profile),
    sportKey: req.sportKey,
    profile: profile.id,
  };
}