/**
 * Mock API client.
 * Replace these with real fetch calls when the backend is ready.
 */
import { API_BASE_URL } from "../config";

import type {
  ArtifactRow,
  FixtureLite,
  KpiSnapshot,
  MatchupByFixtureRequest,
  MatchupResponse,
  MatchupWhatIfRequest,
  RunRow,
  TeamLite,
  TeamSummary,
  ProductOddsEventsResponse,
  ProductOddsQuoteRequest,
  ProductOddsQuoteResponse,
  AdminOpsJobResponse,
  ProductLeaguesResponse,
  TeamResolutionPendingResponse,
  TeamSearchResponse,
  TeamResolutionApproveRequest,
  TeamResolutionApproveResponse,
  AdminOddsTotalsResponse,
  AdminOddsBttsResponse,
  AdminCreateUserResponse,
  AdminUserDetailResponse,
  AdminUsersListResponse,
  AdminOddsAuditSummaryResponse,
  AdminOddsAuditByLeagueResponse,
  AdminOddsAuditEventsResponse,
  AdminOddsAuditSyncResultsResponse,
  AdminOpsPipelineHealthResponse,
  AdminOpsRunsRecentResponse,
  AdminOpsRunEventsResponse,
} from "./contracts";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const MOCK_TEAMS: TeamLite[] = [
  { team_id: 40, name: "Liverpool", country: "England" },
  { team_id: 49, name: "Chelsea", country: "England" },
  { team_id: 42, name: "Arsenal", country: "England" },
  { team_id: 33, name: "Manchester United", country: "England" },
  { team_id: 157, name: "Bayern Munich", country: "Germany" },
  { team_id: 165, name: "Borussia Dortmund", country: "Germany" },
];

const MOCK_FIXTURES: FixtureLite[] = [
  {
    fixture_id: 900001,
    kickoff_utc: "2026-01-11T04:36:17Z",
    competition_name: "UEFA Champions League",
    season: 2026,
    venue: "NEUTRAL",
  },
  {
    fixture_id: 900002,
    kickoff_utc: "2026-01-12T04:36:17Z",
    competition_name: "Premier League",
    season: 2026,
    venue: "HOME",
  },
];

const MOCK_ARTIFACTS: ArtifactRow[] = [
  {
    artifact_id: "epl_1x2_logreg_tempcal_v1_C_2021_2023_C0.3_cal2023",
    model_id: "1x2_logreg_v1",
    league_or_competition: "Premier League",
    seasons_train: "2021–2023",
    calibrated: true,
    brier: 0.192,
    logloss: 0.568,
    top1_acc: 0.528,
    trained_at_utc: "2026-01-05T12:10:00Z",
    status: "champion",
  },
  {
    artifact_id: "epl_1x2_logreg_v1_C0.5",
    model_id: "1x2_logreg_v1",
    league_or_competition: "Premier League",
    seasons_train: "2021–2023",
    calibrated: false,
    brier: 0.199,
    logloss: 0.579,
    top1_acc: 0.521,
    trained_at_utc: "2025-12-28T09:40:00Z",
    status: "challenger",
  },
];

const MOCK_RUNS: RunRow[] = [
  {
    run_id: "run_2026_01_05_001",
    created_at_utc: "2026-01-05T13:02:00Z",
    artifact_id: "epl_1x2_logreg_tempcal_v1_C0.3_cal2023",
    scope: "league=39; seasons=2021-2023; backtest=2023",
    brier: 0.190,
    logloss: 0.563,
    top1_acc: 0.531,
  },
];

async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}${txt ? ` | ${txt}` : ""}`);
  }

  return (await res.json()) as T;
}

export async function getKpis(): Promise<KpiSnapshot> {
  await sleep(120);
  return {
    world: {
      teams_total: 682,
      competitions_total: 32,
      leagues_allowlisted: 1,
      fixtures_total: 13240,
      fixtures_with_features: 12610,
    },
    quality: {
      brier: 0.192,
      logloss: 0.568,
      top1_acc: 0.528,
      ece: 0.031,
    },
    freshness: {
      last_db_update_utc: "2026-01-11T10:05:00Z",
      lag_hours: 2.4,
      failed_jobs_7d: 0,
    },
  };
}

export async function searchTeams(q: string, limit = 20) {
  const qq = (q || "").trim();
  if (qq.length < 2) return [];

  const url = new URL("/admin/teams", API_BASE_URL);
  url.searchParams.set("q", qq);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET /admin/teams failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as any[];
}


export async function listArtifacts(): Promise<ArtifactRow[]> {
  await sleep(120);
  return MOCK_ARTIFACTS;
}

export async function listRuns(): Promise<RunRow[]> {
  await sleep(120);
  return MOCK_RUNS;
}

export async function findUpcomingFixturesBetweenTeams(_homeTeamId: number, _awayTeamId: number): Promise<FixtureLite[]> {
  await sleep(160);
  return MOCK_FIXTURES;
}

export async function matchupByFixture(req: MatchupByFixtureRequest): Promise<MatchupResponse> {
  const url = new URL("/admin/matchup/by-fixture", API_BASE_URL);
  url.searchParams.set("fixture_id", String(req.fixture_id));
  if (req.artifact_id) url.searchParams.set("artifact_id", req.artifact_id);

  return fetchJson<MatchupResponse>(url.toString(), { headers: { Accept: "application/json" } });
}

export async function matchupWhatIf(req: MatchupWhatIfRequest): Promise<MatchupResponse> {
  const url = new URL("/admin/matchup/whatif", API_BASE_URL);

  url.searchParams.set("home_team_id", String(req.home_team_id));
  url.searchParams.set("away_team_id", String(req.away_team_id));

  // Mantém compat com a UI atual (advanced), mesmo que backend ignore por enquanto
  if (req.venue_mode) url.searchParams.set("venue_mode", req.venue_mode);
  if (req.reference_date_utc) url.searchParams.set("reference_date_utc", req.reference_date_utc);
  if (req.competition_id != null) url.searchParams.set("competition_id", String(req.competition_id));

  if (req.league_id != null) url.searchParams.set("league_id", String(req.league_id));
  if (req.season != null) url.searchParams.set("season", String(req.season));

  // Obrigatório no backend atual
  if (req.artifact_id) url.searchParams.set("artifact_id", req.artifact_id);

  return fetchJson<MatchupResponse>(url.toString(), { headers: { Accept: "application/json" } });
}

export async function getTeamSummary(teamId: number, lastN = 20, season?: number): Promise<TeamSummary> {
  const url = new URL("/admin/team/summary", API_BASE_URL);
  url.searchParams.set("team_id", String(teamId));
  url.searchParams.set("last_n", String(lastN));
  if (season) url.searchParams.set("season", String(season));

  const res = await fetch(url.toString(), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET /admin/team/summary failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as TeamSummary;
}

export async function listTeams(limit = 300, offset = 0): Promise<TeamLite[]> {
  const url = new URL("/admin/teams/list", API_BASE_URL);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const res = await fetch(url.toString(), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET /admin/teams/list failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as TeamLite[];
}

export async function getMetricsOverview(): Promise<{
  teams: number;
  fixtures_total: number;
  fixtures_finished: number;
  fixtures_cancelled: number;
  leagues: number;
  kickoff_min_utc: string | null;
  kickoff_max_utc: string | null;
}> {
  const url = new URL("/admin/metrics/overview", API_BASE_URL);
  const res = await fetch(url.toString(), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as any;
}

export async function getArtifactMetrics(params?: {
  league_id?: number;
  season?: number;
  limit?: number;
  sort?: "brier" | "logloss" | "top1_acc" | "created_at_utc";
  order?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.league_id != null) qs.set("league_id", String(params.league_id));
  if (params?.season != null) qs.set("season", String(params.season));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.order) qs.set("order", params.order);

  const url = new URL("/admin/metrics/artifacts", API_BASE_URL);
  url.search = qs.toString();
  return fetchJson(url.toString());
}

import type { OddsIntelResponse, AdminOddsRefreshAndResolveResponse } from "./contracts";

export async function getOddsQueueIntel(params: {
  sport_key: string;
  hours_ahead?: number;
  limit?: number;
  min_confidence?: "EXACT" | "ILIKE" | "FUZZY" | "NONE";
  sort?: string; // "best_ev" | "ev_h" | "ev_d" | "ev_a" etc (backend valida)
  order?: "asc" | "desc";
  artifact_filename?: string;
  assume_league_id?: number;
  assume_season?: number;
}): Promise<OddsIntelResponse> {
  const qs = new URLSearchParams();
  qs.set("sport_key", params.sport_key);

  if (params.hours_ahead != null) qs.set("hours_ahead", String(params.hours_ahead));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.min_confidence) qs.set("min_confidence", params.min_confidence);
  if (params.sort) qs.set("sort", params.sort);
  if (params.order) qs.set("order", params.order);

  if (params.artifact_filename) qs.set("artifact_filename", params.artifact_filename);
  if (params.assume_league_id != null) qs.set("assume_league_id", String(params.assume_league_id));
  if (params.assume_season != null) qs.set("assume_season", String(params.assume_season));

  const url = new URL("/admin/odds/queue/intel", API_BASE_URL);
  url.search = qs.toString();
  return fetchJson<OddsIntelResponse>(url.toString());
}

export async function getAdminOddsAuditSummary(params?: {
  league_id?: number | null;
  season?: number | null;
  window_days?: number;
  cutoff_hours?: number;
  artifact_filename?: string | null;
  min_confidence?: "NONE" | "ILIKE" | "EXACT";
  severe_threshold?: number;
  offset_windows?: number;
}): Promise<AdminOddsAuditSummaryResponse> {
  const url = new URL("/admin/odds/audit/reliability", API_BASE_URL);

  if (params?.league_id != null) url.searchParams.set("league_id", String(params.league_id));
  if (params?.season != null) url.searchParams.set("season", String(params.season));
  if (params?.window_days != null) url.searchParams.set("window_days", String(params.window_days));
  if (params?.cutoff_hours != null) url.searchParams.set("cutoff_hours", String(params.cutoff_hours));
  if (params?.artifact_filename) url.searchParams.set("artifact_filename", params.artifact_filename);
  if (params?.min_confidence) url.searchParams.set("min_confidence", params.min_confidence);
  if (params?.severe_threshold != null) url.searchParams.set("severe_threshold", String(params.severe_threshold));
  if (params?.offset_windows != null) url.searchParams.set("offset_windows", String(params.offset_windows));

  return fetchJson<AdminOddsAuditSummaryResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function getAdminOddsAuditByLeague(params?: {
  season?: number | null;
  window_days?: number;
  cutoff_hours?: number;
  artifact_filename?: string | null;
  min_confidence?: "NONE" | "ILIKE" | "EXACT";
  severe_threshold?: number;
  offset_windows?: number;
}): Promise<AdminOddsAuditByLeagueResponse> {
  const url = new URL("/admin/odds/audit/reliability/by-league", API_BASE_URL);

  if (params?.season != null) url.searchParams.set("season", String(params.season));
  if (params?.window_days != null) url.searchParams.set("window_days", String(params.window_days));
  if (params?.cutoff_hours != null) url.searchParams.set("cutoff_hours", String(params.cutoff_hours));
  if (params?.artifact_filename) url.searchParams.set("artifact_filename", params.artifact_filename);
  if (params?.min_confidence) url.searchParams.set("min_confidence", params.min_confidence);
  if (params?.severe_threshold != null) url.searchParams.set("severe_threshold", String(params.severe_threshold));
  if (params?.offset_windows != null) url.searchParams.set("offset_windows", String(params.offset_windows));

  return fetchJson<AdminOddsAuditByLeagueResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function getAdminOddsAuditEvents(params?: {
  league_id?: number | null;
  season?: number | null;
  window_days?: number;
  cutoff_hours?: number;
  artifact_filename?: string | null;
  min_confidence?: "NONE" | "ILIKE" | "EXACT";
  severe_threshold?: number;
  only_severe?: boolean;
  limit?: number;
  offset_windows?: number;
}): Promise<AdminOddsAuditEventsResponse> {
  const url = new URL("/admin/odds/audit/reliability/events", API_BASE_URL);

  if (params?.league_id != null) url.searchParams.set("league_id", String(params.league_id));
  if (params?.season != null) url.searchParams.set("season", String(params.season));
  if (params?.window_days != null) url.searchParams.set("window_days", String(params.window_days));
  if (params?.cutoff_hours != null) url.searchParams.set("cutoff_hours", String(params.cutoff_hours));
  if (params?.artifact_filename) url.searchParams.set("artifact_filename", params.artifact_filename);
  if (params?.min_confidence) url.searchParams.set("min_confidence", params.min_confidence);
  if (params?.severe_threshold != null) url.searchParams.set("severe_threshold", String(params.severe_threshold));
  if (params?.only_severe != null) url.searchParams.set("only_severe", String(params.only_severe));
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  if (params?.offset_windows != null) url.searchParams.set("offset_windows", String(params.offset_windows));

  return fetchJson<AdminOddsAuditEventsResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function postAdminOddsAuditSyncResults(params?: {
  league_id?: number | null;
  season?: number | null;
  max_rows?: number;
  finished_before_hours?: number;
  lookback_days?: number;
}): Promise<AdminOddsAuditSyncResultsResponse> {
  const url = new URL("/admin/odds/audit/sync-results", API_BASE_URL);

  if (params?.league_id != null) url.searchParams.set("league_id", String(params.league_id));
  if (params?.season != null) url.searchParams.set("season", String(params.season));
  if (params?.max_rows != null) url.searchParams.set("max_rows", String(params.max_rows));
  if (params?.finished_before_hours != null) {
    url.searchParams.set("finished_before_hours", String(params.finished_before_hours));
  }
  if (params?.lookback_days != null) {
    url.searchParams.set("lookback_days", String(params.lookback_days));
  }

  return fetchJson<AdminOddsAuditSyncResultsResponse>(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  });
}

export async function getAdminOddsTotals(params: {
  sport_key?: string | null;
  hours_ahead?: number;
  limit?: number;
}): Promise<AdminOddsTotalsResponse> {
  const qs = new URLSearchParams();

  if (params.sport_key) qs.set("sport_key", params.sport_key);
  if (params.hours_ahead != null) qs.set("hours_ahead", String(params.hours_ahead));
  if (params.limit != null) qs.set("limit", String(params.limit));

  const url = new URL("/admin/odds/markets/totals", API_BASE_URL);
  url.search = qs.toString();

  return fetchJson<AdminOddsTotalsResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function getAdminOddsBtts(params: {
  sport_key?: string | null;
  hours_ahead?: number;
  limit?: number;
}): Promise<AdminOddsBttsResponse> {
  const qs = new URLSearchParams();

  if (params.sport_key) qs.set("sport_key", params.sport_key);
  if (params.hours_ahead != null) qs.set("hours_ahead", String(params.hours_ahead));
  if (params.limit != null) qs.set("limit", String(params.limit));

  const url = new URL("/admin/odds/markets/btts", API_BASE_URL);
  url.search = qs.toString();

  return fetchJson<AdminOddsBttsResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function adminOddsRefreshAndResolve(params: {
  sport_key: string;
  regions: string;
  hours_ahead: number;
  assume_league_id: number | null;
  assume_season: number | null;
  tol_hours: number | null;
  limit: number;
}): Promise<AdminOddsRefreshAndResolveResponse> {
  const qs = new URLSearchParams();
  qs.set("sport_key", params.sport_key);
  qs.set("regions", params.regions);
  qs.set("hours_ahead", String(params.hours_ahead));
  qs.set("limit", String(params.limit));

  if (params.assume_league_id != null) {
    qs.set("assume_league_id", String(params.assume_league_id));
  }

  if (params.assume_season != null) {
    qs.set("assume_season", String(params.assume_season));
  }

  if (params.tol_hours != null) {
    qs.set("tol_hours", String(params.tol_hours));
  }

  const url = new URL("/admin/odds/refresh_and_resolve", API_BASE_URL);
  url.search = qs.toString();

  return fetchJson<AdminOddsRefreshAndResolveResponse>(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  });
}

export async function adminOpsPipelineRunAll(params?: {
  only_sport_key?: string | null;
}): Promise<AdminOpsJobResponse> {
  const url = new URL("/admin/ops/pipeline/run_all", API_BASE_URL);

  if (params?.only_sport_key) {
    url.searchParams.set("only_sport_key", params.only_sport_key);
  }

  return fetchJson<AdminOpsJobResponse>(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  });
}

export async function adminOpsPipelineRun(params?: {
  only_sport_key?: string | null;
}): Promise<AdminOpsJobResponse> {
  const url = new URL("/admin/ops/pipeline/run", API_BASE_URL);

  if (params?.only_sport_key) {
    url.searchParams.set("only_sport_key", params.only_sport_key);
  }

  return fetchJson<AdminOpsJobResponse>(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  });
}

export async function adminOpsPipelineHealth(params?: {
  lookback_days?: number;
}): Promise<AdminOpsPipelineHealthResponse> {
  const url = new URL("/admin/ops/pipeline/health", API_BASE_URL);

  if (params?.lookback_days != null) {
    url.searchParams.set("lookback_days", String(params.lookback_days));
  }

  return fetchJson<AdminOpsPipelineHealthResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function adminOpsRunsRecent(params?: {
  limit?: number;
  job_key?: string | null;
  status?: string | null;
}): Promise<AdminOpsRunsRecentResponse> {
  const url = new URL("/admin/ops/runs/recent", API_BASE_URL);

  if (params?.limit != null) {
    url.searchParams.set("limit", String(params.limit));
  }
  if (params?.job_key) {
    url.searchParams.set("job_key", params.job_key);
  }
  if (params?.status) {
    url.searchParams.set("status", params.status);
  }

  return fetchJson<AdminOpsRunsRecentResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function adminOpsRunEvents(params: {
  run_id: number;
  limit?: number;
}): Promise<AdminOpsRunEventsResponse> {
  const url = new URL(`/admin/ops/runs/${params.run_id}/events`, API_BASE_URL);

  if (params.limit != null) {
    url.searchParams.set("limit", String(params.limit));
  }

  return fetchJson<AdminOpsRunEventsResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function adminTeamResolutionPending(params?: {
  sport_key?: string | null;
  limit?: number;
}): Promise<TeamResolutionPendingResponse> {
  const url = new URL("/admin/odds/team_resolution/pending", API_BASE_URL);

  if (params?.sport_key) {
    url.searchParams.set("sport_key", params.sport_key);
  }
  if (params?.limit != null) {
    url.searchParams.set("limit", String(params.limit));
  }

  return fetchJson<TeamResolutionPendingResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function adminTeamResolutionSearchTeams(
  q: string,
  limit = 20
): Promise<TeamSearchResponse> {
  const url = new URL("/admin/odds/team_resolution/search_teams", API_BASE_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));

  return fetchJson<TeamSearchResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function adminTeamResolutionApprove(
  body: TeamResolutionApproveRequest
): Promise<TeamResolutionApproveResponse> {
  const url = new URL("/admin/odds/team_resolution/approve", API_BASE_URL);

  return fetchJson<TeamResolutionApproveResponse>(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function adminTeamResolutionDismiss(body: {
  sport_key: string;
  raw_name: string;
}): Promise<{ ok: boolean; removed_from_queue: number }> {
  const url = new URL("/admin/odds/team_resolution/dismiss", API_BASE_URL);

  return fetchJson<{ ok: boolean; removed_from_queue: number }>(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function listTeamsByLeagueSeason(leagueId: number, season: number, limit = 200): Promise<TeamLite[]> {
  const url = new URL("/admin/teams/by-league-season", API_BASE_URL);
  url.searchParams.set("league_id", String(leagueId));
  url.searchParams.set("season", String(season));
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET /admin/teams/by-league-season failed: ${res.status} ${txt}`);
  }

  const data = (await res.json()) as { teams: TeamLite[] };
  return data.teams;
}

export async function productListOddsEvents(params: {
  sport_key: string;
  hours_ahead?: number;
  limit?: number;
  assume_league_id?: number;
  assume_season?: number;
  artifact_filename?: string;
}): Promise<ProductOddsEventsResponse> {
  const qs = new URLSearchParams();
  qs.set("sport_key", params.sport_key);
  if (params.hours_ahead != null) qs.set("hours_ahead", String(params.hours_ahead));
  if (params.limit != null) qs.set("limit", String(params.limit));

  if (params.assume_league_id != null) qs.set("assume_league_id", String(params.assume_league_id));
  if (params.assume_season != null) qs.set("assume_season", String(params.assume_season));
  if (params.artifact_filename) qs.set("artifact_filename", params.artifact_filename);

  const url = new URL("/product/index", API_BASE_URL);
  url.search = qs.toString();
  return fetchJson<ProductOddsEventsResponse>(url.toString(), { headers: { Accept: "application/json" } });
}

export async function productListLeagues(): Promise<ProductLeaguesResponse> {
  const url = new URL("/product/leagues", API_BASE_URL);
  return fetchJson<ProductLeaguesResponse>(url.toString(), { headers: { Accept: "application/json" } });
}

export async function productQuoteOdds(req: ProductOddsQuoteRequest): Promise<ProductOddsQuoteResponse> {
  const url = new URL("/odds/quote", API_BASE_URL);
  return fetchJson<ProductOddsQuoteResponse>(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

export async function adminOpsListLeagues(): Promise<{
  ok: boolean;
  items: Array<{
    sport_key: string;
    official_name: string | null;
    official_country_code: string | null;
    sport_title: string | null;
    sport_group: string | null;
    league_id: number | null;
    season_policy: "current" | "fixed" | null;
    fixed_season: number | null;
    regions: string | null;
    hours_ahead: number | null;
    tol_hours: number | null;
    enabled: boolean;
    mapping_status: string | null;
    computed_status: "approved" | "incomplete" | "pending" | "disabled";
    confidence: number | null;
    notes: string | null;
    updated_at_utc: string | null;
  }>;
  count: number;
}> {
  const url = new URL("/admin/ops/leagues", API_BASE_URL);

  return fetchJson(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function adminOpsToggleLeague(params: {
  sport_key: string;
  enabled: boolean;
}): Promise<{ ok: boolean; sport_key: string; enabled: boolean }> {
  const url = new URL("/admin/ops/leagues/toggle", API_BASE_URL);
  url.searchParams.set("sport_key", params.sport_key);
  url.searchParams.set("enabled", String(params.enabled));

  return fetchJson(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  });
}

export async function adminOpsAutoResolveLeagues(params?: {
  only_unresolved?: boolean;
}): Promise<{
  ok: boolean;
  count: number;
  resolved_count: number;
  already_resolved_count: number;
  failed_count: number;
  items: Array<{
    ok: boolean;
    sport_key: string;
    league_id?: number;
    reason: string;
    confidence?: number;
    notes?: string;
  }>;
}> {
  const url = new URL("/admin/ops/leagues/auto_resolve", API_BASE_URL);
  url.searchParams.set(
    "only_unresolved",
    String(params?.only_unresolved ?? true)
  );

  return fetchJson(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  });
}

export async function adminOpsDiscoverLeagueCandidates(params?: {
  default_enabled?: boolean;
  auto_resolve?: boolean;
}): Promise<{
  ok: boolean;
  steps: {
    catalog_sync: {
      ok: boolean;
      counters?: {
        sports_seen?: number;
        catalog_upserted?: number;
        skipped?: number;
      };
      error?: string | null;
    };
    gap_scan: {
      ok: boolean;
      counters?: {
        inserted?: number;
        inserted_pending?: number;
        inserted_ignored?: number;
      };
      error?: string | null;
    };
    autoclassify: {
      ok: boolean;
      counters?: {
        ignored?: number;
      };
      error?: string | null;
    };
    auto_resolve: {
      ok: boolean;
      skipped?: boolean;
      count: number;
      resolved_count: number;
      already_resolved_count: number;
      failed_count: number;
    };
  };
  summary: {
    catalog_upserted: number;
    sports_seen: number;
    inserted: number;
    inserted_pending: number;
    inserted_ignored: number;
    ignored: number;
    resolved_count: number;
    already_resolved_count: number;
    failed_count: number;
  };
}> {
  const url = new URL("/admin/ops/odds/league_map/discover_candidates", API_BASE_URL);
  url.searchParams.set("default_enabled", String(params?.default_enabled ?? false));
  url.searchParams.set("auto_resolve", String(params?.auto_resolve ?? true));

  return fetchJson(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  });
}

export async function adminOpsLeagueSuggestions(params: {
  sport_key: string;
  limit?: number;
}): Promise<{
  ok: boolean;
  sport_key: string;
  sport_title?: string | null;
  sport_group?: string | null;
  current_league_id: number;
  current_mapping_status?: string | null;
  competition_candidates: string[];
  country_hint?: string | null;
  reason: string;
  can_auto_resolve: boolean;
  suggested_candidate?: {
    league_id: number;
    name?: string | null;
    country_name?: string | null;
    country_code?: string | null;
    match_reason?: string | null;
    rank?: number | null;
  } | null;
  candidates: Array<{
    league_id: number;
    name: string;
    country_name?: string | null;
    country_code?: string | null;
    match_reason?: string | null;
    rank?: number | null;
  }>;
}> {
  const url = new URL("/admin/ops/odds/league_map/suggestions", API_BASE_URL);
  url.searchParams.set("sport_key", params.sport_key);
  url.searchParams.set("limit", String(params.limit ?? 5));

  return fetchJson(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function adminOpsApproveLeagueMap(params: {
  sport_key: string;
  league_id: number;
  official_name: string;
  official_country_code?: string | null;
  regions?: string;
  hours_ahead?: number;
  tol_hours?: number;
  season_policy?: "current" | "fixed";
  fixed_season?: number | null;
  enabled?: boolean;
}): Promise<{
  ok: boolean;
  sport_key: string;
  league_id: number;
  official_name: string;
  official_country_code: string | null;
  mapping_status: string;
  enabled: boolean;
}> {
  const url = new URL("/admin/ops/odds/league_map/approve", API_BASE_URL);
  url.searchParams.set("sport_key", params.sport_key);
  url.searchParams.set("league_id", String(params.league_id));
  url.searchParams.set("official_name", params.official_name);

  if (params.official_country_code != null) {
    url.searchParams.set("official_country_code", params.official_country_code);
  }

  url.searchParams.set("regions", params.regions ?? "eu");
  url.searchParams.set("hours_ahead", String(params.hours_ahead ?? 720));
  url.searchParams.set("tol_hours", String(params.tol_hours ?? 6));
  url.searchParams.set("season_policy", params.season_policy ?? "current");

  if (params.fixed_season != null) {
    url.searchParams.set("fixed_season", String(params.fixed_season));
  }

  url.searchParams.set("enabled", String(params.enabled ?? true));

  return fetchJson(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  });
}

export async function adminListUsers(params?: {
  q?: string;
  user_status?: string | null;
  plan_code?: string | null;
  role_key?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminUsersListResponse> {
  const url = new URL("/admin/users", API_BASE_URL);

  if (params?.q) url.searchParams.set("q", params.q);
  if (params?.user_status) url.searchParams.set("user_status", params.user_status);
  if (params?.plan_code) url.searchParams.set("plan_code", params.plan_code);
  if (params?.role_key) url.searchParams.set("role_key", params.role_key);
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  if (params?.offset != null) url.searchParams.set("offset", String(params.offset));

  return fetchJson<AdminUsersListResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function adminCreateUser(body: {
  email: string;
  password: string;
  full_name?: string | null;
  reason: string;
}): Promise<AdminCreateUserResponse> {
  const url = new URL("/admin/users", API_BASE_URL);

  return fetchJson<AdminCreateUserResponse>(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function adminGetUserDetail(userId: number): Promise<AdminUserDetailResponse> {
  const url = new URL(`/admin/users/${userId}`, API_BASE_URL);

  return fetchJson<AdminUserDetailResponse>(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function adminSetUserStatus(
  userId: number,
  body: { status: string; reason?: string | null }
): Promise<{ ok: boolean; user_id: number; status: string }> {
  const url = new URL(`/admin/users/${userId}/status`, API_BASE_URL);

  return fetchJson(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function adminSetUserPlan(
  userId: number,
  body: { plan_code: string; reason?: string | null }
): Promise<{ ok: boolean; user_id: number; plan_code: string }> {
  const url = new URL(`/admin/users/${userId}/plan`, API_BASE_URL);

  return fetchJson(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function adminUpsertUserRole(
  userId: number,
  body: { role_key: string; is_active: boolean; reason: string; notes?: string | null }
): Promise<{ ok: boolean; user_id: number; role_key: string; is_active: boolean }> {
  const url = new URL(`/admin/users/${userId}/roles/upsert`, API_BASE_URL);

  return fetchJson(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function adminGrantUserCredits(
  userId: number,
  body: { credits: number; reason?: string | null }
): Promise<{ ok: boolean; user_id: number; date_key: string; granted_credits: number; bonus_balance: number }> {
  const url = new URL(`/admin/users/${userId}/credits/grant`, API_BASE_URL);

  return fetchJson(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}