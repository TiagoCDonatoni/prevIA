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
} from "../api/contracts";
import { Card } from "../ui/Card";
import { Kpi } from "../ui/Kpi";
import { Pill } from "../ui/Pill";
import { fmtIsoToShort, fmtPct, fmtNum } from "../ui/components";

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

export default function OddsAudit() {
  const [leagueIdText, setLeagueIdText] = useState("");
  const [seasonText, setSeasonText] = useState("");
  const [artifactText, setArtifactText] = useState("");
  const [windowDays, setWindowDays] = useState(5);
  const [cutoffHours, setCutoffHours] = useState(6);
  const [minConfidence, setMinConfidence] = useState<"NONE" | "ILIKE" | "EXACT">("NONE");
  const [severeThreshold, setSevereThreshold] = useState(0.7);
  const [onlySevere, setOnlySevere] = useState(false);
  const [eventLimit, setEventLimit] = useState(50);

  const [summary, setSummary] = useState<AdminOddsAuditSummaryResponse | null>(null);
  const [byLeague, setByLeague] = useState<AdminOddsAuditByLeagueResponse | null>(null);
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
      const [summaryRes, byLeagueRes, eventsRes] = await Promise.all([
        getAdminOddsAuditSummary({
          league_id: params.league_id,
          season: params.season,
          artifact_filename: params.artifact_filename,
          window_days: params.window_days,
          cutoff_hours: params.cutoff_hours,
          min_confidence: params.min_confidence,
          severe_threshold: params.severe_threshold,
        }),
        getAdminOddsAuditByLeague({
          season: params.season,
          artifact_filename: params.artifact_filename,
          window_days: params.window_days,
          cutoff_hours: params.cutoff_hours,
          min_confidence: params.min_confidence,
          severe_threshold: params.severe_threshold,
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
        }),
      ]);

      setSummary(summaryRes);
      setByLeague(byLeagueRes);
      setEvents(eventsRes);
    } catch (e: any) {
      setSummary(null);
      setByLeague(null);
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

  const titlePill = loading ? <Pill>Loading…</Pill> : <Pill>Log Loss first</Pill>;

  return (
    <>
      <div className="section-title">Odds Audit</div>

      <Card title="Filters & actions">
        <div style={{ marginBottom: 12 }}>{titlePill}</div>
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
              {[5, 7, 14, 30, 60, 90, 180].map((n) => (
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
            <input
              type="checkbox"
              checked={onlySevere}
              onChange={(e) => setOnlySevere(e.target.checked)}
            />
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

          {syncMsg ? <div className="note">{syncMsg}</div> : null}
          {syncErr ? <div className="note">Sync error: <b>{syncErr}</b></div> : null}
          {err ? <div className="note">Load error: <b>{err}</b></div> : null}
        </div>
      </Card>

      <div className="grid cards">
        <Kpi
          title="Picked rows"
          value={summary ? String(summary.counts.picked_rows) : "—"}
          meta="1 snapshot por evento/artefato antes do cutoff"
        />
        <Kpi
          title="Model LogLoss"
          value={summary ? metricNum(summary.model.logloss, 4) : "—"}
          meta="métrica principal"
        />
        <Kpi
          title="Market LogLoss"
          value={summary ? metricNum(summary.market_novig.logloss, 4) : "—"}
          meta="novig"
        />
        <Kpi
          title="Model Top1"
          value={summary ? metricPct(summary.model.top1_acc) : "—"}
          meta="leitura simples"
        />
        <Kpi
          title="Severe misses"
          value={summary ? String(summary.diagnostics.severe_miss_count) : "—"}
          meta={summary ? metricPct(summary.diagnostics.severe_miss_rate) : "—"}
        />
        <Kpi
          title="LL delta vs market"
          value={
            summary ? metricNum(summary.comparison.model_minus_market.logloss, 4) : "—"
          }
          meta="negativo = modelo melhor"
        />
      </div>

      <Card title="By league">
        <div style={{ marginBottom: 12 }}>
          <Pill>multi-league</Pill>
        </div>
        {!byLeague || byLeague.rows.length === 0 ? (
          <div className="note">Sem dados auditados por liga ainda.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>League</th>
                <th className="mono">Season</th>
                <th className="mono">Rows</th>
                <th className="mono">Model LL</th>
                <th className="mono">Mkt LL</th>
                <th className="mono">Top1</th>
                <th className="mono">Severe</th>
              </tr>
            </thead>
            <tbody>
              {byLeague.rows.map((row) => (
                <tr key={`${row.league_id ?? "na"}__${row.season ?? "na"}`}>
                  <td className="mono">{row.league_id ?? "—"}</td>
                  <td className="mono">{row.season ?? "—"}</td>
                  <td className="mono">{row.counts.picked_rows}</td>
                  <td className="mono">{metricNum(row.model.logloss, 4)}</td>
                  <td className="mono">{metricNum(row.market_novig.logloss, 4)}</td>
                  <td className="mono">{metricPct(row.model.top1_acc)}</td>
                  <td className="mono">
                    {row.diagnostics.severe_miss_count} / {metricPct(row.diagnostics.severe_miss_rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Audited events">
        <div style={{ marginBottom: 12 }}>
          <Pill>{events?.meta.returned ?? 0} rows</Pill>
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
                <th className="mono">LL</th>
                <th className="mono">Severe</th>
              </tr>
            </thead>
            <tbody>
              {events.rows.map((row) => (
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
                    {row.home_goals != null && row.away_goals != null
                      ? ` (${row.home_goals}-${row.away_goals})`
                      : ""}
                  </td>
                  <td className="mono">{metricNum(row.model_metrics?.logloss ?? null, 4)}</td>
                  <td className="mono">{row.severe_miss ? "YES" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}