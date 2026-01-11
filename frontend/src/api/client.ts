/**
 * Mock API client.
 * Replace these with real fetch calls when the backend is ready.
 */
import type {
  ArtifactRow,
  FixtureLite,
  KpiSnapshot,
  MatchupByFixtureRequest,
  MatchupResponse,
  MatchupWhatIfRequest,
  RunRow,
  TeamLite,
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
    artifact_id: "epl_1x2_logreg_tempcal_v1_C0.3_cal2023",
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

export async function searchTeams(q: string): Promise<TeamLite[]> {
  await sleep(80);
  const qq = q.trim().toLowerCase();
  if (!qq) return MOCK_TEAMS.slice(0, 6);
  return MOCK_TEAMS.filter((t) => t.name.toLowerCase().includes(qq)).slice(0, 20);
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
  await sleep(200);
  return {
    meta: {
      fixture_id: req.fixture_id,
      competition_name: "Premier League",
      season: 2026,
      kickoff_utc: "2026-01-12T04:36:17Z",
      artifact_id: req.artifact_id ?? MOCK_ARTIFACTS[0].artifact_id,
      is_whatif: false,
    },
    probs_1x2: { H: 0.55, D: 0.25, A: 0.20 },
    fair_odds_1x2: { H: 1/0.55, D: 1/0.25, A: 1/0.20 },
    drivers: [
      { key: "form_home", label: "Home recent form", value: "+0.31" },
      { key: "elo_gap", label: "Strength gap", value: "+42" },
      { key: "xg_diff", label: "xG diff (rolling)", value: "+0.28" },
      { key: "injuries", label: "Injuries impact", value: "-0.06" },
    ],
  };
}

export async function matchupWhatIf(req: MatchupWhatIfRequest): Promise<MatchupResponse> {
  await sleep(200);
  return {
    meta: {
      artifact_id: req.artifact_id ?? MOCK_ARTIFACTS[0].artifact_id,
      is_whatif: true,
    },
    probs_1x2: { H: 0.47, D: 0.27, A: 0.26 },
    fair_odds_1x2: { H: 1/0.47, D: 1/0.27, A: 1/0.26 },
    drivers: [
      { key: "neutral_adjust", label: "Venue mode", value: req.venue_mode ?? "HOME" },
      { key: "ref_date", label: "Reference date", value: req.reference_date_utc ?? "auto" },
      { key: "competition", label: "Competition", value: req.competition_id ? String(req.competition_id) : "auto" },
    ],
  };
}
