import type {
  NarrativeStyleId,
  SportNarrativeBundle,
  SportNarrativeRequest,
} from "../../core/types";
import { generateFootball1x2Narrative } from "./markets/oneXTwo";
import { generateFootballGoalsNarrative } from "./markets/goals";

export function generateFootballNarratives(
  req: SportNarrativeRequest,
  profile: NarrativeProfile,
  style: NarrativeStyleId
): SportNarrativeBundle {
  return {
    main: generateFootball1x2Narrative(req, profile, style),
    goals: generateFootballGoalsNarrative(req, profile, style),
    sportKey: req.sportKey,
    profile: profile.id,
    style,
  };
}