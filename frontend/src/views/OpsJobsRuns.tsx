import { useEffect, useMemo, useState } from "react";
import {
  adminOpsPipelineHealth,
  adminOpsRunEvents,
  adminOpsRunsRecent,
} from "../api/client";
import type {
  AdminOpsPipelineHealthResponse,
  AdminOpsRunEventsResponse,
  AdminOpsRunsRecentResponse,
} from "../api/contracts";
import { Card } from "../ui/Card";
import { Kpi } from "../ui/Kpi";
import { Pill } from "../ui/Pill";
import { fmtIsoToShort, fmtNum } from "../ui/components";

function fmtIso(value: string | null | undefined) {
  if (!value) return "—";
  return fmtIsoToShort(value);
}

function fmtDurationMs(value: number | null | undefined) {
  if (value == null) return "—";
  return `${fmtNum(value)} ms`;
}

function jsonPretty(value: any) {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function OpsJobsRuns() {
  const [health, setHealth] = useState<AdminOpsPipelineHealthResponse | null>(null);
  const [runs, setRuns] = useState<AdminOpsRunsRecentResponse | null>(null);
  const [events, setEvents] = useState<AdminOpsRunEventsResponse | null>(null);

  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll(preserveSelection = true) {
    setLoading(true);
    setErr(null);

    try {
      const [healthOut, runsOut] = await Promise.all([
        adminOpsPipelineHealth({ lookback_days: 5 }),
        adminOpsRunsRecent({ limit: 30 }),
      ]);

      setHealth(healthOut);
      setRuns(runsOut);

      const nextRunId =
        preserveSelection && selectedRunId != null
          ? selectedRunId
          : runsOut.items[0]?.run_id ?? null;

      setSelectedRunId(nextRunId);

      if (nextRunId != null) {
        const eventsOut = await adminOpsRunEvents({ run_id: nextRunId, limit: 200 });
        setEvents(eventsOut);
      } else {
        setEvents(null);
      }
    } catch (e: any) {
      setErr(String(e?.message || e));
      setHealth(null);
      setRuns(null);
      setEvents(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents(runId: number) {
    setSelectedRunId(runId);
    try {
      const out = await adminOpsRunEvents({ run_id: runId, limit: 200 });
      setEvents(out);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setEvents(null);
    }
  }

  useEffect(() => {
    void loadAll(false);
  }, []);

  const lastFull = health?.last_runs?.update_pipeline_run ?? null;
  const lastOddsOnly = health?.last_runs?.pipeline_run_all ?? null;

  const selectedRun = useMemo(() => {
    return runs?.items.find((x) => x.run_id === selectedRunId) ?? null;
  }, [runs, selectedRunId]);

  return (
    <>
      <div className="section-title">Jobs & Runs</div>

      <Card title="Saúde operacional">
        <div
          className="row"
          style={{ gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}
        >
          <button className="nav-btn active" onClick={() => void loadAll()} disabled={loading}>
            {loading ? "Atualizando…" : "Refresh"}
          </button>

          {err ? <div className="note">Erro: <b>{err}</b></div> : null}
          {!err ? (
            <div className="note">
              Esta tela fecha o cerco sobre Ops: últimos refreshes, saúde do core e falhas recentes.
            </div>
          ) : null}
        </div>

        <div className="grid cards">
          <Kpi
            title="RAW fixtures"
            value={fmtIso(health?.freshness.raw_fixtures_last_ok_at_utc)}
            meta="último fetch ok"
          />
          <Kpi
            title="Core fixtures"
            value={fmtIso(health?.freshness.core_fixtures_last_updated_at_utc)}
            meta="último update"
          />
          <Kpi
            title="Odds events"
            value={fmtIso(health?.freshness.odds_events_last_updated_at_utc)}
            meta="último update"
          />
          <Kpi
            title="Odds snapshots"
            value={fmtIso(health?.freshness.odds_snapshots_last_captured_at_utc)}
            meta="última captura"
          />
          <Kpi
            title="Fixtures D-5"
            value={health ? String(health.core_checks.fixtures_total) : "—"}
            meta={`finished ${health?.core_checks.fixtures_finished ?? "—"} • with_goals ${health?.core_checks.fixtures_with_goals ?? "—"}`}
          />
          <Kpi
            title="Past-due NS D-5"
            value={health ? String(health.core_checks.fixtures_past_due_ns) : "—"}
            meta={`failed 24h ${health?.failed_runs.last_24h ?? "—"} • 7d ${health?.failed_runs.last_7d ?? "—"}`}
          />
        </div>
      </Card>

      <Card title="Últimos pipelines">
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <div className="note" style={{ marginBottom: 6 }}>
              <b>Pipeline completo</b>
            </div>
            {lastFull ? (
              <>
                <div className="note">run_id <span className="mono">{lastFull.run_id}</span></div>
                <div className="note">status <span className="mono">{lastFull.status}</span></div>
                <div className="note">started {fmtIso(lastFull.started_at_utc)}</div>
                <div className="note">finished {fmtIso(lastFull.finished_at_utc)}</div>
                <div className="note">duration {fmtDurationMs(lastFull.duration_ms)}</div>
                {lastFull.error ? (
                  <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
                    {jsonPretty(lastFull.error)}
                  </pre>
                ) : null}
              </>
            ) : (
              <div className="note">Sem run recente.</div>
            )}
          </div>

          <div style={{ flex: "1 1 320px" }}>
            <div className="note" style={{ marginBottom: 6 }}>
              <b>Pipeline odds-only</b>
            </div>
            {lastOddsOnly ? (
              <>
                <div className="note">run_id <span className="mono">{lastOddsOnly.run_id}</span></div>
                <div className="note">status <span className="mono">{lastOddsOnly.status}</span></div>
                <div className="note">started {fmtIso(lastOddsOnly.started_at_utc)}</div>
                <div className="note">finished {fmtIso(lastOddsOnly.finished_at_utc)}</div>
                <div className="note">duration {fmtDurationMs(lastOddsOnly.duration_ms)}</div>
                {lastOddsOnly.error ? (
                  <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
                    {jsonPretty(lastOddsOnly.error)}
                  </pre>
                ) : null}
              </>
            ) : (
              <div className="note">Sem run recente.</div>
            )}
          </div>
        </div>
      </Card>

      <Card title="Runs recentes">
        {!runs || runs.items.length === 0 ? (
          <div className="note">Sem runs registrados.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="mono">Run</th>
                <th>Job</th>
                <th>Status</th>
                <th>Scope</th>
                <th>Started</th>
                <th>Finished</th>
                <th className="mono">Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.items.map((row) => (
                <tr key={row.run_id}>
                  <td className="mono">{row.run_id}</td>
                  <td>
                    {row.job_key}
                    {row.sport_key ? (
                      <div className="note mono">{row.sport_key}</div>
                    ) : null}
                  </td>
                  <td>
                    <Pill>{row.status}</Pill>
                  </td>
                  <td className="mono">{row.scope_key ?? "—"}</td>
                  <td className="mono">{fmtIso(row.started_at_utc)}</td>
                  <td className="mono">{fmtIso(row.finished_at_utc)}</td>
                  <td className="mono">{fmtDurationMs(row.duration_ms)}</td>
                  <td>
                    <button
                      className={`nav-btn ${selectedRunId === row.run_id ? "active" : ""}`}
                      onClick={() => void loadEvents(row.run_id)}
                    >
                      Ver eventos
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Eventos do run selecionado">
        {!selectedRun ? (
          <div className="note">Selecione um run.</div>
        ) : (
          <>
            <div className="note" style={{ marginBottom: 10 }}>
              Run <span className="mono">{selectedRun.run_id}</span> • job{" "}
              <span className="mono">{selectedRun.job_key}</span> • status{" "}
              <span className="mono">{selectedRun.status}</span>
            </div>

            {selectedRun.error ? (
              <div style={{ marginBottom: 12 }}>
                <div className="note"><b>Erro do run</b></div>
                <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
                  {jsonPretty(selectedRun.error)}
                </pre>
              </div>
            ) : null}

            {!events || events.items.length === 0 ? (
              <div className="note">Sem eventos detalhados para este run.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {events.items.map((ev, idx) => (
                  <div
                    key={`${ev.created_at_utc ?? "na"}__${idx}`}
                    style={{
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Pill>{ev.event_level}</Pill>
                      <span className="mono">{ev.event_type}</span>
                      <span className="mono">{fmtIso(ev.created_at_utc)}</span>
                      {ev.attempt_id != null ? (
                        <span className="mono">attempt {ev.attempt_id}</span>
                      ) : null}
                    </div>

                    {ev.message ? (
                      <div className="note" style={{ marginTop: 8 }}>
                        {ev.message}
                      </div>
                    ) : null}

                    {ev.payload ? (
                      <pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
                        {jsonPretty(ev.payload)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}