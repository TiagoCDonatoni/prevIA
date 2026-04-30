import { API_BASE_URL } from "../../config";
import { buildProductRuntimeHeaders } from "./auth";

export type ManualAnalysisSelectionsMap = Record<string, number | null>;

export type ManualAnalysisMarketKey = "1X2" | "TOTALS" | "BTTS";
export type ManualAnalysisStoredMarketKey = ManualAnalysisMarketKey | "FULL";

export type ManualAnalysisSelectionModel = {
  model_prob: number | null;
  fair_odd: number | null;
  interesting_above: number | null;
};

export type ManualAnalysisComparison = {
  odd: number | null;
  implied_prob: number | null;
  model_prob: number | null;
  fair_odd: number | null;
  interesting_above: number | null;
  edge: number | null;
  classification: "GOOD" | "ALIGNED" | "BAD";
};

export type ManualAnalysisMarketSnapshot = {
  market: {
    market_key: ManualAnalysisMarketKey;
    line: number | null;
  };
  model: {
    selections: Record<string, ManualAnalysisSelectionModel>;
    confidence?: {
      overall?: number | null;
      level?: string | null;
      source?: string | null;
    };
    inputs?: ManualAnalysisResponse["model"] extends infer M
      ? M extends { inputs?: infer I }
        ? I
        : Record<string, unknown>
      : Record<string, unknown>;
  };
  manual_input?: {
    bookmaker_name?: string | null;
    selections: ManualAnalysisSelectionsMap;
  };
  evaluation?: {
    provided_count: number;
    comparisons: Record<string, ManualAnalysisComparison | null>;
  };
};

export type ManualAnalysisResponse = {
  ok: boolean;
  analysis_id?: number;
  created_at_utc?: string | null;
  saved_at_utc?: string | null;
  consumed_credit?: boolean;
  date_key?: string | null;
  code?: string;
  message?: string;
  usage?: {
    credits_used: number;
    revealed_count: number;
    daily_limit: number;
    remaining: number;
    revealed_fixture_keys?: string[];
  };
  event?: {
    event_id: string;
    sport_key: string;
    fixture_id: number | null;
    commence_time_utc: string | null;
    competition_name?: string | null;
    league_id?: number | null;
    season?: number | null;
    home_name: string;
    away_name: string;
  };
  market?: {
    market_key: ManualAnalysisStoredMarketKey;
    line: number | null;
  };
  markets?: {
    one_x_two?: ManualAnalysisMarketSnapshot;
    totals?: ManualAnalysisMarketSnapshot;
    btts?: ManualAnalysisMarketSnapshot;
  };
  model?: {
    selections: Record<string, ManualAnalysisSelectionModel>;
    confidence?: {
      overall?: number | null;
      level?: string | null;
      source?: string | null;
    };
    inputs?: {
      league_id?: number | null;
      season?: number | null;
      home_team_id?: number | null;
      away_team_id?: number | null;
      lambda_home?: number | null;
      lambda_away?: number | null;
      lambda_total?: number | null;
      lambda_source?: string | null;
      context_source?: string | null;
      model_source_1x2?: string | null;
      artifact_filename?: string | null;
    };
  };
  manual_input?: {
    bookmaker_name?: string | null;
    selections: ManualAnalysisSelectionsMap;
  };
  evaluation?: {
    provided_count: number;
    comparisons: Record<string, ManualAnalysisComparison | null> | Record<string, Record<string, ManualAnalysisComparison | null>>;
  };
};

export type ManualAnalysisHistoryResponse = {
  ok: boolean;
  items: ManualAnalysisResponse[];
  count: number;
  limit?: number;
  offset?: number;
  next_offset?: number | null;
  has_more?: boolean;
  max_saved?: number;
};

export type ManualAnalysisEvaluateRequest = {
  sport_key?: string;
  league_id?: number | null;
  season?: number | null;
  artifact_filename?: string | null;
  home_team_id: number;
  away_team_id: number;
  market_key?: ManualAnalysisStoredMarketKey;
  totals_line?: number | null;
  bookmaker_name?: string | null;
  odds_1x2?: ManualAnalysisSelectionsMap;
  odds_totals?: ManualAnalysisSelectionsMap;
  odds_btts?: ManualAnalysisSelectionsMap;
};

export async function postManualAnalysisEvaluate(
  payload: ManualAnalysisEvaluateRequest
): Promise<ManualAnalysisResponse> {
  const res = await fetch(`${API_BASE_URL}/product/manual-analysis/evaluate`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...buildProductRuntimeHeaders(),
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as ManualAnalysisResponse;
  if (!res.ok && !data.ok) return data;
  if (!res.ok) throw new Error(`manual_analysis_evaluate_failed:${res.status}`);
  return data;
}

export async function fetchManualAnalysisHistory(
  limit = 5,
  offset = 0
): Promise<ManualAnalysisHistoryResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const res = await fetch(
    `${API_BASE_URL}/product/manual-analysis/history?${params.toString()}`,
    {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...buildProductRuntimeHeaders(),
      },
    }
  );

  if (!res.ok) {
    throw new Error(`manual_analysis_history_failed:${res.status}`);
  }

  return (await res.json()) as ManualAnalysisHistoryResponse;
}