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

export type AdminOddsTotalsItem = {
  event_id: string;
  sport_key: string;
  kickoff_utc: string | null;
  home_name: string;
  away_name: string;
  match_confidence: "EXACT" | "ILIKE" | "FUZZY" | "NONE" | null;
  fixture_id: number | null;

  market: {
    line: number | null;
    best_over: number | null;
    best_under: number | null;
    market_probs: {
      over: number | null;
      under: number | null;
    } | null;
    overround: number | null;
    latest_captured_at_utc: string | null;
    snapshot_count: number;
  };

  snapshot: {
    model_version?: string | null;
    calc_version?: string | null;
    inputs?: {
      lambda_home?: number | null;
      lambda_away?: number | null;
      lambda_total?: number | null;
    } | null;
    totals?: {
      main_line?: number | null;
      selected_line?: number | null;
      p_model?: {
        over?: number | null;
        under?: number | null;
        push?: number | null;
      } | null;
      best_odds?: {
        over?: number | null;
        under?: number | null;
      } | null;
      lines_available?: string[];
    } | null;
  } | null;

  edge?: {
    over?: number | null;
    under?: number | null;
  } | null;

  ev?: {
    over?: number | null;
    under?: number | null;
  } | null;
};

export type AdminOddsTotalsResponse = {
  ok: boolean;
  meta: {
    sport_key: string | null;
    hours_ahead: number;
    limit: number;
    counts: {
      total: number;
      with_market_line: number;
      with_snapshot: number;
      with_model_probs: number;
    };
  };
  items: AdminOddsTotalsItem[];
};

export type AdminOddsBttsItem = {
  event_id: string;
  sport_key: string;
  kickoff_utc: string | null;
  home_name: string;
  away_name: string;
  match_confidence: "EXACT" | "ILIKE" | "FUZZY" | "NONE" | null;
  fixture_id: number | null;

  market: {
    best_yes: number | null;
    best_no: number | null;
    market_probs: {
      yes: number | null;
      no: number | null;
    } | null;
    overround: number | null;
    latest_captured_at_utc: string | null;
    snapshot_count: number;
  };

  snapshot: {
    model_version?: string | null;
    calc_version?: string | null;
    inputs?: {
      lambda_home?: number | null;
      lambda_away?: number | null;
      lambda_total?: number | null;
    } | null;
    btts?: {
      p_model?: {
        yes?: number | null;
        no?: number | null;
      } | null;
      best_odds?: {
        yes?: number | null;
        no?: number | null;
      } | null;
    } | null;
  } | null;

  edge?: {
    yes?: number | null;
    no?: number | null;
  } | null;

  ev?: {
    yes?: number | null;
    no?: number | null;
  } | null;
};

export type AdminOddsBttsResponse = {
  ok: boolean;
  meta: {
    sport_key: string | null;
    hours_ahead: number;
    limit: number;
    counts: {
      total: number;
      with_market: number;
      with_snapshot: number;
      with_model_probs: number;
    };
  };
  items: AdminOddsBttsItem[];
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

  match_status: "MODEL_FOUND" | "EXACT" | "PROBABLE" | "AMBIGUOUS" | "NOT_FOUND" | null;
  match_score: number | null;

  odds_best: ProductOdds1x2 | null;
  odds_books?: ProductOddsBook[] | null;

  probs_1x2?: ProductOdds1x2 | null;
  has_model?: boolean | null;

  edge_summary?: ProductEdgeSummary | null;

  snapshot_summary?: {
  totals?: {
    line?: number | null;
    p_over?: number | null;
    p_under?: number | null;
    best_over?: number | null;
    best_under?: number | null;
  } | null;
  btts?: {
    p_yes?: number | null;
    p_no?: number | null;
  } | null;
  inputs?: {
    lambda_home?: number | null;
    lambda_away?: number | null;
    lambda_total?: number | null;
  } | null;
} | null;
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

export type ProductLeagueItem = {
  sport_key: string;
  sport_title: string;
  sport_group: string | null;
  league_id: number;
  season_policy: "current" | "fixed";
  fixed_season: number | null;
  regions: string | null;
  hours_ahead: number | null;
  tol_hours: number | null;
};

export type ProductLeaguesResponse = {
  ok: boolean;
  items: ProductLeagueItem[];
  count: number;
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
// Admin — Odds Ops (refresh + resolve + rebuild)
// -------------------------

export type AdminOddsRefreshCounters = Record<string, number>;

export type AdminOddsResolveCounters = Record<string, number>;

export type AdminOddsResolveIssue = Record<string, any>;

export type AdminOddsSnapshotsCounters = Record<string, number>;

export type AdminOddsSnapshotsIssue = Record<string, any>;

export type AdminOddsRefreshBlock = {
  counters: AdminOddsRefreshCounters;
};

export type AdminOddsResolveBlock = {
  counters: AdminOddsResolveCounters;
  sample_issues: AdminOddsResolveIssue[];
};

export type AdminOddsSnapshotsBlock = {
  mode?: string | null;
  counters: AdminOddsSnapshotsCounters;
  sample_issues: AdminOddsSnapshotsIssue[];
};

export type AdminOddsRefreshAndResolveResponse = {
  ok: boolean;
  sport_key: string;
  regions: string;
  captured_at_utc: string;
  refresh: AdminOddsRefreshBlock;
  resolve: AdminOddsResolveBlock;
  snapshots: AdminOddsSnapshotsBlock;
};

export type TeamResolutionPendingItem = {
  sport_key?: string | null;
  raw_name?: string | null;
  normalized_name?: string | null;
  payload?: Record<string, any> | null;
  created_at_utc?: string | null;
  updated_at_utc?: string | null;
};

export type TeamResolutionPendingResponse = {
  ok: boolean;
  items: TeamResolutionPendingItem[];
  count: number;
};

export type TeamSearchItem = {
  team_id: number;
  name: string;
  country_name?: string | null;
};

export type TeamSearchResponse = {
  ok: boolean;
  items: TeamSearchItem[];
  count: number;
};

export type TeamResolutionApproveRequest = {
  sport_key: string;
  raw_name: string;
  team_id: number;
  normalized_name?: string;
  confidence?: number;
};

export type TeamResolutionApproveResponse = {
  ok: boolean;
  sport_key: string;
  raw_name: string;
  normalized_name: string;
  team_id: number;
  removed_from_queue: number;
};

export type AdminOpsJobResponse = {
  ok: boolean;
  job: string;
  elapsed_sec: number;
  counters: Record<string, any>;
  error: string | null;
};