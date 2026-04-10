import type { NarrativeStyleId } from "./types";

const VALID_STYLES: NarrativeStyleId[] = ["leve", "equilibrado", "pro"];

export function resolveNarrativeStyle(raw?: string | null): NarrativeStyleId {
  const value = String(raw ?? "").trim().toLowerCase();

  if (VALID_STYLES.includes(value as NarrativeStyleId)) {
    return value as NarrativeStyleId;
  }

  return "leve";
}