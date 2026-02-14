/**
 * Admin v1 — Backend Contract (expected endpoints)
 *
 * These are the endpoints the UI expects. They are designed to be:
 * - global team selection (no league pre-filter required)
 * - season auto by default
 * - fixture-based inference as default, with what-if fallback
 */

export type KpiSnapshot = {
  world: {
    teams_total: number;
    competitions_total: number;
    leagues_allowlisted: number; // optional / derived
    fixtures_total: number;
    fixtures_with_features: number;
  };
  quality: {
    brier: number;
    logloss: number;
    top1_acc: number;
    ece?: number; // optional
  };
  freshness: {
    last_db_update_utc: string;
    lag_hours: number;
    failed_jobs_7d: number;
  };
};

export type TeamLite = {
  team_id: number;
  name: string;
  country?: string;
};

export type FixtureLite = {
  fixture_id: number;
  kickoff_utc: string;
  competition_name: string;
  season: number;
  venue?: "HOME" | "AWAY" | "NEUTRAL";
};

export type MatchupByFixtureRequest = {
  fixture_id: number;
  artifact_id?: string;
};

export type MatchupWhatIfRequest = {
  home_team_id: number;
  away_team_id: number;
  reference_date_utc?: string; // default: now
  venue_mode?: "HOME" | "NEUTRAL"; // default: HOME
  competition_id?: number; // optional
  artifact_id?: string;
  league_id?: number;
  season?: number;
};

export type MatchupResponse = {
  meta: {
    fixture_id?: number;
    competition_name?: string;
    season?: number;
    kickoff_utc?: string;
    artifact_id: string;
    is_whatif: boolean;
  };
  probs_1x2: { H: number; D: number; A: number };
  fair_odds_1x2: { H: number; D: number; A: number };
  drivers?: Array<{ key: string; label: string; value: string }>;
};

export type ArtifactRow = {
  artifact_id: string;
  model_id: string;
  league_or_competition?: string;
  seasons_train: string;
  calibrated: boolean;
  brier: number;
  logloss: number;
  top1_acc: number;
  trained_at_utc: string;
  status: "champion" | "challenger" | "deprecated";
};

export type RunRow = {
  run_id: string;
  created_at_utc: string;
  artifact_id: string;
  scope: string; // e.g. league=39, seasons=2021-2023, etc.
  brier: number;
  logloss: number;
  top1_acc: number;
};

export type TeamSummaryMatch = {
  fixture_id: number;
  kickoff_utc: string | null;
  league_id: number | null;
  season: number | null;
  round: string | null;
  home_team: { team_id: number; name: string };
  away_team: { team_id: number; name: string };
  goals_home: number | null;
  goals_away: number | null;
  team_result: "W" | "D" | "L";
  team_gf: number | null;
  team_ga: number | null;
};

export type TeamSummary = {
  team: {
    team_id: number;
    name: string;
    country?: string | null;
    is_national: boolean;
    logo_url?: string | null;
    venue: { name?: string | null; city?: string | null; capacity?: number | null };
  };
  filters: { season?: number | null; last_n: number };
  stats: {
    matches: number;
    matches_home: number;
    matches_away: number;
    wins: number;
    draws: number;
    losses: number;
    goals_for: number;
    goals_against: number;
    points: number;
    ppg: number;
    avg_goals_for: number;
    avg_goals_against: number;
  };
  splits: {
    home: { w: number; d: number; l: number; gf: number; ga: number };
    away: { w: number; d: number; l: number; gf: number; ga: number };
  };
  last_matches: TeamSummaryMatch[];
};

export type Odds1x2 = { H: number; D: number; A: number };

export type OddsMarketProbs = {
  raw: Odds1x2;
  novig: Odds1x2;
  overround: number;
};

export type OddsResolved = {
  home_team_id: number | null;
  away_team_id: number | null;
  fixture_id: number | null;
  match_confidence: "EXACT" | "ILIKE" | "FUZZY" | "NONE";
};

export type OddsSnapshot = {
  bookmaker: string;
  market: string;
  odds_1x2: Odds1x2 | null;
  captured_at_utc: string;
  freshness_seconds: number | null;
};

export type OddsModelMeta = {
  train_seasons: number[];
  n_samples: number;
  trained_at_utc: string;
  calibration: any | null;
};

export type OddsModelEval = {
  artifact_filename: string;
  league_id: number;
  season: number;
  probs_model: Odds1x2;
  edge_vs_market: Odds1x2;
  ev_decimal: Odds1x2;
  best_ev: number;
  best_side: "H" | "D" | "A";
  artifact_meta: OddsModelMeta;
};

export type OddsIntelItem = {
  event_id: string;
  sport_key: string;
  kickoff_utc: string;
  home_name: string;
  away_name: string;
  resolved: OddsResolved;
  latest_snapshot: OddsSnapshot;
  market_probs: OddsMarketProbs | null;
  model: OddsModelEval | { error: string } | null;
  status: "ok" | "incomplete";
  reason: string | null;
};

export type OddsIntelMeta = {
  sport_key: string;
  hours_ahead: number;
  min_confidence: "EXACT" | "ILIKE" | "FUZZY" | "NONE";
  limit: number;
  artifact_filename: string;
  assume_league_id: number;
  assume_season: number;
  sort: string;
  order: "asc" | "desc";
  counts: {
    total: number;
    ok_model: number;
    missing_team: number;
    model_error: number;
  };
};

export type OddsIntelResponse = {
  meta: OddsIntelMeta;
  items: OddsIntelItem[];
};

// -------------------------
// Produto (MVP) — Odds v1
// -------------------------

export type ProductOdds1x2 = { H: number; D: number; A: number };

export type ProductEdgeSummary = {
  best_outcome: "H" | "D" | "A" | null;
  best_edge: number | null;
  best_odd: number | null;
  best_book_key: string | null;
  best_book_name: string | null;
  market_books_count: number;
  market_min_odd: number | null;
  market_max_odd: number | null;
};

export type ProductOddsEvent = {
  event_id: string;
  sport_key: string;
  commence_time_utc: string | null;
  home_name: string;
  away_name: string;
  latest_captured_at_utc: string | null;

  match_status: "EXACT" | "PROBABLE" | "AMBIGUOUS" | "NOT_FOUND" | null;
  match_score: number | null;

  odds_best: ProductOdds1x2 | null;
  odds_books?: ProductOddsBook[] | null;

  edge_summary?: ProductEdgeSummary | null;
};

export type ProductOddsBook = {
  key: string;
  name: string;
  is_affiliate?: boolean;
  url?: string | null;
  odds_1x2?: ProductOdds1x2 | null;
};

export type ProductOddsEventsResponse = {
  ok: boolean;
  generated_at_utc: string;
  sport_key: string;
  events: ProductOddsEvent[];
};

export type ProductOddsQuoteRequest = {
  event_id: string;
  assume_league_id: number;
  assume_season: number;
  artifact_filename: string;
  tol_hours?: number;
};

export type ProductOddsQuoteResponse = {
  ok: boolean;
  event_id: string;
  matchup: {
    status: "EXACT" | "PROBABLE" | "AMBIGUOUS" | "NOT_FOUND";
    confidence: number;
    league_id: number;
    season: number;
    fixture_id: number | null;
    home_team_id: number | null;
    away_team_id: number | null;
    reason?: string | null;
    books?: ProductOddsBook[] | null;

    model_season_requested?: number;
    model_season_used?: number | null;
    model_season_mode?: "requested" | "fallback_latest" | "none";
    model_status?: string;
    model_error?: string;
  };
  probs: ProductOdds1x2 | null;
  odds: {
    source: "db";
    latest_captured_at_utc: string | null;
    best: ProductOdds1x2 | null;
    books?: ProductOddsBook[] | null;
  };
  value?: {
    market?: string;
    edge?: ProductOdds1x2 | null;
  };
};

// -------------------------
// Admin — Odds Ops (refresh + resolve)
// -------------------------

export type AdminOddsRefreshCounters = {
  events_upserted: number;
  snapshots_inserted: number;
  snapshots_skipped: number;
};

export type AdminOddsResolveCounters = {
  events_scanned: number;
  exact: number;
  probable: number;
  ambiguous: number;
  not_found: number;
  errors: number;
  persisted: number;
};

export type AdminOddsResolveIssue = {
  event_id: string;
  status: "EXACT" | "PROBABLE" | "AMBIGUOUS" | "NOT_FOUND" | string;
  confidence: number;
  reason: string;
};

export type AdminOddsRefreshAndResolveResponse = {
  ok: boolean;
  sport_key: string;
  regions: string;
  captured_at_utc: string;
  refresh: AdminOddsRefreshCounters;
  resolve: {
    window_hours: number;
    assume_league_id: number;
    assume_season: number;
    tol_hours: number;
    counters: AdminOddsResolveCounters;
    sample_issues: AdminOddsResolveIssue[];
  };
};
