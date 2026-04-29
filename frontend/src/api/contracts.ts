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

export type OddsModelRuntimeStats = {
  home: {
    season_requested: number;
    season_used: number | null;
    season_mode: string;
  };
  away: {
    season_requested: number;
    season_used: number | null;
    season_mode: string;
  };
  match_stats_mode: "exact" | "partial_fallback" | "full_fallback" | "unknown";
};

export type OddsModelRuntime = {
  requested_season: number;
  stats_runtime?: OddsModelRuntimeStats | null;
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
  runtime?: OddsModelRuntime | null;
  model_status?: string;
};

export type OddsModelError = {
  error: string;
  model_status?: string;
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
  model: OddsModelEval | OddsModelError | null;
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
  runtime_counts: {
    ok_exact: number;
    ok_fallback: number;
    missing_same_league: number;
    missing_exact: number;
    other_model_error: number;
  };
  coverage: {
    ok_total_pct: number;
    ok_exact_pct: number;
    ok_fallback_pct: number;
    missing_team_pct: number;
    missing_same_league_pct: number;
    model_error_pct: number;
  };
};

export type OddsIntelResponse = {
  meta: OddsIntelMeta;
  items: OddsIntelItem[];
};

export type AdminOddsAuditMetrics = {
  brier: number | null;
  logloss: number | null;
  top1_acc: number | null;
};

export type AdminOddsAuditCounts = {
  picked_rows: number;
  with_model_probs: number;
  with_market_probs: number;
  with_both: number;
};

export type AdminOddsAuditDiagnostics = {
  severe_threshold: number;
  severe_miss_count: number;
  severe_miss_rate: number | null;
};

export type AdminOddsAuditSummaryResponse = {
  meta: {
    league_id: number | null;
    season: number | null;
    window_days: number;
    cutoff_hours: number;
    artifact_filename: string | null;
    min_confidence: "NONE" | "ILIKE" | "EXACT";
    start_utc: string;
    end_utc: string;
    offset_windows?: number;
  };
  counts: AdminOddsAuditCounts;
  model: AdminOddsAuditMetrics;
  market_novig: AdminOddsAuditMetrics;
  comparison: {
    model_minus_market: AdminOddsAuditMetrics;
  };
  diagnostics: AdminOddsAuditDiagnostics;
};

export type AdminOddsAuditByLeagueRow = {
  league_id: number | null;
  season: number | null;
  counts: AdminOddsAuditCounts;
  model: AdminOddsAuditMetrics;
  market_novig: AdminOddsAuditMetrics;
  comparison: {
    model_minus_market: AdminOddsAuditMetrics;
  };
  diagnostics: AdminOddsAuditDiagnostics;
};

export type AdminOddsAuditByLeagueResponse = {
  meta: {
    season: number | null;
    window_days: number;
    cutoff_hours: number;
    artifact_filename: string | null;
    min_confidence: "NONE" | "ILIKE" | "EXACT";
    start_utc: string;
    end_utc: string;
    offset_windows?: number;
  };
  rows: AdminOddsAuditByLeagueRow[];
};

export type AdminOddsAuditEventRow = {
  event_id: string;
  artifact_filename: string;
  sport_key: string | null;
  kickoff_utc: string | null;
  captured_at_utc: string | null;
  home_name: string | null;
  away_name: string | null;
  league_id: number | null;
  season: number | null;
  match_confidence: "NONE" | "ILIKE" | "EXACT" | null;
  best_side: "H" | "D" | "A" | null;
  best_side_prob: number | null;
  best_ev: number | null;
  model_probs: { H: number; D: number; A: number } | null;
  market_probs: { H: number; D: number; A: number } | null;
  result_1x2: "H" | "D" | "A" | null;
  home_goals: number | null;
  away_goals: number | null;
  severe_miss: boolean;
  model_metrics: AdminOddsAuditMetrics | null;
  market_metrics: AdminOddsAuditMetrics | null;
};

export type AdminOddsAuditEventsResponse = {
  meta: {
    league_id: number | null;
    season: number | null;
    window_days: number;
    cutoff_hours: number;
    artifact_filename: string | null;
    min_confidence: "NONE" | "ILIKE" | "EXACT";
    severe_threshold: number;
    only_severe: boolean;
    limit: number;
    start_utc: string;
    end_utc: string;
    returned: number;
    offset_windows?: number;
  };
  rows: AdminOddsAuditEventRow[];
};

export type AdminOddsAuditSyncResultsResponse = {
  ok: boolean;
  inserted: number;
  scanned: number;
  cutoff_utc: string | null;
  lookback_utc: string | null;
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

  best_ev?: number | null;
  best_ev_outcome?: "H" | "D" | "A" | null;
  best_ev_odd?: number | null;
  best_ev_book_key?: string | null;
  best_ev_book_name?: string | null;

  opportunity_outcome?: "H" | "D" | "A" | null;
  opportunity_edge?: number | null;
  opportunity_ev?: number | null;
  opportunity_odd?: number | null;
  opportunity_book_key?: string | null;
  opportunity_book_name?: string | null;
  opportunity_book_captured_at_utc?: string | null;
  opportunity_book_freshness_seconds?: number | null;

  market_books_count: number;
  market_complete_books_count?: number;
  market_min_odd: number | null;
  market_max_odd: number | null;

  consensus_probs?: ProductOdds1x2 | null;
  consensus_edges?: ProductOdds1x2 | null;
  market_source?: string | null;
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
  has_opportunity?: boolean | null;

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
  captured_at_utc?: string | null;
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
  official_name?: string | null;
  official_country_code?: string | null;
  sport_group: string | null;
  country_name?: string | null;
  league_id: number;
  season_policy: "current" | "fixed";
  fixed_season: number | null;
  regions: string | null;
  hours_ahead: number | null;
  tol_hours: number | null;
  next_kickoff_utc?: string | null;
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
  artifact_filename?: string;
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
    market?: {
      raw?: ProductOdds1x2 | null;
      novig?: ProductOdds1x2 | null;
      overround?: number | null;
      books_count?: number;
      source?: string | null;
    } | null;
    edge?: ProductOdds1x2 | null;
    ev_decimal?: ProductOdds1x2 | null;
    best_ev?: number | null;
    best_side?: "H" | "D" | "A" | null;
  } | null;
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
  run_id?: number | null;
  attempt_id?: number | null;
  status?: string | null;
  elapsed_sec: number;
  counters: Record<string, any>;
  error: string | null;
  blocked_reason?: string | null;
  execution_mode?: string | null;
  fallback_reason?: string | null;
};

export type AdminOpsPipelineHealthResponse = {
  ok: boolean;
  generated_at_utc: string | null;
  freshness: {
    raw_fixtures_last_ok_at_utc: string | null;
    core_fixtures_last_updated_at_utc: string | null;
    odds_events_last_updated_at_utc: string | null;
    odds_snapshots_last_captured_at_utc: string | null;
  };
  core_checks: {
    lookback_days: number;
    fixtures_total: number;
    fixtures_finished: number;
    fixtures_with_goals: number;
    fixtures_past_due_ns: number;
  };
  failed_runs: {
    last_24h: number;
    last_7d: number;
  };
  last_runs: Record<
    string,
    | {
        run_id: number;
        status: string;
        scope_key: string | null;
        sport_key: string | null;
        started_at_utc: string | null;
        finished_at_utc: string | null;
        duration_ms: number | null;
        error: any | null;
      }
    | null
  >;
};

export type AdminOpsRunRow = {
  run_id: number;
  job_key: string;
  trigger_source: string | null;
  requested_by: string | null;
  scope_type: string | null;
  scope_key: string | null;
  sport_key: string | null;
  status: string;
  block_reason: string | null;
  result: any | null;
  counters: any | null;
  error: any | null;
  started_at_utc: string | null;
  finished_at_utc: string | null;
  duration_ms: number | null;
  updated_at_utc: string | null;
};

export type AdminOpsRunsRecentResponse = {
  ok: boolean;
  items: AdminOpsRunRow[];
  count: number;
};

export type AdminOpsRunEvent = {
  attempt_id: number | null;
  event_type: string;
  event_level: string;
  message: string | null;
  payload: any | null;
  created_at_utc: string | null;
};

export type AdminOpsRunEventsResponse = {
  ok: boolean;
  run_id: number;
  items: AdminOpsRunEvent[];
  count: number;
};

export type AdminUserSummary = {
  user_id: number;
  email: string;
  full_name: string | null;
  preferred_lang: string | null;
  status: string;
  email_verified: boolean;
  created_at_utc: string | null;
  last_login_at_utc: string | null;
  subscription: {
    plan_code: string;
    provider: string | null;
    status: string | null;
    current_period_end_utc: string | null;
  };
  usage_today: {
    base_daily_limit: number;
    extra_credits: number;
    bonus_credits_available: number;
    daily_limit: number;
    credits_used: number;
    revealed_count: number;
    remaining: number;
  };
  role_keys: string[];
  is_internal: boolean;
  billing_runtime: string;
};

export type AdminUsersListResponse = {
  ok: boolean;
  items: AdminUserSummary[];
  count: number;
  limit: number;
  offset: number;
};

export type AdminCreateUserResponse = {
  ok: boolean;
  user: {
    user_id: number;
    email: string;
    full_name: string | null;
    status: string;
  };
  subscription: {
    plan_code: string;
  };
};

export type AdminAssignedRole = {
  role_key: string;
  is_active: boolean;
  grant_source: string;
  notes: string | null;
  created_at_utc: string | null;
  updated_at_utc: string | null;
};

export type AdminUserDetailResponse = {
  ok: boolean;
  user: {
    user_id: number;
    email: string;
    full_name: string | null;
    preferred_lang: string | null;
    status: string;
    email_verified: boolean;
    created_at_utc: string | null;
    last_login_at_utc: string | null;
  };
  subscription: {
    subscription_id: number | null;
    plan_code: string;
    provider: string | null;
    status: string | null;
    billing_cycle: string | null;
    current_period_start_utc: string | null;
    current_period_end_utc: string | null;
    cancel_at_period_end: boolean;
    updated_at_utc: string | null;
  };
  usage_today: {
    date_key: string;
    base_daily_limit: number;
    extra_credits: number;
    bonus_credits_available: number;
    daily_limit: number;
    credits_used: number;
    revealed_count: number;
    remaining: number;
  };
  assigned_roles: AdminAssignedRole[];
  effective_access: {
    is_internal: boolean;
    billing_runtime: string;
    role_keys: string[];
    capabilities: string[];
    admin_access: boolean;
    product_internal_access: boolean;
    allow_plan_override: boolean;
    product_plan_code: string | null;
    domain_rule?: {
      domain?: string | null;
      source?: string | null;
    } | null;
  };
  recent_subscription_events: Array<{
    event_type: string;
    payload_json: Record<string, unknown> | null;
    created_at_utc: string | null;
  }>;
  recent_admin_audit: Array<{
    action_key: string;
    actor_email: string | null;
    meta_json: Record<string, unknown> | null;
    created_at_utc: string | null;
  }>;
};

// -------------------------
// Admin — OddsPapi enrichment
// -------------------------

export type AdminOddspapiUsageStatus = {
  month_start_utc: string | null;
  request_count: number;
  hard_cap: number;
  reserve: number;
  operational_cap: number;
  remaining_operational: number;
  is_capped: boolean;
  last_endpoint?: string | null;
  last_request_at_utc?: string | null;
  last_status?: string | null;
  last_error?: string | null;
  updated_at_utc?: string | null;
};

export type AdminOddspapiStatusResponse = {
  ok: boolean;
  provider: "oddspapi" | string;
  mode: string;
  source_of_truth: string;
  enabled: boolean;
  api_key_set: boolean;
  base_url: string;
  usage: AdminOddspapiUsageStatus;
  bookmakers: {
    primary: string[];
    secondary: string[];
  };
  last_request: {
    endpoint: string | null;
    at_utc: string | null;
    status: string | null;
    error: string | null;
  };
  policy: Record<string, any>;
};

export type AdminOddspapiEventStatusItem = {
  provider: string;
  provider_event_id: string;
  canonical_event_id: string;
  core_fixture_id: number | null;
  sport_key: string | null;
  confidence: number | null;
  match_reason: string | null;
  active: boolean;
  created_at_utc: string | null;
  updated_at_utc: string | null;
  snapshots_1x2: {
    count: number;
    last_captured_at_utc: string | null;
    bookmakers: string[];
  };
  refresh: {
    log_count: number;
    last_refresh_log_at_utc: string | null;
    summary: string | null;
  };
};

export type AdminOddspapiEventsStatusResponse = {
  ok: boolean;
  provider: "oddspapi" | string;
  mode: string;
  request_count_consumed: number;
  count: number;
  filters: {
    core_fixture_id: number | null;
    canonical_event_id: string | null;
    limit: number;
  };
  usage: AdminOddspapiUsageStatus;
  items: AdminOddspapiEventStatusItem[];
  policy: Record<string, any>;
};

export type AdminOddspapiRunResponse = {
  ok: boolean;
  provider: "oddspapi" | string;
  mode: string;
  dry_run: boolean;
  request_count_consumed: number;
  request_budget_remaining?: number;
  usage_before?: AdminOddspapiUsageStatus;
  usage_after?: AdminOddspapiUsageStatus;
  params?: Record<string, any>;
  phases?: Record<string, any>;
  counters?: Record<string, any>;
  policy?: Record<string, any>;
  reason?: string | null;
};

export type AdminAccessCampaign = {
  campaign_id: number;
  slug: string;
  label: string;
  kind: string;
  status: string;

  trial_enabled: boolean;
  trial_plan_code: string | null;
  trial_duration_days: number | null;
  trial_grant_category: string;

  allow_existing_users: boolean;
  allow_previous_trial_users: boolean;
  allow_paid_upgrade_trial: boolean;
  requires_approval: boolean;

  starts_at_utc: string | null;
  expires_at_utc: string | null;
  max_redemptions: number | null;
  redeemed_count: number;

  created_at_utc: string | null;
  updated_at_utc: string | null;
  metadata_json: Record<string, any>;

  active_grants_count?: number;
  redeemed_rows_count?: number;
  public_url_path?: string;
};

export type AdminAccessCampaignOffer = {
  offer_id: number;
  campaign_id: number;
  status: string;

  discount_type: string;
  discount_percent: number | null;
  discount_amount_cents: number | null;
  currency: string | null;

  discount_duration: string;
  discount_duration_months: number | null;

  eligible_plan_codes: string[];
  eligible_billing_cycles: string[];

  offer_valid_until_utc: string | null;
  offer_valid_days_after_grant_end: number | null;

  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;

  max_redemptions: number | null;
  redeemed_count: number;

  created_at_utc: string | null;
  updated_at_utc: string | null;
  metadata_json: Record<string, any>;
};

export type AdminAccessCampaignRedemption = {
  redemption_id: number;
  status: string;
  failure_reason: string | null;
  redeemed_at_utc: string | null;
  email_normalized: string;
  email: string | null;
  full_name: string | null;
  grant: null | {
    grant_id: number;
    grant_category: string;
    plan_code: string;
    starts_at_utc: string | null;
    ends_at_utc: string | null;
    status: string;
  };
};

export type AdminAccessCampaignsListResponse = {
  ok: true;
  campaigns: AdminAccessCampaign[];
};

export type AdminAccessCampaignDetailResponse = {
  ok: true;
  campaign: AdminAccessCampaign;
  offer: AdminAccessCampaignOffer | null;
  redemptions: AdminAccessCampaignRedemption[];
};

export type AdminAccessCampaignOfferPayload = {
  enabled: boolean;
  status?: string;
  discount_type: "percent" | "amount";
  discount_percent?: number | null;
  discount_amount_cents?: number | null;
  currency?: string | null;
  discount_duration: "once" | "repeating" | "forever";
  discount_duration_months?: number | null;
  eligible_plan_codes: string[];
  eligible_billing_cycles: string[];
  offer_valid_until_utc?: string | null;
  offer_valid_days_after_grant_end?: number | null;
  stripe_coupon_id?: string | null;
  stripe_promotion_code_id?: string | null;
  max_redemptions?: number | null;
  metadata_json?: Record<string, any>;
};

export type AdminAccessCampaignUpsertPayload = {
  slug: string;
  label: string;
  kind: string;
  status: string;

  trial_enabled: boolean;
  trial_plan_code: string | null;
  trial_duration_days: number | null;
  trial_grant_category: string;

  allow_existing_users: boolean;
  allow_previous_trial_users: boolean;
  allow_paid_upgrade_trial: boolean;
  requires_approval: boolean;

  starts_at_utc: string | null;
  expires_at_utc: string | null;
  max_redemptions: number | null;

  metadata_json: Record<string, any>;
  offer?: AdminAccessCampaignOfferPayload;
};