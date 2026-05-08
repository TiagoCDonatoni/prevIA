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
  AdminOpsRunRow,
} from "../api/contracts";
import { Card } from "../ui/Card";
import { Kpi } from "../ui/Kpi";
import { Pill } from "../ui/Pill";
import { fmtIsoToShort, fmtNum } from "../ui/components";

type WatchedJob = {
  jobKey: string;
  label: string;
  schedule: string;
  role: string;
};

const WATCHED_JOBS: WatchedJob[] = [
  {
    jobKey: "pipeline_run_all",
    label: "Pipeline 6h",
    schedule: "00:25, 06:25, 12:25, 18:25",
    role: "Odds novas, resolve jogos e materializa snapshots.",
  },
  {
    jobKey: "update_pipeline_run_shard",
    label: "Update pesado shardeado",
    schedule: "ter/qui/sab 01:05-03:20",
    role: "Atualiza fixtures, estatísticas, modelos, snapshots e auditoria em blocos.",
  },
  {
    jobKey: "audit_sync_from_product_snapshots",
    label: "Audit sync",
    schedule: "diário 05:45",
    role: "Atualiza predictions/results para auditoria do modelo.",
  },
  {
    jobKey: "odds_catalog_sync",
    label: "Catálogo Odds",
    schedule: "segunda 03:05",
    role: "Sincroniza o catálogo de ligas/sports da Odds API.",
  },
  {
    jobKey: "odds_league_gap_scan",
    label: "Gap scan ligas",
    schedule: "segunda 03:15",
    role: "Detecta ligas novas ou ainda não mapeadas.",
  },
  {
    jobKey: "odds_league_autoclassify",
    label: "Autoclassify ligas",
    schedule: "segunda 03:30",
    role: "Classifica automaticamente sugestões de ligas quando possível.",
  },
];

const RUNS_PAGE_SIZE = 30;
const EVENTS_LIMIT = 100;

function fmtIso(value: string | null | undefined) {
  if (!value) return "—";
  return fmtIsoToShort(value);
}

function fmtDurationMs(value: number | null | undefined) {
  if (value == null) return "—";

  if (value >= 60_000) {
    return `${(value / 60_000).toFixed(1)} min`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} s`;
  }

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

function isProblemStatus(status: string | null | undefined) {
  return ["failed", "blocked", "cancelled"].includes(String(status || "").toLowerCase());
}

function isRunningStatus(status: string | null | undefined) {
  return ["queued", "running"].includes(String(status || "").toLowerCase());
}

function getCounters(row: AdminOpsRunRow | null | undefined): Record<string, any> {
  if (!row?.counters || typeof row.counters !== "object") return {};
  return row.counters as Record<string, any>;
}

function counterValue(row: AdminOpsRunRow | null | undefined, key: string) {
  const counters = getCounters(row);
  const value = counters[key];
  return value == null || value === "" ? null : value;
}

function countersSummary(row: AdminOpsRunRow | null | undefined) {
  if (!row) return "—";

  const parts: string[] = [];

  const count = counterValue(row, "count");
  const succeeded = counterValue(row, "succeeded_count");
  const failed = counterValue(row, "failed_count");
  const shardIndex = counterValue(row, "shard_index");
  const shardCount = counterValue(row, "shard_count");
  const snapshots = counterValue(row, "snapshots_upserted");
  const fixtures = counterValue(row, "fixtures_updated");
  const auditPredictions = counterValue(row, "audit_predictions_upserted");
  const auditResults = counterValue(row, "audit_results_upserted");

  if (count != null) parts.push(`count ${count}`);
  if (succeeded != null) parts.push(`ok ${succeeded}`);
  if (failed != null) parts.push(`fail ${failed}`);
  if (shardIndex != null && shardCount != null) parts.push(`shard ${shardIndex}/${shardCount}`);
  if (fixtures != null) parts.push(`fixtures ${fixtures}`);
  if (snapshots != null) parts.push(`snapshots ${snapshots}`);
  if (auditPredictions != null) parts.push(`pred ${auditPredictions}`);
  if (auditResults != null) parts.push(`results ${auditResults}`);

  return parts.length > 0 ? parts.join(" • ") : "—";
}

function runAgeLabel(row: AdminOpsRunRow | null | undefined) {
  if (!row?.finished_at_utc && !row?.started_at_utc) return "—";

  const raw = row.finished_at_utc || row.started_at_utc;
  if (!raw) return "—";

  const timestamp = new Date(raw).getTime();
  if (!Number.isFinite(timestamp)) return fmtIso(raw);

  const diffMs = Date.now() - timestamp;
  const diffHours = diffMs / 3_600_000;

  if (diffHours < 1) return `${Math.max(1, Math.round(diffMs / 60_000))} min atrás`;
  if (diffHours < 24) return `${diffHours.toFixed(1)} h atrás`;

  return `${(diffHours / 24).toFixed(1)} d atrás`;
}

function jobLabel(jobKey: string) {
  return WATCHED_JOBS.find((x) => x.jobKey === jobKey)?.label || jobKey;
}

export default function OpsJobsRuns() {
  const [health, setHealth] = useState<AdminOpsPipelineHealthResponse | null>(null);
  const [runs, setRuns] = useState<AdminOpsRunsRecentResponse | null>(null);
  const [events, setEvents] = useState<AdminOpsRunEventsResponse | null>(null);

  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMoreRuns, setLoadingMoreRuns] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setErr(null);

    try {
      const [healthOut, runsOut] = await Promise.all([
        adminOpsPipelineHealth({ lookback_days: 5 }),
        adminOpsRunsRecent({ limit: RUNS_PAGE_SIZE }),
      ]);

      setHealth(healthOut);
      setRuns(runsOut);

      // Eventos agora são carregados somente sob demanda, ao clicar em "Eventos".
      setSelectedRunId(null);
      setEvents(null);
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
    setEventsLoading(true);
    setErr(null);

    try {
      const out = await adminOpsRunEvents({ run_id: runId, limit: EVENTS_LIMIT });
      setEvents(out);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setEvents(null);
    } finally {
      setEventsLoading(false);
    }
  }

  async function loadMoreRuns() {
    if (!runs?.has_more || !runs.next_before_run_id) return;

    setLoadingMoreRuns(true);
    setErr(null);

    try {
      const out = await adminOpsRunsRecent({
        limit: RUNS_PAGE_SIZE,
        before_run_id: runs.next_before_run_id,
      });

      setRuns((prev) => {
        if (!prev) return out;

        const seen = new Set(prev.items.map((x) => x.run_id));
        const nextItems = out.items.filter((x) => !seen.has(x.run_id));

        return {
          ...out,
          items: [...prev.items, ...nextItems],
          count: prev.items.length + nextItems.length,
        };
      });
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoadingMoreRuns(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const runItems = runs?.items ?? [];

  const lastByJob = useMemo(() => {
    const map = new Map<string, AdminOpsRunRow>();

    for (const row of runItems) {
      if (!map.has(row.job_key)) {
        map.set(row.job_key, row);
      }
    }

    return map;
  }, [runItems]);

  const problemRuns = useMemo(() => {
    return runItems.filter((row) => isProblemStatus(row.status)).slice(0, 8);
  }, [runItems]);

  const runningRuns = useMemo(() => {
    return runItems.filter((row) => isRunningStatus(row.status));
  }, [runItems]);

  const selectedRun = useMemo(() => {
    return runItems.find((x) => x.run_id === selectedRunId) ?? null;
  }, [runItems, selectedRunId]);

  const lastPipeline = lastByJob.get("pipeline_run_all") ?? null;
  const lastHeavy = lastByJob.get("update_pipeline_run_shard") ?? null;
  const lastAudit = lastByJob.get("audit_sync_from_product_snapshots") ?? null;

  return (
    <>
      <div className="section-title">Jobs & Runs</div>

      <Card title="Checklist diário">
        <div
          className="row"
          style={{ gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}
        >
          <button className="nav-btn active" onClick={() => void loadAll()} disabled={loading}>
            {loading ? "Atualizando…" : "Refresh"}
          </button>

          {err ? (
            <div className="note">
              Erro: <b>{err}</b>
            </div>
          ) : (
            <div className="note">
              Olhe esta tela todo dia para confirmar: jobs rodaram, dados atualizaram e não houve falha recente.
            </div>
          )}
        </div>

        <div className="grid cards">
          <Kpi
            title="Falhas 24h"
            value={health ? String(health.failed_runs.last_24h) : "—"}
            meta={`falhas/bloqueios 7d ${health?.failed_runs.last_7d ?? "—"}`}
          />
          <Kpi
            title="Pipeline 6h"
            value={lastPipeline ? lastPipeline.status : "—"}
            meta={
              lastPipeline
                ? `${runAgeLabel(lastPipeline)} • ${countersSummary(lastPipeline)}`
                : "sem run recente"
            }
          />
          <Kpi
            title="Update pesado"
            value={lastHeavy ? lastHeavy.status : "—"}
            meta={
              lastHeavy
                ? `${runAgeLabel(lastHeavy)} • ${countersSummary(lastHeavy)}`
                : "sem shard recente"
            }
          />
          <Kpi
            title="Audit"
            value={lastAudit ? lastAudit.status : "—"}
            meta={
              lastAudit
                ? `${runAgeLabel(lastAudit)} • ${countersSummary(lastAudit)}`
                : "sem run recente"
            }
          />
          <Kpi
            title="Odds snapshots"
            value={fmtIso(health?.freshness.odds_snapshots_last_captured_at_utc)}
            meta="última materialização/captura"
          />
          <Kpi
            title="Core fixtures"
            value={fmtIso(health?.freshness.core_fixtures_last_updated_at_utc)}
            meta={`D-${health?.core_checks.lookback_days ?? "?"}: ${health?.core_checks.fixtures_total ?? "—"} jogos`}
          />
        </div>
      </Card>

      {runningRuns.length > 0 ? (
        <Card title="Rodando agora">
          <table className="table">
            <thead>
              <tr>
                <th className="mono">Run</th>
                <th>Job</th>
                <th>Status</th>
                <th>Started</th>
                <th className="mono">Resumo</th>
              </tr>
            </thead>
            <tbody>
              {runningRuns.map((row) => (
                <tr key={row.run_id}>
                  <td className="mono">{row.run_id}</td>
                  <td>{jobLabel(row.job_key)}</td>
                  <td>
                    <Pill>{row.status}</Pill>
                  </td>
                  <td className="mono">{fmtIso(row.started_at_utc)}</td>
                  <td className="mono">{countersSummary(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <Card title="Jobs principais">
        <table className="table">
          <thead>
            <tr>
              <th>Rotina</th>
              <th>Agenda</th>
              <th>Último status</th>
              <th>Última execução</th>
              <th className="mono">Duração</th>
              <th className="mono">Resumo</th>
            </tr>
          </thead>
          <tbody>
            {WATCHED_JOBS.map((job) => {
              const last = lastByJob.get(job.jobKey) ?? null;
              const hasProblem = isProblemStatus(last?.status);

              return (
                <tr
                  key={job.jobKey}
                  style={
                    hasProblem
                      ? { background: "rgba(255, 84, 84, 0.08)" }
                      : undefined
                  }
                >
                  <td>
                    <div>{job.label}</div>
                    <div className="note">{job.role}</div>
                    <div className="note mono">{job.jobKey}</div>
                  </td>
                  <td className="mono">{job.schedule}</td>
                  <td>
                    <Pill>{last?.status ?? "sem run"}</Pill>
                    {last?.run_id ? <div className="note mono">run {last.run_id}</div> : null}
                  </td>
                  <td>
                    <div className="mono">{fmtIso(last?.finished_at_utc || last?.started_at_utc)}</div>
                    <div className="note">{runAgeLabel(last)}</div>
                  </td>
                  <td className="mono">{fmtDurationMs(last?.duration_ms)}</td>
                  <td className="mono">{countersSummary(last)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Falhas, bloqueios e cancelamentos recentes">
        {problemRuns.length === 0 ? (
          <div className="note">Nenhuma falha/bloqueio recente nos runs carregados.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="mono">Run</th>
                <th>Job</th>
                <th>Status</th>
                <th>Quando</th>
                <th>Erro / motivo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {problemRuns.map((row) => (
                <tr key={row.run_id}>
                  <td className="mono">{row.run_id}</td>
                  <td>
                    {jobLabel(row.job_key)}
                    <div className="note mono">{row.job_key}</div>
                  </td>
                  <td>
                    <Pill>{row.status}</Pill>
                  </td>
                  <td className="mono">{fmtIso(row.finished_at_utc || row.updated_at_utc)}</td>
                  <td>
                    {row.block_reason ? (
                      <div className="note">{row.block_reason}</div>
                    ) : null}
                    {row.error ? (
                      <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                        {jsonPretty(row.error)}
                      </pre>
                    ) : null}
                  </td>
                  <td>
                    <button
                      className={`nav-btn ${selectedRunId === row.run_id ? "active" : ""}`}
                      onClick={() => void loadEvents(row.run_id)}
                    >
                      Eventos
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Runs recentes">
        {!runs || runs.items.length === 0 ? (
          <div className="note">Sem runs registrados.</div>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th className="mono">Run</th>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Origem</th>
                  <th>Finished</th>
                  <th className="mono">Duração</th>
                  <th className="mono">Resumo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.items.map((row) => (
                  <tr key={row.run_id}>
                    <td className="mono">{row.run_id}</td>
                    <td>
                      {jobLabel(row.job_key)}
                      <div className="note mono">{row.job_key}</div>
                      {row.sport_key ? <div className="note mono">{row.sport_key}</div> : null}
                    </td>
                    <td>
                      <Pill>{row.status}</Pill>
                    </td>
                    <td>
                      <div className="mono">{row.trigger_source ?? "—"}</div>
                      {row.requested_by ? <div className="note mono">{row.requested_by}</div> : null}
                    </td>
                    <td className="mono">{fmtIso(row.finished_at_utc || row.started_at_utc)}</td>
                    <td className="mono">{fmtDurationMs(row.duration_ms)}</td>
                    <td className="mono">{countersSummary(row)}</td>
                    <td>
                      <button
                        className={`nav-btn ${selectedRunId === row.run_id ? "active" : ""}`}
                        onClick={() => void loadEvents(row.run_id)}
                      >
                        Eventos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div
              className="row"
              style={{
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              <div className="note">
                {runs.items.length} runs carregados. Eventos são carregados somente ao clicar em “Eventos”.
              </div>

              {runs.has_more ? (
                <button
                  className="nav-btn"
                  onClick={() => void loadMoreRuns()}
                  disabled={loadingMoreRuns}
                >
                  {loadingMoreRuns ? "Carregando…" : "Carregar mais"}
                </button>
              ) : (
                <div className="note">Fim da lista carregada.</div>
              )}
            </div>
          </>
        )}
      </Card>

      <Card title="Eventos do run selecionado">
        {eventsLoading ? (
          <div className="note">Carregando eventos…</div>
        ) : !selectedRun ? (
          <div className="note">Clique em “Eventos” em algum run para carregar detalhes.</div>
        ) : (
          <>
            <div className="note" style={{ marginBottom: 10 }}>
              Run <span className="mono">{selectedRun.run_id}</span> • job{" "}
              <span className="mono">{selectedRun.job_key}</span> • status{" "}
              <span className="mono">{selectedRun.status}</span>
            </div>

            {selectedRun.error ? (
              <div style={{ marginBottom: 12 }}>
                <div className="note">
                  <b>Erro do run</b>
                </div>
                <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
                  {jsonPretty(selectedRun.error)}
                </pre>
              </div>
            ) : null}

            {selectedRun.counters ? (
              <div style={{ marginBottom: 12 }}>
                <div className="note">
                  <b>Counters</b>
                </div>
                <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
                  {jsonPretty(selectedRun.counters)}
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