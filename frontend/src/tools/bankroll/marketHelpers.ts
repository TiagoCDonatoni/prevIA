import {
  ASIAN_HANDICAP_LINES,
  BOOKMAKERS,
  EUROPEAN_HANDICAP_LINES,
  FREE_SELECTION_MARKETS,
  GOALS_LINES,
  MARKET_IDS,
  SIMPLE_SELECTIONS,
  type MarketId,
} from "./options";

export const OTHER_VALUE = "__other__";

export type StructuredSelection = {
  choice: string;
  direction: "over" | "under";
  line: string;
  customLine: string;
  team: "home" | "away";
};

export function isKnownMarket(value: string): value is Exclude<MarketId, "other"> {
  return value !== "other" && (MARKET_IDS as readonly string[]).includes(value);
}

export function resolveMarket(value: string): { marketId: MarketId; customMarket: string } {
  const normalized = value.trim();
  return isKnownMarket(normalized)
    ? { marketId: normalized, customMarket: "" }
    : { marketId: "other", customMarket: normalized };
}

export function serializeMarket(marketId: MarketId, customMarket: string): string {
  return marketId === "other" ? customMarket.trim() : marketId;
}

export function resolveBookmaker(value: string): { bookmaker: string; customBookmaker: string } {
  const normalized = value.trim();
  return (BOOKMAKERS as readonly string[]).includes(normalized)
    ? { bookmaker: normalized, customBookmaker: "" }
    : { bookmaker: OTHER_VALUE, customBookmaker: normalized };
}

export function serializeBookmaker(bookmaker: string, customBookmaker: string): string {
  return bookmaker === OTHER_VALUE ? customBookmaker.trim() : bookmaker;
}

export function isFreeSelectionMarket(marketId: MarketId): boolean {
  return FREE_SELECTION_MARKETS.includes(marketId);
}

export function isHandicapMarket(marketId: MarketId): boolean {
  return marketId === "asian_handicap" || marketId === "european_handicap";
}

export function parseStructuredSelection(
  marketId: MarketId,
  rawSelection: string
): Partial<StructuredSelection> | null {
  const selection = rawSelection.trim();
  const simpleValues = SIMPLE_SELECTIONS[marketId];
  if (simpleValues) {
    const matched = simpleValues.find((value) => value.toLowerCase() === selection.toLowerCase());
    return matched ? { choice: matched } : null;
  }

  if (marketId === "goals_over_under") {
    const match = /^(Over|Under)\s+(.+)$/i.exec(selection);
    if (!match) return null;
    const direction = match[1].toLowerCase() as "over" | "under";
    const parsedLine = match[2].replace(",", ".");
    const isKnownLine = (GOALS_LINES as readonly string[]).includes(parsedLine);
    return { direction, line: isKnownLine ? parsedLine : OTHER_VALUE, customLine: isKnownLine ? "" : parsedLine };
  }

  if (isHandicapMarket(marketId)) {
    const match = /^(Home|Away)\s+(.+)$/i.exec(selection);
    if (!match) return null;
    const team = match[1].toLowerCase() as "home" | "away";
    const parsedLine = normalizeSignedLine(match[2]);
    const lines = marketId === "asian_handicap" ? ASIAN_HANDICAP_LINES : EUROPEAN_HANDICAP_LINES;
    const isKnownLine = (lines as readonly string[]).includes(parsedLine);
    return { team, line: isKnownLine ? parsedLine : OTHER_VALUE, customLine: isKnownLine ? "" : parsedLine };
  }

  return isFreeSelectionMarket(marketId) ? {} : null;
}

export function serializeStructuredSelection(
  marketId: MarketId,
  draft: StructuredSelection,
  freeSelection: string
): string {
  if (isFreeSelectionMarket(marketId)) return freeSelection.trim();
  if (SIMPLE_SELECTIONS[marketId]) return draft.choice;
  const line = draft.line === OTHER_VALUE ? normalizeSignedLine(draft.customLine) : draft.line;
  if (marketId === "goals_over_under") return `${draft.direction === "over" ? "Over" : "Under"} ${line}`;
  if (isHandicapMarket(marketId)) return `${draft.team === "home" ? "Home" : "Away"} ${line}`;
  return freeSelection.trim();
}

export function normalizeSignedLine(raw: string): string {
  return raw.trim().replace(",", ".");
}

export function isValidLine(raw: string): boolean {
  return /^[+-]?\d+(?:[.,]\d{1,2})?$/.test(raw.trim());
}
