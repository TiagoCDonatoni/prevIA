import { useEffect, useMemo, useState } from "react";
import {
  getAdminOddsAuditSummary,
  getAdminOddsAuditByLeague,
  getAdminOddsAuditEvents,
  postAdminOddsAuditSyncResults,
} from "../api/client";
import type {
  AdminOddsAuditSummaryResponse,
  AdminOddsAuditByLeagueResponse,
  AdminOddsAuditEventsResponse,
  AdminOddsAuditByLeagueRow,
} from "../api/contracts";
import { Card } from "../ui/Card";
import { Kpi } from "../ui/Kpi";
import { Pill } from "../ui/Pill";
import { fmtIsoToShort, fmtPct, fmtNum } from "../ui/components";

type ToneKey = "green" | "yellow" | "red" | "neutral";

type ToneInfo = {
  tone: ToneKey;
  label: string;
};

const TONE_STYLE: Record<ToneKey, { background: string; border: string; color: string }> = {
  green: { background: "#ecfdf3", border: "#a6f4c5", color: "#067647" },
  yellow: { background: "#fffaeb", border: "#fedf89", color: "#b54708" },
  red: { background: "#fef3f2", border: "#fecdca", color: "#b42318" },
  neutral: { background: "#f8fafc", border: "#d0d5dd", color: "#475467" },
};

function parseOptionalInt(value: string): number | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalText(value: string): string | null {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

function metricNum(value: number | null | undefined, decimals = 3) {
  if (value == null || Number.isNaN(value)) return "—";
  return fmtNum(value, decimals);
}

function metricPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return fmtPct(value);
}

function calcDelta(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null) return null;
  if (Number.isNaN(current) || Number.isNaN(previous)) return null;
  return current - previous;
}

function formatSignedNumber(value: number | null | undefined, decimals = 4) {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "±";
  return `${sign}${fmtNum(abs, decimals)}`;
}

function formatSignedPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "±";
  return `${sign}${fmtPct(abs)}`;
}

function formatSignedCount(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "±";
  return `${sign}${Math.abs(Math.round(value))}`;
}

function deltaColor(value: number | null | undefined, betterWhen: "lower" | "higher") {
  if (value == null || Number.isNaN(value) || value === 0) return "#475467";
  const favorable = betterWhen === "lower" ? value < 0 : value > 0;
  return favorable ? "#067647" : "#b42318";
}

function marketTone(llDelta: number | null | undefined, comparableRows: number | null | undefined): ToneInfo {
  if (llDelta == null || comparableRows == null || comparableRows <= 0) {
    return { tone: "neutral", label: "Sem base" };
  }
  if (comparableRows < 30) return { tone: "yellow", label: "Amostra curta" };
  if (llDelta <= -0.015) return { tone: "green", label: "Melhor que mercado" };
  if (llDelta <= 0.015) return { tone: "yellow", label: "Próximo do mercado" };
  return { tone: "red", label: "Abaixo do mercado" };
}

function severeTone(rate: number | null | undefined, sample: number | null | undefined): ToneInfo {
  if (rate == null || sample == null || sample <= 0) return { tone: "neutral", label: "Sem base" };
  if (sample < 30) return { tone: "yellow", label: "Amostra curta" };
  if (rate <= 0.12) return { tone: "green", label: "Controlado" };
  if (rate <= 0.22) return { tone: "yellow", label: "Atenção" };
  return { tone: "red", label: "Crítico" };
}

function sampleTone(sample: number | null | undefined): ToneInfo {
  if (sample == null || sample <= 0) return { tone: "neutral", label: "Sem amostra" };
  if (sample >= 150) return { tone: "green", label: "Robusta" };
  if (sample >= 50) return { tone: "yellow", label: "Média" };
  return { tone: "red", label: "Pequena" };
}

function overallTone(input: { market: ToneInfo; severe: ToneInfo; sample: ToneInfo }): ToneInfo {
  const scoreMap: Record<ToneKey, number> = { green: 1, yellow: 0, neutral: 0, red: -1 };
  const score = scoreMap[input.market.tone] + scoreMap[input.severe.tone] + scoreMap[input.sample.tone];
  if (score >= 2) return { tone: "green", label: "Leitura favorável" };
  if (score <= -1) return { tone: "red", label: "Leitura fraca" };
  return { tone: "yellow", label: "Leitura mista" };
}

function TonePill({ tone, label }: ToneInfo) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: TONE_STYLE[tone].background,
        border: `1px solid ${TONE_STYLE[tone].border}`,
        color: TONE_STYLE[tone].color,
      }}
    >
      {label}
    </span>
  );
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;

  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  const escapeCell = (value: unknown) => {
    if (value == null) return "";
    const str = String(value);
    if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column])).join(",")),
  ].join("\n");

  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}

function buildSummaryExportRows(
  current: AdminOddsAuditSummaryResponse | null,
  previous: AdminOddsAuditSummaryResponse | null
) {
  if (!current) return [];

  const currentRow: Record<string, unknown> = {
    segment: "current",
    window_days: current.meta.window_days,
    period_start_utc: current.meta.start_utc,
    period_end_utc: current.meta.end_utc,
    league_id: current.meta.league_id,
    season: current.meta.season,
    artifact_filename: current.meta.artifact_filename,
    min_confidence: current.meta.min_confidence,
    picked_rows: current.counts.picked_rows,
    with_model_probs: current.counts.with_model_probs,
    with_market_probs: current.counts.with_market_probs,
    with_both: current.counts.with_both,
    model_brier: current.model.brier,
    model_logloss: current.model.logloss,
    model_top1_acc: current.model.top1_acc,
    market_brier: current.market_novig.brier,
    market_logloss: current.market_novig.logloss,
    market_top1_acc: current.market_novig.top1_acc,
    ll_delta_vs_market: current.comparison.model_minus_market.logloss,
    top1_delta_vs_market: current.comparison.model_minus_market.top1_acc,
    severe_threshold: current.diagnostics.severe_threshold,
    severe_miss_count: current.diagnostics.severe_miss_count,
    severe_miss_rate: current.diagnostics.severe_miss_rate,
  };

  const rows = [currentRow];

  if (previous) {
    rows.push({
      segment: "previous",
      window_days: previous.meta.window_days,
      period_start_utc: previous.meta.start_utc,
      period_end_utc: previous.meta.end_utc,
      league_id: previous.meta.league_id,
      season: previous.meta.season,
      artifact_filename: previous.meta.artifact_filename,
      min_confidence: previous.meta.min_confidence,
      picked_rows: previous.counts.picked_rows,
      with_model_probs: previous.counts.with_model_probs,
      with_market_probs: previous.counts.with_market_probs,
      with_both: previous.counts.with_both,
      model_brier: previous.model.brier,
      model_logloss: previous.model.logloss,
      model_top1_acc: previous.model.top1_acc,
      market_brier: previous.market_novig.brier,
      market_logloss: previous.market_novig.logloss,
      market_top1_acc: previous.market_novig.top1_acc,
      ll_delta_vs_market: previous.comparison.model_minus_market.logloss,
      top1_delta_vs_market: previous.comparison.model_minus_market.top1_acc,
      severe_threshold: previous.diagnostics.severe_threshold,
      severe_miss_count: previous.diagnostics.severe_miss_count,
      severe_miss_rate: previous.diagnostics.severe_miss_rate,
    });

    rows.push({
      segment: "delta_vs_previous",
      window_days: current.meta.window_days,
      period_start_utc: current.meta.start_utc,
      period_end_utc: current.meta.end_utc,
      league_id: current.meta.league_id,
      season: current.meta.season,
      artifact_filename: current.meta.artifact_filename,
      min_confidence: current.meta.min_confidence,
      picked_rows: current.counts.picked_rows - previous.counts.picked_rows,
      with_model_probs: current.counts.with_model_probs - previous.counts.with_model_probs,
      with_market_probs: current.counts.with_market_probs - previous.counts.with_market_probs,
      with_both: current.counts.with_both - previous.counts.with_both,
      model_brier: calcDelta(current.model.brier, previous.model.brier),
      model_logloss: calcDelta(current.model.logloss, previous.model.logloss),
      model_top1_acc: calcDelta(current.model.top1_acc, previous.model.top1_acc),
      market_brier: calcDelta(current.market_novig.brier, previous.market_novig.brier),
      market_logloss: calcDelta(current.market_novig.logloss, previous.market_novig.logloss),
      market_top1_acc: calcDelta(current.market_novig.top1_acc, previous.market_novig.top1_acc),
      ll_delta_vs_market: calcDelta(
        current.comparison.model_minus_market.logloss,
        previous.comparison.model_minus_market.logloss
      ),
      top1_delta_vs_market: calcDelta(
        current.comparison.model_minus_market.top1_acc,
        previous.comparison.model_minus_market.top1_acc
      ),
      severe_threshold: current.diagnostics.severe_threshold,
      severe_miss_count: current.diagnostics.severe_miss_count - previous.diagnostics.severe_miss_count,
      severe_miss_rate: calcDelta(current.diagnostics.severe_miss_rate, previous.diagnostics.severe_miss_rate),
    });
  }

  return rows;
}

function buildLeagueExportRows(
  current: AdminOddsAuditByLeagueResponse | null,
  previous: AdminOddsAuditByLeagueResponse | null
) {
  if (!current) return [];

  const previousMap = new Map<string, AdminOddsAuditByLeagueRow>();
  for (const row of previous?.rows ?? []) {
    previousMap.set(`${row.league_id ?? "na"}__${row.season ?? "na"}`, row);
  }

  return current.rows.map((row) => {
    const key = `${row.league_id ?? "na"}__${row.season ?? "na"}`;
    const prev = previousMap.get(key);

    return {
      league_id: row.league_id,
      season: row.season,
      picked_rows: row.counts.picked_rows,
      picked_rows_prev: prev?.counts.picked_rows ?? null,
      picked_rows_delta: prev ? row.counts.picked_rows - prev.counts.picked_rows : null,
      model_logloss: row.model.logloss,
      model_logloss_prev: prev?.model.logloss ?? null,
      model_logloss_delta: calcDelta(row.model.logloss, prev?.model.logloss),
      market_logloss: row.market_novig.logloss,
      ll_delta_vs_market: row.comparison.model_minus_market.logloss,
      top1_acc: row.model.top1_acc,
      top1_acc_prev: prev?.model.top1_acc ?? null,
      top1_acc_delta: calcDelta(row.model.top1_acc, prev?.model.top1_acc),
      severe_miss_rate: row.diagnostics.severe_miss_rate,
      severe_miss_rate_prev: prev?.diagnostics.severe_miss_rate ?? null,
      severe_miss_rate_delta: calcDelta(row.diagnostics.severe_miss_rate, prev?.diagnostics.severe_miss_rate),
      severe_miss_count: row.diagnostics.severe_miss_count,
    };
  });
}

function buildEventsExportRows(events: AdminOddsAuditEventsResponse | null) {
  return (events?.rows ?? []).map((row) => ({
    kickoff_utc: row.kickoff_utc,
    event_id: row.event_id,
    artifact_filename: row.artifact_filename,
    league_id: row.league_id,
    season: row.season,
    home_name: row.home_name,
    away_name: row.away_name,
    result_1x2: row.result_1x2,
    home_goals: row.home_goals,
    away_goals: row.away_goals,
    best_side: row.best_side,
    best_side_prob: row.best_side_prob,
    model_p_h: row.model_probs?.H ?? null,
    model_p_d: row.model_probs?.D ?? null,
    model_p_a: row.model_probs?.A ?? null,
    market_p_h: row.market_probs?.H ?? null,
    market_p_d: row.market_probs?.D ?? null,
    market_p_a: row.market_probs?.A ?? null,
    model_logloss: row.model_metrics?.logloss ?? null,
    market_logloss: row.market_metrics?.logloss ?? null,
    ll_delta_model_minus_market: calcDelta(
      row.model_metrics?.logloss ?? null,
      row.market_metrics?.logloss ?? null
    ),
    severe_miss: row.severe_miss,
    match_confidence: row.match_confidence,
  }));
}

export default function OddsAudit() {
  const [leagueIdText, setLeagueIdText] = useState("");
  const [seasonText, setSeasonText] = useState("");
  const [artifactText, setArtifactText] = useState("");
  const [windowDays, setWindowDays] = useState(15);
  const [cutoffHours, setCutoffHours] = useState(6);
  const [minConfidence, setMinConfidence] = useState<"NONE" | "ILIKE" | "EXACT">("NONE");
  const [severeThreshold, setSevereThreshold] = useState(0.7);
  const [onlySevere, setOnlySevere] = useState(false);
  const [eventLimit, setEventLimit] = useState(50);

  const [summary, setSummary] = useState<AdminOddsAuditSummaryResponse | null>(null);
  const [summaryPrev, setSummaryPrev] = useState<AdminOddsAuditSummaryResponse | null>(null);
  const [byLeague, setByLeague] = useState<AdminOddsAuditByLeagueResponse | null>(null);
  const [byLeaguePrev, setByLeaguePrev] = useState<AdminOddsAuditByLeagueResponse | null>(null);
  const [events, setEvents] = useState<AdminOddsAuditEventsResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      league_id: parseOptionalInt(leagueIdText),
      season: parseOptionalInt(seasonText),
      artifact_filename: parseOptionalText(artifactText),
      window_days: windowDays,
      cutoff_hours: cutoffHours,
      min_confidence: minConfidence,
      severe_threshold: severeThreshold,
      only_severe: onlySevere,
      limit: eventLimit,
    }),
    [
      leagueIdText,
      seasonText,
      artifactText,
      windowDays,
      cutoffHours,
      minConfidence,
      severeThreshold,
      onlySevere,
      eventLimit,
    ]
  );

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const [summaryRes, summaryPrevRes, byLeagueRes, byLeaguePrevRes, eventsRes] = await Promise.all([
        getAdminOddsAuditSummary({
          league_id: params.league_id,
          season: params.season,
          artifact_filename: params.artifact_filename,
          window_days: params.window_days,
          cutoff_hours: params.cutoff_hours,
          min_confidence: params.min_confidence,
          severe_threshold: params.severe_threshold,
          offset_windows: 0,
        }),
        getAdminOddsAuditSummary({
          league_id: params.league_id,
          season: params.season,
          artifact_filename: params.artifact_filename,
          window_days: params.window_days,
          cutoff_hours: params.cutoff_hours,
          min_confidence: params.min_confidence,
          severe_threshold: params.severe_threshold,
          offset_windows: 1,
        }),
        getAdminOddsAuditByLeague({
          season: params.season,
          artifact_filename: params.artifact_filename,
          window_days: params.window_days,
          cutoff_hours: params.cutoff_hours,
          min_confidence: params.min_confidence,
          severe_threshold: params.severe_threshold,
          offset_windows: 0,
        }),
        getAdminOddsAuditByLeague({
          season: params.season,
          artifact_filename: params.artifact_filename,
          window_days: params.window_days,
          cutoff_hours: params.cutoff_hours,
          min_confidence: params.min_confidence,
          severe_threshold: params.severe_threshold,
          offset_windows: 1,
        }),
        getAdminOddsAuditEvents({
          league_id: params.league_id,
          season: params.season,
          artifact_filename: params.artifact_filename,
          window_days: params.window_days,
          cutoff_hours: params.cutoff_hours,
          min_confidence: params.min_confidence,
          severe_threshold: params.severe_threshold,
          only_severe: params.only_severe,
          limit: params.limit,
          offset_windows: 0,
        }),
      ]);

      setSummary(summaryRes);
      setSummaryPrev(summaryPrevRes);
      setByLeague(byLeagueRes);
      setByLeaguePrev(byLeaguePrevRes);
      setEvents(eventsRes);
    } catch (e: any) {
      setSummary(null);
      setSummaryPrev(null);
      setByLeague(null);
      setByLeaguePrev(null);
      setEvents(null);
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function syncResults() {
    setSyncing(true);
    setSyncErr(null);
    setSyncMsg(null);

    try {
      const out = await postAdminOddsAuditSyncResults({
        league_id: params.league_id,
        season: params.season,
        max_rows: 5000,
        finished_before_hours: 1,
        lookback_days: params.window_days,
      });

      setSyncMsg(
        `Sync OK — scanned ${out.scanned}, inserted/updated ${out.inserted}, lookback ${params.window_days}d.`
      );
      await load();
    } catch (e: any) {
      setSyncErr(String(e?.message || e));
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    void load();
  }, [params]);

  const summaryDeltas = useMemo(
    () => ({
      logloss: calcDelta(summary?.model.logloss, summaryPrev?.model.logloss),
      top1: calcDelta(summary?.model.top1_acc, summaryPrev?.model.top1_acc),
      severe: calcDelta(summary?.diagnostics.severe_miss_rate, summaryPrev?.diagnostics.severe_miss_rate),
      picked: summary && summaryPrev ? summary.counts.picked_rows - summaryPrev.counts.picked_rows : null,
    }),
    [summary, summaryPrev]
  );

  const executiveTones = useMemo(() => {
    const market = marketTone(summary?.comparison.model_minus_market.logloss, summary?.counts.with_both);
    const severe = severeTone(summary?.diagnostics.severe_miss_rate, summary?.counts.with_model_probs);
    const sample = sampleTone(summary?.counts.picked_rows);
    const overall = overallTone({ market, severe, sample });
    return { market, severe, sample, overall };
  }, [summary]);

  const leagueRows = useMemo(() => {
    const prevMap = new Map<string, AdminOddsAuditByLeagueRow>();
    for (const row of byLeaguePrev?.rows ?? []) {
      prevMap.set(`${row.league_id ?? "na"}__${row.season ?? "na"}`, row);
    }

    return (byLeague?.rows ?? []).map((row) => {
      const key = `${row.league_id ?? "na"}__${row.season ?? "na"}`;
      const prev = prevMap.get(key);
      const tones = {
        market: marketTone(row.comparison.model_minus_market.logloss, row.counts.with_both),
        severe: severeTone(row.diagnostics.severe_miss_rate, row.counts.with_model_probs),
        sample: sampleTone(row.counts.picked_rows),
      };

      return {
        row,
        prev,
        deltas: {
          logloss: calcDelta(row.model.logloss, prev?.model.logloss),
          top1: calcDelta(row.model.top1_acc, prev?.model.top1_acc),
          severe: calcDelta(row.diagnostics.severe_miss_rate, prev?.diagnostics.severe_miss_rate),
          picked: prev ? row.counts.picked_rows - prev.counts.picked_rows : null,
        },
        overall: overallTone(tones),
      };
    });
  }, [byLeague, byLeaguePrev]);

  const titlePill = loading ? <Pill>Loading…</Pill> : <Pill>{`${windowDays}d vs prev ${windowDays}d`}</Pill>;

  return (
    <>
      <div className="section-title">Odds Audit</div>

      <Card title="Filters & actions">
        <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {titlePill}
          <Pill>LogLoss first</Pill>
          <Pill>Top1 = leitura bruta</Pill>
        </div>

        <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <label className="note">
            League
            <input
              className="input"
              style={{ width: 90, marginLeft: 6 }}
              value={leagueIdText}
              onChange={(e) => setLeagueIdText(e.target.value)}
              placeholder="all"
            />
          </label>

          <label className="note">
            Season
            <input
              className="input"
              style={{ width: 90, marginLeft: 6 }}
              value={seasonText}
              onChange={(e) => setSeasonText(e.target.value)}
              placeholder="all"
            />
          </label>

          <label className="note">
            Artifact
            <input
              className="input"
              style={{ width: 260, marginLeft: 6 }}
              value={artifactText}
              onChange={(e) => setArtifactText(e.target.value)}
              placeholder="all"
            />
          </label>

          <label className="note">
            Window
            <select
              className="select"
              style={{ width: 100, marginLeft: 6 }}
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
            >
              {[5, 7, 14, 15, 30, 60, 90, 180].map((n) => (
                <option key={n} value={n}>
                  {n}d
                </option>
              ))}
            </select>
          </label>

          <label className="note">
            Cutoff
            <select
              className="select"
              style={{ width: 100, marginLeft: 6 }}
              value={cutoffHours}
              onChange={(e) => setCutoffHours(Number(e.target.value))}
            >
              {[0, 1, 3, 6, 12, 24].map((n) => (
                <option key={n} value={n}>
                  {n}h
                </option>
              ))}
            </select>
          </label>

          <label className="note">
            Confidence
            <select
              className="select"
              style={{ width: 110, marginLeft: 6 }}
              value={minConfidence}
              onChange={(e) => setMinConfidence(e.target.value as "NONE" | "ILIKE" | "EXACT")}
            >
              <option value="NONE">NONE</option>
              <option value="ILIKE">ILIKE+</option>
              <option value="EXACT">EXACT</option>
            </select>
          </label>

          <label className="note">
            Severe ≥
            <input
              className="input"
              style={{ width: 90, marginLeft: 6 }}
              type="number"
              min={0.5}
              max={0.99}
              step={0.05}
              value={severeThreshold}
              onChange={(e) => setSevereThreshold(Number(e.target.value || 0.7))}
            />
          </label>

          <label className="note">
            Events
            <select
              className="select"
              style={{ width: 90, marginLeft: 6 }}
              value={eventLimit}
              onChange={(e) => setEventLimit(Number(e.target.value))}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="note" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={onlySevere} onChange={(e) => setOnlySevere(e.target.checked)} />
            only severe misses
          </label>
        </div>

        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="nav-btn active" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>

          <button className="nav-btn" onClick={() => void syncResults()} disabled={syncing}>
            {syncing ? "Syncing results…" : "Sync finished results"}
          </button>

          <button
            className="nav-btn"
            onClick={() => downloadCsv(`odds-audit-summary-${windowDays}d.csv`, buildSummaryExportRows(summary, summaryPrev))}
            disabled={!summary}
          >
            Export summary CSV
          </button>

          <button
            className="nav-btn"
            onClick={() => downloadCsv(`odds-audit-by-league-${windowDays}d.csv`, buildLeagueExportRows(byLeague, byLeaguePrev))}
            disabled={!byLeague || byLeague.rows.length === 0}
          >
            Export by-league CSV
          </button>

          <button
            className="nav-btn"
            onClick={() => downloadCsv(`odds-audit-events-${windowDays}d.csv`, buildEventsExportRows(events))}
            disabled={!events || events.rows.length === 0}
          >
            Export events CSV
          </button>

          {syncMsg ? <div className="note">{syncMsg}</div> : null}
          {syncErr ? <div className="note">Sync error: <b>{syncErr}</b></div> : null}
          {err ? <div className="note">Load error: <b>{err}</b></div> : null}
        </div>
      </Card>

      <div className="grid cards">
        <Kpi
          title="Qualidade probabilística"
          value={summary ? metricNum(summary.model.logloss, 4) : "—"}
          meta={
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <TonePill {...executiveTones.market} />
              <span>vs período anterior: </span>
              <span style={{ color: deltaColor(summaryDeltas.logloss, "lower"), fontWeight: 700 }}>
                {formatSignedNumber(summaryDeltas.logloss, 4)}
              </span>
            </div>
          }
        />

        <Kpi
          title="LL delta vs mercado"
          value={summary ? metricNum(summary.comparison.model_minus_market.logloss, 4) : "—"}
          meta="negativo = modelo melhor que o mercado"
        />

        <Kpi
          title="Top1 bruto"
          value={summary ? metricPct(summary.model.top1_acc) : "—"}
          meta={
            <span style={{ color: deltaColor(summaryDeltas.top1, "higher"), fontWeight: 700 }}>
              vs período anterior: {formatSignedPct(summaryDeltas.top1)}
            </span>
          }
        />

        <Kpi
          title="Severe miss rate"
          value={summary ? metricPct(summary.diagnostics.severe_miss_rate) : "—"}
          meta={
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <TonePill {...executiveTones.severe} />
              <span>
                {summary ? `${summary.diagnostics.severe_miss_count} misses` : "—"}
              </span>
            </div>
          }
        />

        <Kpi
          title="Amostra auditada"
          value={summary ? String(summary.counts.picked_rows) : "—"}
          meta={
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <TonePill {...executiveTones.sample} />
              <span style={{ color: deltaColor(summaryDeltas.picked, "higher"), fontWeight: 700 }}>
                vs período anterior: {formatSignedCount(summaryDeltas.picked)}
              </span>
            </div>
          }
        />

        <Kpi
          title="Leitura executiva"
          value={executiveTones.overall.label}
          meta={
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <TonePill {...executiveTones.overall} />
              <span>priorize LogLoss + calibração; use Top1 só como leitura bruta</span>
            </div>
          }
        />
      </div>

      <Card title="Executive reading">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div style={{ border: "1px solid #eaecf0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Semáforo</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <TonePill {...executiveTones.market} />
              <TonePill {...executiveTones.severe} />
              <TonePill {...executiveTones.sample} />
            </div>
          </div>

          <div style={{ border: "1px solid #eaecf0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Período atual</div>
            <div className="note mono">
              {summary?.meta.start_utc ? fmtIsoToShort(summary.meta.start_utc) : "—"} → {summary?.meta.end_utc ? fmtIsoToShort(summary.meta.end_utc) : "—"}
            </div>
          </div>

          <div style={{ border: "1px solid #eaecf0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Período anterior</div>
            <div className="note mono">
              {summaryPrev?.meta.start_utc ? fmtIsoToShort(summaryPrev.meta.start_utc) : "—"} → {summaryPrev?.meta.end_utc ? fmtIsoToShort(summaryPrev.meta.end_utc) : "—"}
            </div>
          </div>

          <div style={{ border: "1px solid #eaecf0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Legenda comercial</div>
            <div className="note">
              Venda esta tela como qualidade probabilística, calibração e comparação vs mercado — não só como “% de acerto”.
            </div>
          </div>
        </div>
      </Card>

      <Card title="Comparison vs previous period">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div style={{ border: "1px solid #eaecf0", borderRadius: 12, padding: 12 }}>
            <div className="note">Model LogLoss</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{summary ? metricNum(summary.model.logloss, 4) : "—"}</div>
            <div style={{ color: deltaColor(summaryDeltas.logloss, "lower"), fontWeight: 700 }}>
              {formatSignedNumber(summaryDeltas.logloss, 4)} vs prev
            </div>
          </div>

          <div style={{ border: "1px solid #eaecf0", borderRadius: 12, padding: 12 }}>
            <div className="note">Top1</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{summary ? metricPct(summary.model.top1_acc) : "—"}</div>
            <div style={{ color: deltaColor(summaryDeltas.top1, "higher"), fontWeight: 700 }}>
              {formatSignedPct(summaryDeltas.top1)} vs prev
            </div>
          </div>

          <div style={{ border: "1px solid #eaecf0", borderRadius: 12, padding: 12 }}>
            <div className="note">Severe miss rate</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {summary ? metricPct(summary.diagnostics.severe_miss_rate) : "—"}
            </div>
            <div style={{ color: deltaColor(summaryDeltas.severe, "lower"), fontWeight: 700 }}>
              {formatSignedPct(summaryDeltas.severe)} vs prev
            </div>
          </div>

          <div style={{ border: "1px solid #eaecf0", borderRadius: 12, padding: 12 }}>
            <div className="note">Picked rows</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{summary ? String(summary.counts.picked_rows) : "—"}</div>
            <div style={{ color: deltaColor(summaryDeltas.picked, "higher"), fontWeight: 700 }}>
              {formatSignedCount(summaryDeltas.picked)} vs prev
            </div>
          </div>
        </div>
      </Card>

      <Card title="By league">
        <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill>multi-league</Pill>
          <Pill>delta vs previous window</Pill>
        </div>
        {!byLeague || leagueRows.length === 0 ? (
          <div className="note">Sem dados auditados por liga ainda.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>League</th>
                <th className="mono">Season</th>
                <th className="mono">Rows</th>
                <th className="mono">Δ Rows</th>
                <th className="mono">Model LL</th>
                <th className="mono">Δ LL</th>
                <th className="mono">LL vs Mkt</th>
                <th className="mono">Top1</th>
                <th className="mono">Δ Top1</th>
                <th className="mono">Severe</th>
                <th className="mono">Δ Severe</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leagueRows.map(({ row, deltas, overall }) => (
                <tr key={`${row.league_id ?? "na"}__${row.season ?? "na"}`}>
                  <td className="mono">{row.league_id ?? "—"}</td>
                  <td className="mono">{row.season ?? "—"}</td>
                  <td className="mono">{row.counts.picked_rows}</td>
                  <td className="mono" style={{ color: deltaColor(deltas.picked, "higher"), fontWeight: 700 }}>
                    {formatSignedCount(deltas.picked)}
                  </td>
                  <td className="mono">{metricNum(row.model.logloss, 4)}</td>
                  <td className="mono" style={{ color: deltaColor(deltas.logloss, "lower"), fontWeight: 700 }}>
                    {formatSignedNumber(deltas.logloss, 4)}
                  </td>
                  <td className="mono">{metricNum(row.comparison.model_minus_market.logloss, 4)}</td>
                  <td className="mono">{metricPct(row.model.top1_acc)}</td>
                  <td className="mono" style={{ color: deltaColor(deltas.top1, "higher"), fontWeight: 700 }}>
                    {formatSignedPct(deltas.top1)}
                  </td>
                  <td className="mono">{metricPct(row.diagnostics.severe_miss_rate)}</td>
                  <td className="mono" style={{ color: deltaColor(deltas.severe, "lower"), fontWeight: 700 }}>
                    {formatSignedPct(deltas.severe)}
                  </td>
                  <td>
                    <TonePill {...overall} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Audited events">
        <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill>{events?.meta.returned ?? 0} rows</Pill>
          <Pill>event-level drilldown</Pill>
        </div>
        {!events || events.rows.length === 0 ? (
          <div className="note">Sem eventos auditados nesta janela/filtro.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Kickoff</th>
                <th>Game</th>
                <th className="mono">Lg</th>
                <th className="mono">Model H/D/A</th>
                <th className="mono">Best</th>
                <th className="mono">Result</th>
                <th className="mono">Model LL</th>
                <th className="mono">Mkt LL</th>
                <th className="mono">LL vs Mkt</th>
                <th className="mono">Severe</th>
              </tr>
            </thead>
            <tbody>
              {events.rows.map((row) => {
                const llDeltaVsMarket = calcDelta(
                  row.model_metrics?.logloss ?? null,
                  row.market_metrics?.logloss ?? null
                );

                return (
                  <tr key={`${row.event_id}__${row.artifact_filename}`}>
                    <td className="mono">{row.kickoff_utc ? fmtIsoToShort(row.kickoff_utc) : "—"}</td>
                    <td>
                      {(row.home_name ?? "Home")} vs {(row.away_name ?? "Away")}
                      <div className="note mono">{row.artifact_filename}</div>
                    </td>
                    <td className="mono">{row.league_id ?? "—"}</td>
                    <td className="mono">
                      {row.model_probs
                        ? `${metricPct(row.model_probs.H)} / ${metricPct(row.model_probs.D)} / ${metricPct(row.model_probs.A)}`
                        : "—"}
                    </td>
                    <td className="mono">
                      {row.best_side ?? "—"}
                      {row.best_side_prob != null ? ` (${metricPct(row.best_side_prob)})` : ""}
                    </td>
                    <td className="mono">
                      {row.result_1x2 ?? "—"}
                      {row.home_goals != null && row.away_goals != null ? ` (${row.home_goals}-${row.away_goals})` : ""}
                    </td>
                    <td className="mono">{metricNum(row.model_metrics?.logloss ?? null, 4)}</td>
                    <td className="mono">{metricNum(row.market_metrics?.logloss ?? null, 4)}</td>
                    <td className="mono" style={{ color: deltaColor(llDeltaVsMarket, "lower"), fontWeight: 700 }}>
                      {formatSignedNumber(llDeltaVsMarket, 4)}
                    </td>
                    <td className="mono">{row.severe_miss ? "YES" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}