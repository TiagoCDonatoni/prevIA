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

export type ManualAnalysisImageImportStatus =
  | "READY"
  | "NEEDS_CONFIRMATION"
  | "UNSUPPORTED_MARKET"
  | "LOW_CONFIDENCE"
  | "UNREADABLE"
  | string;

export type ManualAnalysisImageImportPreviewItem = {
  row_id: number;
  row_index: number;
  status: ManualAnalysisImageImportStatus;
  raw?: {
    home?: string | null;
    away?: string | null;
    league?: string | null;
    kickoff?: string | null;
    kickoff_iso_local?: string | null;
    market?: string | null;
    selection?: string | null;
    line?: string | null;
    odd?: string | null;
    bookmaker?: string | null;
    confidence?: number | null;
    notes?: string | null;
    selections?: Array<{
      market?: string | null;
      selection?: string | null;
      line?: string | null;
      odd?: string | null;
      confidence?: number | null;
      notes?: string | null;
    }>;
  };
  normalized?: {
    market_key?: string | null;
    selection_key?: string | null;
    line?: number | null;
    totals_line?: number | null;
    odds_value?: number | null;
    line_was_defaulted?: boolean;
    odds_1x2?: Record<string, number | null>;
    odds_totals?: Record<string, number | null>;
    odds_btts?: Record<string, number | null>;
    supported_selection_count?: number;
    unsupported_selection_count?: number;
  };
  resolved?: {
    fixture_id?: number | null;
    home_team_id?: number | null;
    away_team_id?: number | null;
    home_name?: string | null;
    away_name?: string | null;
    kickoff_utc?: string | null;
    confidence?: number | null;
  };
  candidates?: Array<Record<string, unknown>>;
  message?: string | null;
};

export type ManualAnalysisImageImportPreviewResponse = {
  ok: boolean;
  request_id: number;
  image_type: string;
  status: string;
  summary: {
    items_detected: number;
    auto_resolved: number;
    needs_confirmation: number;
    rejected: number;
  };
  usage?: {
    upload_attempts_today: number;
    accepted_uploads_today: number;
    rejected_uploads_today: number;
    generated_analyses_today: number;
    uploads_remaining_today: number;
    blocked_until_utc?: string | null;
    risk_score: number;
  };
  items: ManualAnalysisImageImportPreviewItem[];
  code?: string;
  message?: string;
};

export type ManualAnalysisImageBatchEvaluateResponse = {
  ok: boolean;
  credits_required: number;
  credits_consumed: number;
  remaining_credits?: number | null;
  code?: string | null;
  message?: string | null;
  usage?: ManualAnalysisResponse["usage"] | null;
  analyses: Array<{
    row_id: number;
    analysis_id?: number | null;
    status: "generated" | "already_generated" | string;
    consumed_credit?: boolean;
    analysis?: ManualAnalysisResponse;
  }>;
  skipped: Array<Record<string, unknown>>;
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

export async function postManualAnalysisImagePreview(
  image: File,
  opts?: {
    lang?: string;
    timezone_name?: string;
  }
): Promise<ManualAnalysisImageImportPreviewResponse> {
  const form = new FormData();
  form.append("image", image);
  form.append("lang", opts?.lang || "pt-BR");
  form.append("timezone_name", opts?.timezone_name || "America/Sao_Paulo");

  const res = await fetch(`${API_BASE_URL}/product/manual-analysis/image-import/preview`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...buildProductRuntimeHeaders(),
    },
    body: form,
  });

  const data = (await res.json().catch(() => ({}))) as ManualAnalysisImageImportPreviewResponse;

  if (!res.ok && !data.ok) return data;
  if (!res.ok) throw new Error(`manual_analysis_image_preview_failed:${res.status}`);

  return data;
}

export async function postManualAnalysisImageEvaluateBatch(
  requestId: number,
  rowIds: number[]
): Promise<ManualAnalysisImageBatchEvaluateResponse> {
  const res = await fetch(`${API_BASE_URL}/product/manual-analysis/image-import/evaluate-batch`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...buildProductRuntimeHeaders(),
    },
    body: JSON.stringify({
      request_id: requestId,
      row_ids: rowIds,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as ManualAnalysisImageBatchEvaluateResponse;

  if (!res.ok && !data.ok) return data;
  if (!res.ok) throw new Error(`manual_analysis_image_batch_failed:${res.status}`);

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