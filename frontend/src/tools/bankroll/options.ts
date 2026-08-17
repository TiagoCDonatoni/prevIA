export const MARKET_IDS = [
  "1x2",
  "double_chance",
  "draw_no_bet",
  "asian_handicap",
  "european_handicap",
  "goals_over_under",
  "both_teams_to_score",
  "team_goals",
  "corners",
  "cards",
  "correct_score",
  "to_qualify",
  "other",
] as const;

export type MarketId = (typeof MARKET_IDS)[number];

export const BOOKMAKERS = [
  "Bet365",
  "Betano",
  "Betfair",
  "Betnacional",
  "Betsson",
  "Betway",
  "KTO",
  "Novibet",
  "Sportingbet",
  "Superbet",
] as const;

export const GOALS_LINES = ["0.5", "1.5", "2.5", "3.5", "4.5", "5.5"] as const;
export const ASIAN_HANDICAP_LINES = [
  "-2.5", "-2.0", "-1.75", "-1.5", "-1.25", "-1.0", "-0.75", "-0.5", "-0.25",
  "0", "+0.25", "+0.5", "+0.75", "+1.0", "+1.25", "+1.5", "+1.75", "+2.0", "+2.5",
] as const;
export const EUROPEAN_HANDICAP_LINES = ["-3", "-2", "-1", "0", "+1", "+2", "+3"] as const;

export const SIMPLE_SELECTIONS: Partial<Record<MarketId, readonly string[]>> = {
  "1x2": ["home", "draw", "away"],
  double_chance: ["1X", "12", "X2"],
  draw_no_bet: ["home", "away"],
  both_teams_to_score: ["yes", "no"],
  to_qualify: ["home", "away"],
};

export const FREE_SELECTION_MARKETS: readonly MarketId[] = [
  "other", "team_goals", "corners", "cards", "correct_score",
];
