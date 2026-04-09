import { useMemo, useState } from "react";
import { adminOpsPipelineRun } from "../api/client";
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

export default function OpsOverview() {
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [runAllErr, setRunAllErr] = useState<string | null>(null);
  const [runAllOut, setRunAllOut] = useState<any>(null);
  const [runAllPct, setRunAllPct] = useState(0);
  const [runAllStepLabel, setRunAllStepLabel] = useState("Aguardando execução");

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

      setRunAllStepLabel("Atualizando ligas autorizadas");

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

  return (
    <>
      <div className="section-title">Ops</div>

      <Card title="Monitoramento operacional">
        <div className="note" style={{ marginBottom: 10 }}>
          Esta área passa a concentrar ações operacionais provisórias e, no próximo passo,
          o monitoramento de jobs em Cloud.
        </div>
        <div className="note">
          O botão de <span className="mono">Atualizar ligas autorizadas</span> fica aqui como
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
    </>
  );
}