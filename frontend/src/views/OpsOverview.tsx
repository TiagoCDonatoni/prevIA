import { useEffect, useMemo, useState } from "react";
import {
  adminOddspapiEventsStatus,
  adminOddspapiRun,
  adminOddspapiStatus,
  adminOpsPipelineRun,
} from "../api/client";
import type {
  AdminOddspapiEventsStatusResponse,
  AdminOddspapiRunResponse,
  AdminOddspapiStatusResponse,
} from "../api/contracts";
import { Card } from "../ui/Card";

function readUnifiedSummary(raw: any) {
  const result = raw?.result ?? null;
  const summary = result?.summary ?? null;

  if (summary) {
    return {
      leaguesProcessed: summary.leagues_processed ?? summary.leagues_requested ?? 0,
      fixturesUpdated: summary.fixtures_updated ?? 0,
      statsInserted: summary.stats_inserted ?? 0,
      oddsRefreshRuns: summary.odds_refresh_runs ?? 0,
      eventsResolved: summary.events_resolved ?? 0,
      snapshotsUpserted: summary.snapshots_upserted ?? 0,
      fallbacks: summary.fallbacks ?? 0,
      errors: summary.errors ?? 0,
    };
  }

  const items = raw?.counters?.items ?? raw?.items ?? [];

  if (Array.isArray(items) && items.length > 0) {
    return items.reduce(
      (acc: any, item: any) => {
        acc.leaguesProcessed += 1;
        acc.fixturesUpdated += Number(item?.refresh?.counters?.events_upserted ?? 0);
        acc.statsInserted += Number(item?.models?.trained_count ?? 0);
        acc.oddsRefreshRuns += item?.refresh?.ok ? 1 : 0;
        acc.eventsResolved += Number(item?.resolve?.counters?.exact ?? 0);
        acc.snapshotsUpserted += Number(
          item?.snapshots?.counters?.snapshots_upserted ?? 0
        );
        acc.fallbacks += Number(
          item?.snapshots?.counters?.snapshots_team_fallback ?? 0
        );
        acc.errors += Number(item?.resolve?.counters?.errors ?? 0);
        return acc;
      },
      {
        leaguesProcessed: 0,
        fixturesUpdated: 0,
        statsInserted: 0,
        oddsRefreshRuns: 0,
        eventsResolved: 0,
        snapshotsUpserted: 0,
        fallbacks: 0,
        errors: 0,
      }
    );
  }

  return {
    leaguesProcessed: 0,
    fixturesUpdated: 0,
    statsInserted: 0,
    oddsRefreshRuns: 0,
    eventsResolved: 0,
    snapshotsUpserted: 0,
    fallbacks: 0,
    errors: 0,
  };
}

function fmtOddspapiIso(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

function fmtOddspapiNum(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return String(n);
}

function getOddspapiUsagePct(status: AdminOddspapiStatusResponse | null) {
  const usage = status?.usage;
  if (!usage || !usage.operational_cap) return 0;

  const pct = (Number(usage.request_count || 0) / Number(usage.operational_cap)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

const ODDSPAPI_ALLOWED_BOOKMAKERS =
  "betano,bet365,betfair-ex,sportingbet,sportingbet.bet.br,stake,blaze,estrelabet";

const ODDSPAPI_BOOKMAKER_LABELS: Record<string, string> = {
  "oddspapi:bet365": "Bet365",
  "oddspapi:betano": "Betano",
  "oddspapi:betfair-ex": "Betfair Exchange",
  "oddspapi:betfair_ex": "Betfair Exchange",
  "oddspapi:blaze": "Blaze",
  "oddspapi:estrelabet": "EstrelaBet",
  "oddspapi:sportingbet": "Sportingbet",
  "oddspapi:stake": "Stake",
  "oddspapi:superbet": "Superbet",
  "oddspapi:betnacional": "Betnacional",
  "oddspapi:kto": "KTO",
  "oddspapi:pixbet": "Pixbet",
  "oddspapi:pagbet": "PagBet",
};

function fmtOddspapiBookmaker(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "—";

  const key = raw.toLowerCase();
  if (ODDSPAPI_BOOKMAKER_LABELS[key]) {
    return ODDSPAPI_BOOKMAKER_LABELS[key];
  }

  if (key.startsWith("oddspapi:")) {
    const slug = key.replace("oddspapi:", "");
    return slug.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return raw;
}

export default function OpsOverview() {
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [runAllErr, setRunAllErr] = useState<string | null>(null);
  const [runAllOut, setRunAllOut] = useState<any>(null);
  const [runAllPct, setRunAllPct] = useState(0);
  const [runAllStepLabel, setRunAllStepLabel] = useState("Aguardando execução");

  const [oddspapiStatus, setOddspapiStatus] =
    useState<AdminOddspapiStatusResponse | null>(null);
  const [oddspapiEvents, setOddspapiEvents] =
    useState<AdminOddspapiEventsStatusResponse | null>(null);
  const [oddspapiLastRun, setOddspapiLastRun] =
    useState<AdminOddspapiRunResponse | null>(null);

  const [oddspapiLoading, setOddspapiLoading] = useState(false);
  const [oddspapiRunning, setOddspapiRunning] = useState(false);
  const [oddspapiErr, setOddspapiErr] = useState<string | null>(null);

  const [oddspapiMaxRequests, setOddspapiMaxRequests] = useState(5);
  const [oddspapiMaxEvents, setOddspapiMaxEvents] = useState(20);
  const [oddspapiLimit, setOddspapiLimit] = useState(40);

  const runAll = async () => {
    setRunAllLoading(true);
    setRunAllErr(null);
    setRunAllOut(null);
    setRunAllPct(3);
    setRunAllStepLabel("Preparando atualização");

    let timer: ReturnType<typeof setInterval> | null = null;

    try {
      timer = setInterval(() => {
        setRunAllPct((prev) => {
          if (prev >= 90) {
            setRunAllStepLabel("Processando no backend…");
            return prev;
          }
          if (prev < 15) return Math.min(prev + 6, 90);
          if (prev < 35) return Math.min(prev + 5, 90);
          if (prev < 60) return Math.min(prev + 4, 90);
          return Math.min(prev + 2, 90);
        });
      }, 450);

      setRunAllStepLabel("Executando pipeline completo");

      const out = await adminOpsPipelineRun({});

      setRunAllStepLabel("Consolidando resultado");
      setRunAllPct(100);
      setRunAllOut(out);
    } catch (e: any) {
      setRunAllOut(null);
      setRunAllErr(String(e?.message || e));
      setRunAllStepLabel("Falha");
      setRunAllPct(100);
    } finally {
      if (timer) clearInterval(timer);
      setRunAllLoading(false);
    }
  };

  const pipelineSummary = useMemo(() => {
    if (!runAllOut) return null;
    return readUnifiedSummary(runAllOut);
  }, [runAllOut]);

  const loadOddspapiPanel = async () => {
    setOddspapiLoading(true);
    setOddspapiErr(null);

    try {
      const [statusOut, eventsOut] = await Promise.all([
        adminOddspapiStatus(),
        adminOddspapiEventsStatus({ limit: oddspapiLimit }),
      ]);

      setOddspapiStatus(statusOut);
      setOddspapiEvents(eventsOut);
    } catch (e: any) {
      setOddspapiErr(String(e?.message || e));
    } finally {
      setOddspapiLoading(false);
    }
  };

  const runOddspapi = async (dryRun: boolean) => {
    setOddspapiRunning(true);
    setOddspapiErr(null);

    try {
      const out = await adminOddspapiRun({
        window_hours: 72,
        max_events: oddspapiMaxEvents,
        max_external_requests: oddspapiMaxRequests,
        max_candidates_per_event: 3,
        min_score: 0.9,
        min_score_gap: 0.15,
        max_confirmations: 10,
        allowed_bookmakers: ODDSPAPI_ALLOWED_BOOKMAKERS,
        max_bookmakers_per_event: 8,
        dry_run: dryRun,
        force: false,
        verbosity: 2,
        allow_root_bookmaker_match: false,
        include_inactive_markets: false,
      });

      setOddspapiLastRun(out);
      await loadOddspapiPanel();
    } catch (e: any) {
      setOddspapiErr(String(e?.message || e));
    } finally {
      setOddspapiRunning(false);
    }
  };

  useEffect(() => {
    void loadOddspapiPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="section-title">Ops</div>

      <Card title="Monitoramento operacional">
        <div className="note" style={{ marginBottom: 10 }}>
          Esta ação executa o pipeline completo: esportes/raw/core + stats + odds + resolve + modelos + snapshots.
        </div>
        <div className="note">
          O passo de esportes agora deve ser tratado como retryable e soft-fail: falha é registrada, mas o restante continua.
        </div>
        <div className="note">
          O botão de <span className="mono">Executar pipeline completo</span> fica aqui como
          legado temporário, até ser substituído pela observabilidade dos jobs cloud.
        </div>
      </Card>

      <Card title="Ação operacional provisória — legado temporário">
        <div
          className="row"
          style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}
        >
          <button className="btn" onClick={() => void runAll()} disabled={runAllLoading}>
            {runAllLoading
              ? "Atualizando ligas autorizadas…"
              : "Atualizar ligas autorizadas"}
          </button>

          <div style={{ minWidth: 280, flex: "1 1 360px" }}>
            <div className="note" style={{ marginBottom: 6 }}>
              Etapa atual: <b>{runAllStepLabel}</b>
            </div>

            <div
              style={{
                width: "100%",
                height: 12,
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${runAllPct}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #4f46e5 0%, #22c55e 100%)",
                  transition: "width 200ms ease",
                }}
              />
            </div>

            <div className="note" style={{ marginTop: 6 }}>
              {runAllPct}% concluído
            </div>

            {runAllLoading && runAllPct >= 90 ? (
              <div className="note" style={{ marginTop: 6 }}>
                Aguardando finalização do job no backend. As últimas etapas dependem da
                resposta consolidada.
              </div>
            ) : null}
          </div>
        </div>

        {runAllErr ? (
          <div className="note" style={{ marginTop: 10 }}>
            Error: <b>{runAllErr}</b>
          </div>
        ) : null}

        {pipelineSummary ? (
          <div style={{ marginTop: 14 }}>
            <div className="note">
              <b>Resumo do update:</b>{" "}
              ligas processadas <span className="mono">{pipelineSummary.leaguesProcessed}</span>
              {" • "}
              fixtures atualizados <span className="mono">{pipelineSummary.fixturesUpdated}</span>
              {" • "}
              stats inseridos <span className="mono">{pipelineSummary.statsInserted}</span>
              {" • "}
              odds refresh <span className="mono">{pipelineSummary.oddsRefreshRuns}</span>
              {" • "}
              eventos resolvidos <span className="mono">{pipelineSummary.eventsResolved}</span>
              {" • "}
              snapshots gerados <span className="mono">{pipelineSummary.snapshotsUpserted}</span>
              {" • "}
              fallbacks <span className="mono">{pipelineSummary.fallbacks}</span>
              {" • "}
              erros <span className="mono">{pipelineSummary.errors}</span>
            </div>

            {pipelineSummary.errors > 0 ? (
              <div className="note" style={{ marginTop: 8 }}>
                Atenção: houve erros em parte do update. Revise os logs/retorno do job antes
                de considerar a execução totalmente saudável.
              </div>
            ) : (
              <div className="note" style={{ marginTop: 8 }}>
                Update concluído sem erros reportados no resumo agregado.
              </div>
            )}
          </div>
        ) : (
          <div className="note" style={{ marginTop: 10 }}>
            Fluxo legado atual:{" "}
            <span className="mono">
              allowlist approved + enabled → fixtures/core → stats → odds → resolve → snapshots
            </span>
          </div>
        )}
      </Card>

      <Card title="OddsPapi — Enriquecimento de casas BR">
        <div className="note" style={{ marginBottom: 10 }}>
          Fonte complementar de odds. Não roda no <span className="mono">run_all</span>,
          não é usada em tempo real pelo produto e respeita o cap operacional mensal.
        </div>

        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            className="btn"
            onClick={() => void loadOddspapiPanel()}
            disabled={oddspapiLoading || oddspapiRunning}
          >
            {oddspapiLoading ? "Atualizando status…" : "Atualizar status"}
          </button>

          <button
            className="btn"
            onClick={() => void runOddspapi(true)}
            disabled={oddspapiLoading || oddspapiRunning}
          >
            {oddspapiRunning ? "Executando…" : "Dry-run OddsPapi"}
          </button>

          <button
            className="btn"
            onClick={() => void runOddspapi(false)}
            disabled={oddspapiLoading || oddspapiRunning}
          >
            {oddspapiRunning ? "Executando…" : "Rodar OddsPapi agora"}
          </button>

          <label className="note">
            max requests&nbsp;
            <input
              className="input"
              style={{ width: 80, marginLeft: 6 }}
              type="number"
              min={0}
              max={20}
              value={oddspapiMaxRequests}
              onChange={(e) => setOddspapiMaxRequests(Number(e.target.value || 0))}
            />
          </label>

          <label className="note">
            max eventos&nbsp;
            <input
              className="input"
              style={{ width: 80, marginLeft: 6 }}
              type="number"
              min={1}
              max={100}
              value={oddspapiMaxEvents}
              onChange={(e) => setOddspapiMaxEvents(Number(e.target.value || 1))}
            />
          </label>

          <label className="note">
            status limit&nbsp;
            <input
              className="input"
              style={{ width: 80, marginLeft: 6 }}
              type="number"
              min={1}
              max={200}
              value={oddspapiLimit}
              onChange={(e) => setOddspapiLimit(Number(e.target.value || 40))}
            />
          </label>
        </div>

        {oddspapiErr ? (
          <div className="note" style={{ marginTop: 10 }}>
            Error: <b>{oddspapiErr}</b>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
            marginTop: 14,
          }}
        >
          <div className="card">
            <div className="card-title">Status</div>
            <div className="mono">
              {oddspapiStatus?.enabled ? "enabled" : "disabled"} • key{" "}
              {oddspapiStatus?.api_key_set ? "ok" : "missing"}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Uso mensal</div>
            <div className="mono">
              {fmtOddspapiNum(oddspapiStatus?.usage?.request_count)} /{" "}
              {fmtOddspapiNum(oddspapiStatus?.usage?.operational_cap)}
            </div>
            <div className="note">
              restante: {fmtOddspapiNum(oddspapiStatus?.usage?.remaining_operational)}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Cap</div>
            <div className="mono">{getOddspapiUsagePct(oddspapiStatus)}%</div>
            <div className="note">
              hard cap {fmtOddspapiNum(oddspapiStatus?.usage?.hard_cap)} • reserva{" "}
              {fmtOddspapiNum(oddspapiStatus?.usage?.reserve)}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Última chamada</div>
            <div className="mono">{oddspapiStatus?.last_request?.endpoint ?? "—"}</div>
            <div className="note">
              {oddspapiStatus?.last_request?.status ?? "—"} •{" "}
              {fmtOddspapiIso(oddspapiStatus?.last_request?.at_utc)}
            </div>
          </div>
        </div>

        {oddspapiLastRun ? (
          <div style={{ marginTop: 14 }}>
            <div className="note" style={{ marginBottom: 8 }}>
              <b>Último run:</b>{" "}
              <span className="mono">{oddspapiLastRun.dry_run ? "dry-run" : "real"}</span>
              {" • "}
              requests consumidas{" "}
              <span className="mono">{oddspapiLastRun.request_count_consumed ?? 0}</span>
              {" • "}
              ok <span className="mono">{String(oddspapiLastRun.ok)}</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              <div className="card">
                <div className="card-title">Mappings</div>
                <div className="mono">
                  confirmados {fmtOddspapiNum(oddspapiLastRun.counters?.auto_confirmed)}
                </div>
              </div>

              <div className="card">
                <div className="card-title">Writes</div>
                <div className="mono">
                  eventos {fmtOddspapiNum(oddspapiLastRun.counters?.write_executed)}
                </div>
                <div className="note">
                  snapshots{" "}
                  {fmtOddspapiNum(oddspapiLastRun.counters?.write_inserted_snapshots)}
                </div>
              </div>

              <div className="card">
                <div className="card-title">Budget restante</div>
                <div className="mono">
                  {fmtOddspapiNum(oddspapiLastRun.request_budget_remaining)}
                </div>
              </div>
            </div>

            <pre className="mono" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(oddspapiLastRun.counters ?? {}, null, 2)}
            </pre>
          </div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          <div className="note" style={{ marginBottom: 8 }}>
            <b>Eventos/mappings recentes:</b>{" "}
            <span className="mono">{oddspapiEvents?.count ?? 0}</span>
          </div>

          {!oddspapiEvents || oddspapiEvents.items.length === 0 ? (
            <div className="note">Sem eventos OddsPapi mapeados ainda.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fixture</th>
                    <th>Sport key</th>
                    <th>Snapshots</th>
                    <th>Bookmakers</th>
                    <th>Refresh</th>
                    <th>Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {oddspapiEvents.items.slice(0, oddspapiLimit).map((item) => (
                    <tr key={`${item.core_fixture_id ?? "na"}__${item.provider_event_id}`}>
                      <td className="mono">{item.core_fixture_id ?? "—"}</td>
                      <td className="mono">{item.sport_key ?? "—"}</td>
                      <td className="mono">
                        {(item.snapshots_1x2?.count ?? 0) > 0 ? (
                          item.snapshots_1x2.count
                        ) : (
                          <span className="note">0</span>
                        )}
                      </td>
                        <td style={{ minWidth: 280 }}>
                          {(item.snapshots_1x2?.bookmakers ?? []).length > 0 ? (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {(item.snapshots_1x2?.bookmakers ?? []).map((bookmaker) => (
                                <span
                                  key={bookmaker}
                                  className="mono"
                                  title={bookmaker}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    borderRadius: 999,
                                    padding: "3px 8px",
                                    background: "rgba(255,255,255,0.04)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {fmtOddspapiBookmaker(bookmaker)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="note">—</span>
                          )}
                        </td>
                      <td className="mono">
                        {item.refresh?.summary ? (
                          item.refresh.summary
                        ) : (
                          <span className="note">aguardando</span>
                        )}
                      </td>
                      <td className="mono">{fmtOddspapiIso(item.updated_at_utc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}