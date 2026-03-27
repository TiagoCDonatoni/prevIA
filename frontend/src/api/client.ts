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
  const res = await fetch(url, init);
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

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
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

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
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

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
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
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
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

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
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
    sport_title: string | null;
    sport_group: string | null;
    league_id: number;
    season_policy: "current" | "fixed";
    fixed_season: number | null;
    regions: string | null;
    hours_ahead: number | null;
    tol_hours: number | null;
    enabled: boolean;
    computed_status: "approved" | "incomplete" | "pending" | "disabled";
    mapping_status: string | null;
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