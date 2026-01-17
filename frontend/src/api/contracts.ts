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
