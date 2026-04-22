import { useEffect, useMemo, useState } from "react";
import {
  getOddsQueueIntel,
  adminOddsRefreshAndResolve,
  adminOpsPipelineRun,
  adminOpsPipelineRunAll,
  adminTeamResolutionPending,
  adminTeamResolutionSearchTeams,
  adminTeamResolutionApprove,
  adminTeamResolutionDismiss,
} from "../api/client";
import type {
  OddsIntelItem,
  OddsIntelResponse,
  TeamResolutionPendingItem,
  TeamSearchItem,
} from "../api/contracts";
import { Card } from "../ui/Card";
import { Kpi } from "../ui/Kpi";

function fmt(n: number | null | undefined, digits = 3) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function isoShort(iso: string) {
  return iso.replace("T", " ").replace(":00Z", "Z");
}

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
        acc.snapshotsUpserted += Number(item?.snapshots?.counters?.snapshots_upserted ?? 0);
        acc.fallbacks += Number(item?.snapshots?.counters?.snapshots_team_fallback ?? 0);
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

export default function OddsIntel() {
  const [sportKey, setSportKey] = useState("soccer_epl");
  const [hoursAhead, setHoursAhead] = useState(720);
  const [limit, setLimit] = useState(50);
  const [minConfidence, setMinConfidence] = useState<"EXACT" | "ILIKE" | "FUZZY" | "NONE">("NONE");

  const [regions, setRegions] = useState("eu");
  const [opsUseAllowlist, setOpsUseAllowlist] = useState(true);

  const [assumeLeagueId, setAssumeLeagueId] = useState(39);
  const [assumeSeason, setAssumeSeason] = useState(2025);
  const [tolHours, setTolHours] = useState(6);
  const [opsLimit, setOpsLimit] = useState(500);

  const [opsLoading, setOpsLoading] = useState(false);
  const [opsErr, setOpsErr] = useState<string | null>(null);
  const [opsOut, setOpsOut] = useState<any>(null);

  const [sort, setSort] = useState("best_ev");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [data, setData] = useState<OddsIntelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [runAllLoading, setRunAllLoading] = useState(false);
  const [runAllErr, setRunAllErr] = useState<string | null>(null);
  const [runAllOut, setRunAllOut] = useState<any>(null);
  const [runAllPct, setRunAllPct] = useState(0);
  const [runAllStepLabel, setRunAllStepLabel] = useState("Aguardando execução");

  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineErr, setPipelineErr] = useState<string | null>(null);
  const [pipelineOut, setPipelineOut] = useState<any>(null);
  const [showLegacyDebug, setShowLegacyDebug] = useState(false);

  const [teamPendingLoading, setTeamPendingLoading] = useState(false);
  const [teamPendingErr, setTeamPendingErr] = useState<string | null>(null);
  const [teamPending, setTeamPending] = useState<TeamResolutionPendingItem[]>([]);

  const [teamSearchLoading, setTeamSearchLoading] = useState(false);
  const [teamSearchErr, setTeamSearchErr] = useState<string | null>(null);
  const [teamSearchResults, setTeamSearchResults] = useState<Record<string, TeamSearchItem[]>>({});
  const [teamSearchText, setTeamSearchText] = useState<Record<string, string>>({});
  const [teamApproveLoadingKey, setTeamApproveLoadingKey] = useState<string | null>(null);

  const makePendingKey = (it: TeamResolutionPendingItem) => `${it.sport_key || ""}__${it.raw_name || ""}`;

  const runOps = async () => {
    setOpsLoading(true);
    setOpsErr(null);
    try {
      const out = await adminOddsRefreshAndResolve({
        sport_key: sportKey,
        regions,
        hours_ahead: hoursAhead,
        assume_league_id: opsUseAllowlist ? null : assumeLeagueId,
        assume_season: opsUseAllowlist ? null : assumeSeason,
        tol_hours: opsUseAllowlist ? null : tolHours,
        limit: opsLimit,
      });
      setOpsOut(out);
      await refresh();
      await refreshTeamPending();
    } catch (e: any) {
      setOpsOut(null);
      setOpsErr(String(e?.message || e));
    } finally {
      setOpsLoading(false);
    }
  };

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

      await refresh();
      await refreshTeamPending();
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

  const runUnifiedPipeline = async () => {
    setPipelineLoading(true);
    setPipelineErr(null);
    setPipelineOut(null);
    setPipelinePct(3);
    setPipelineStepLabel("Preparando atualização");

    let timer: ReturnType<typeof setInterval> | null = null;

    try {
      timer = setInterval(() => {
        setPipelinePct((prev) => {
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
        });
      }, 450);

      setPipelineStepLabel("Atualizando ligas / fixtures / core");

      const out = await adminOpsPipelineRunAll({
        only_sport_key: runAllOnlyThisSport ? sportKey : null,
      });

      setPipelineStepLabel("Consolidando resultado");
      setPipelinePct(100);
      setPipelineOut(out);

      await refresh();
      await refreshTeamPending();
    } catch (e: any) {
      setPipelineOut(null);
      setPipelineErr(String(e?.message || e));
      setPipelineStepLabel("Falha");
      setPipelinePct(100);
    } finally {
      if (timer) clearInterval(timer);
      setPipelineLoading(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await getOddsQueueIntel({
        sport_key: sportKey,
        hours_ahead: hoursAhead,
        limit,
        min_confidence: minConfidence,
        sort,
        order,
      });
      setData(res);
    } catch (e: any) {
      setData(null);
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const refreshTeamPending = async () => {
    setTeamPendingLoading(true);
    setTeamPendingErr(null);
    try {
      const out = await adminTeamResolutionPending();
      setTeamPending(out.items || []);
    } catch (e: any) {
      setTeamPending([]);
      setTeamPendingErr(String(e?.message || e));
    } finally {
      setTeamPendingLoading(false);
    }
  };

  const searchTeams = async (item: TeamResolutionPendingItem) => {
    const key = makePendingKey(item);
    const q = (teamSearchText[key] || item.raw_name || "").trim();
    if (!q || q.length < 2) return;

    setTeamSearchLoading(true);
    setTeamSearchErr(null);
    try {
      const out = await adminTeamResolutionSearchTeams(q);
      setTeamSearchResults((prev) => ({
        ...prev,
        [key]: out.items || [],
      }));
    } catch (e: any) {
      setTeamSearchErr(String(e?.message || e));
    } finally {
      setTeamSearchLoading(false);
    }
  };

  const approveTeamAlias = async (item: TeamResolutionPendingItem, teamId: number) => {
    const key = makePendingKey(item);
    setTeamApproveLoadingKey(key);
    try {
      await adminTeamResolutionApprove({
        sport_key: String(item.sport_key || ""),
        raw_name: String(item.raw_name || ""),
        team_id: Number(teamId),
        normalized_name: item.normalized_name || undefined,
        confidence: 1.0,
      });

      await refreshTeamPending();
      await refresh(); // <- importante: atualiza o Intel também
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setTeamApproveLoadingKey(null);
    }
  };

  const dismissTeamPending = async (item: TeamResolutionPendingItem) => {
    const key = makePendingKey(item);
    setTeamApproveLoadingKey(key);
    try {
      await adminTeamResolutionDismiss({
        sport_key: String(item.sport_key || ""),
        raw_name: String(item.raw_name || ""),
      });

      await refreshTeamPending();
      await refresh(); // mantém a tela inteira consistente
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setTeamApproveLoadingKey(null);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportKey, hoursAhead, limit, minConfidence, sort, order]);

  useEffect(() => {
    void refreshTeamPending();
  }, []);

  const buckets = useMemo(() => {
    const items = data?.items ?? [];
    const okExact: OddsIntelItem[] = [];
    const okFallback: OddsIntelItem[] = [];
    const missingTeam: OddsIntelItem[] = [];
    const missingSameLeague: OddsIntelItem[] = [];
    const missingExact: OddsIntelItem[] = [];
    const otherModelError: OddsIntelItem[] = [];

    for (const it of items) {
      const modelStatus = (it.model as any)?.model_status;

      if (it.status === "ok") {
        if (modelStatus === "OK_FALLBACK") okFallback.push(it);
        else okExact.push(it);
        continue;
      }

      if (it.reason === "missing_team_id") {
        missingTeam.push(it);
        continue;
      }

      if (it.reason === "MISSING_TEAM_STATS_SAME_LEAGUE") {
        missingSameLeague.push(it);
        continue;
      }

      if (it.reason === "MISSING_TEAM_STATS_EXACT") {
        missingExact.push(it);
        continue;
      }

      otherModelError.push(it);
    }

    return {
      okExact,
      okFallback,
      ok: [...okExact, ...okFallback],
      missingTeam,
      missingSameLeague,
      missingExact,
      modelError: [...missingSameLeague, ...missingExact, ...otherModelError],
      otherModelError,
    };
  }, [data]);

  const kpis = useMemo(() => {
    if (!data || data.items.length === 0) return null;

    const total = data.items.length;
    const ok = data.meta.counts.ok_model;
    const missingTeam = data.meta.counts.missing_team;
    const modelError = data.meta.counts.model_error;

    const okExact = data.meta.runtime_counts.ok_exact;
    const okFallback = data.meta.runtime_counts.ok_fallback;
    const missingSameLeague = data.meta.runtime_counts.missing_same_league;

    let overroundSum = 0;
    let overroundCount = 0;
    let divergenceSum = 0;
    let divergenceCount = 0;
    let topEv: number | null = null;

    for (const it of data.items) {
      if (it.market_probs?.overround != null) {
        overroundSum += it.market_probs.overround;
        overroundCount += 1;
      }

      if (it.status === "ok" && it.market_probs?.novig && (it.model as any)?.probs_model) {
        const mp = it.market_probs.novig;
        const mpModel = (it.model as any).probs_model;

        const d =
          (Math.abs(mp.H - mpModel.H) + Math.abs(mp.D - mpModel.D) + Math.abs(mp.A - mpModel.A)) / 3;

        divergenceSum += d;
        divergenceCount += 1;

        const ev = (it.model as any)?.best_ev;
        if (typeof ev === "number") {
          if (topEv == null || ev > topEv) topEv = ev;
        }
      }
    }

    return {
      coverageOkPct: total > 0 ? ok / total : 0,
      coverageExactPct: total > 0 ? okExact / total : 0,
      coverageFallbackPct: total > 0 ? okFallback / total : 0,
      missingTeamPct: total > 0 ? missingTeam / total : 0,
      missingSameLeaguePct: total > 0 ? missingSameLeague / total : 0,
      modelErrorPct: total > 0 ? modelError / total : 0,
      avgOverround: overroundCount > 0 ? overroundSum / overroundCount : null,
      avgDivergence: divergenceCount > 0 ? divergenceSum / divergenceCount : null,
      topEv,
    };
  }, [data]);

  const pipelineSummary = useMemo(() => {
    if (!runAllOut) return null;
    return readUnifiedSummary(runAllOut);
  }, [runAllOut]);

  return (
    <>
      <div className="section-title">Odds Intel</div>

      <Card title="Fluxo oficial — Atualização do produto (produção)">
        <div className="note">
          A ação manual de <span className="mono">Atualizar ligas autorizadas</span> foi movida para
          <span className="mono"> Ops → Overview</span> como operação provisória / legado temporário.
        </div>

        <div className="note" style={{ marginTop: 10 }}>
          Nesta tela ficam apenas visão de odds, troubleshooting e análise do output operacional.
        </div>
      </Card>

      <Card title="Ferramentas de suporte / debug">
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div className="note">
            Os fluxos abaixo não são o caminho oficial de produção. Use apenas para troubleshooting, comparação ou execução manual pontual.
          </div>

          <button className="btn" onClick={() => setShowLegacyDebug((v) => !v)}>
            {showLegacyDebug ? "Ocultar debug legado" : "Mostrar debug legado"}
          </button>
        </div>
      </Card>

      {showLegacyDebug ? (
        <Card title="Debug manual — Liga única (refresh + resolve + rebuild)">
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="note">
            regions&nbsp;
            <input
              className="input"
              style={{ width: 90, marginLeft: 6 }}
              value={regions}
              onChange={(e) => setRegions(e.target.value)}
            />
          </label>

          <label className="note" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={opsUseAllowlist}
              onChange={(e) => setOpsUseAllowlist(e.target.checked)}
            />
            usar allowlist aprovada
          </label>

          {!opsUseAllowlist && (
            <>
              <label className="note">
                assume_league_id&nbsp;
                <input
                  className="input"
                  style={{ width: 90, marginLeft: 6 }}
                  value={assumeLeagueId}
                  onChange={(e) => setAssumeLeagueId(Number(e.target.value || 0))}
                />
              </label>

              <label className="note">
                assume_season&nbsp;
                <input
                  className="input"
                  style={{ width: 90, marginLeft: 6 }}
                  value={assumeSeason}
                  onChange={(e) => setAssumeSeason(Number(e.target.value || 0))}
                />
              </label>

              <label className="note">
                tol_hours&nbsp;
                <input
                  className="input"
                  style={{ width: 80, marginLeft: 6 }}
                  value={tolHours}
                  onChange={(e) => setTolHours(Number(e.target.value || 0))}
                />
              </label>
            </>
          )}

          <label className="note">
            limit&nbsp;
            <input
              className="input"
              style={{ width: 90, marginLeft: 6 }}
              value={opsLimit}
              onChange={(e) => setOpsLimit(Number(e.target.value || 0))}
            />
          </label>

          <button className="btn" onClick={() => void runOps()} disabled={opsLoading}>
            {opsLoading ? "Rodando debug manual…" : "Executar debug manual"}
          </button>
        </div>

        {opsErr ? (
          <div className="note" style={{ marginTop: 10 }}>
            Error: <b>{opsErr}</b>
          </div>
        ) : null}

        {opsOut ? (
          <div style={{ marginTop: 10 }}>
            <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(opsOut, null, 2)}
            </pre>

            {opsOut?.snapshots ? (
              <div className="note" style={{ marginTop: 8 }}>
                snapshots: <span className="mono">rebuilt={opsOut.snapshots?.counters?.matchup_snapshots_rebuilt ?? 0}</span>
                {" • "}
                <span className="mono">candidates={opsOut.snapshots?.counters?.matchup_snapshots_candidates ?? 0}</span>
                {" • "}
                <span className="mono">error={opsOut.snapshots?.counters?.matchup_snapshots_error ?? 0}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="note" style={{ marginTop: 10 }}>
            Uso de debug/manual: este botão executa <span className="mono">refresh</span> (provider → odds_events / snapshots),
            depois <span className="mono">resolve</span> (match com fixtures) e por fim <span className="mono">rebuild incremental</span> dos snapshots do produto para os eventos da janela de uma única liga.
            Não é o fluxo oficial de produção.
          </div>
        )}
      </Card>
    ) : null}

      {showLegacyDebug ? (
        <Card title="Debug legado — Pipeline unificado alternativo">
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="note" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={runAllOnlyThisSport}
              onChange={(e) => setRunAllOnlyThisSport(e.target.checked)}
            />
            rodar apenas <span className="mono">{sportKey}</span>
          </label>

          <button className="btn" onClick={() => void runUnifiedPipeline()} disabled={pipelineLoading}>
            {pipelineLoading ? "Rodando pipeline alternativo…" : "Executar pipeline alternativo"}
          </button>
        </div>

        {runAllErr ? (
          <div className="note" style={{ marginTop: 10 }}>
            Error: <b>{runAllErr}</b>
          </div>
        ) : null}

        {pipelineOut ? (
          <pre className="mono" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(pipelineOut, null, 2)}
          </pre>
          ) : (
          <div className="note" style={{ marginTop: 10 }}>
            Fluxo alternativo de suporte: executa <span className="mono">/admin/ops/pipeline/run_all</span>.
            Manter apenas para comparação/debug até consolidarmos um único job oficial no backend.
          </div>
        )}
        </Card>
      ) : null}

      <Card title="Ops — Correção manual de nomes de times">
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" onClick={() => void refreshTeamPending()} disabled={teamPendingLoading}>
            {teamPendingLoading ? "Carregando fila…" : "Atualizar fila de pendências"}
          </button>

          <div className="note">
            pendentes: <span className="mono">{teamPending.length}</span>
          </div>
        </div>

        {teamPendingErr ? (
          <div className="note" style={{ marginTop: 10 }}>
            Error: <b>{teamPendingErr}</b>
          </div>
        ) : null}

        {teamSearchErr ? (
          <div className="note" style={{ marginTop: 10 }}>
            Search error: <b>{teamSearchErr}</b>
          </div>
        ) : null}

        {teamPending.length === 0 ? (
          <div className="note" style={{ marginTop: 10 }}>
            Nenhuma pendência de resolução manual no momento.
          </div>
        ) : (
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>sport_key</th>
                  <th>raw_name</th>
                  <th>normalized_name</th>
                  <th>buscar time</th>
                  <th>candidatos</th>
                  <th>ações</th>
                </tr>
              </thead>
              <tbody>
                {teamPending.map((it) => {
                  const key = makePendingKey(it);
                  const results = teamSearchResults[key] || [];
                  const loadingThis = teamApproveLoadingKey === key;

                  return (
                    <tr key={key}>
                      <td className="mono">{it.sport_key || "—"}</td>
                      <td>{it.raw_name || "—"}</td>
                      <td className="mono">{it.normalized_name || "—"}</td>

                      <td>
                        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                          <input
                            className="input"
                            style={{ width: 220 }}
                            value={teamSearchText[key] ?? it.raw_name ?? ""}
                            onChange={(e) =>
                              setTeamSearchText((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                          <button className="btn" onClick={() => void searchTeams(it)} disabled={teamSearchLoading || loadingThis}>
                            Buscar
                          </button>
                        </div>
                      </td>

                      <td>
                        {results.length === 0 ? (
                          <div className="note">—</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {results.map((r) => (
                              <div
                                key={`${key}__${r.team_id}`}
                                className="note"
                                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                              >
                                <span className="mono">{r.team_id}</span>
                                <span>{r.name}</span>
                                <span className="note">{r.country_name || "—"}</span>
                                <button className="btn" onClick={() => void approveTeamAlias(it, r.team_id)} disabled={loadingThis}>
                                  Aprovar
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      <td>
                        <button className="btn" onClick={() => void dismissTeamPending(it)} disabled={loadingThis}>
                          Ignorar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="note" style={{ marginTop: 10 }}>
          Fluxo V1: buscar o time correto, aprovar alias e rodar novamente o pipeline para reaproveitar a correção.
        </div>
      </Card>

      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <label className="note">
          sport_key&nbsp;
          <input
            className="input"
            style={{ width: 170, marginLeft: 6 }}
            value={sportKey}
            onChange={(e) => setSportKey(e.target.value)}
          />
        </label>

        <label className="note">
          hours_ahead&nbsp;
          <input
            className="input"
            style={{ width: 90, marginLeft: 6 }}
            value={hoursAhead}
            onChange={(e) => setHoursAhead(Number(e.target.value || 0))}
          />
        </label>

        <label className="note">
          limit&nbsp;
          <select
            className="select"
            style={{ width: 90, marginLeft: 6 }}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="note">
          min_confidence&nbsp;
          <select
            className="select"
            style={{ width: 120, marginLeft: 6 }}
            value={minConfidence}
            onChange={(e) => setMinConfidence(e.target.value as any)}
          >
            <option value="NONE">NONE</option>
            <option value="FUZZY">FUZZY</option>
            <option value="ILIKE">ILIKE</option>
            <option value="EXACT">EXACT</option>
          </select>
        </label>

        <label className="note">
          sort&nbsp;
          <select
            className="select"
            style={{ width: 140, marginLeft: 6 }}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="best_ev">best_ev</option>
            <option value="ev_h">ev_h</option>
            <option value="ev_d">ev_d</option>
            <option value="ev_a">ev_a</option>
          </select>
        </label>

        <label className="note">
          order&nbsp;
          <select
            className="select"
            style={{ width: 90, marginLeft: 6 }}
            value={order}
            onChange={(e) => setOrder(e.target.value as any)}
          >
            <option value="desc">desc</option>
            <option value="asc">asc</option>
          </select>
        </label>

        <button className="btn" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <Card title="Meta">
        {err ? (
          <div className="note">
            Error: <b>{err}</b>
          </div>
        ) : !data ? (
          <div className="note">No data yet.</div>
        ) : (
          <div className="note">
            sport_key: <b>{data.meta.sport_key}</b> • window: <b>{data.meta.hours_ahead}h</b> • artifact:{" "}
            <span className="mono">{data.meta.artifact_filename}</span>
            <br />
            total: <b>{data.meta.counts.total}</b> • ok_model: <b>{data.meta.counts.ok_model}</b> • missing_team:{" "}
            <b>{data.meta.counts.missing_team}</b> • model_error: <b>{data.meta.counts.model_error}</b>
            <br />
            ok_exact: <b>{data.meta.runtime_counts.ok_exact}</b> • ok_fallback: <b>{data.meta.runtime_counts.ok_fallback}</b> •
            missing_same_league: <b>{data.meta.runtime_counts.missing_same_league}</b> • missing_exact:{" "}
            <b>{data.meta.runtime_counts.missing_exact}</b> • other_model_error:{" "}
            <b>{data.meta.runtime_counts.other_model_error}</b>
          </div>
        )}
      </Card>

      {kpis && (
        <div className="row" style={{ gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <Kpi title="Coverage OK" value={`${(kpis.coverageOkPct * 100).toFixed(1)}%`} meta="jogos com modelo aplicado" />
          <Kpi title="OK Exact" value={`${(kpis.coverageExactPct * 100).toFixed(1)}%`} meta="sem fallback" />
          <Kpi title="OK Fallback" value={`${(kpis.coverageFallbackPct * 100).toFixed(1)}%`} meta="mesma liga, outra season" />
          <Kpi title="Missing Team" value={`${(kpis.missingTeamPct * 100).toFixed(1)}%`} meta="falha de mapeamento" />
          <Kpi title="Missing Same League" value={`${(kpis.missingSameLeaguePct * 100).toFixed(1)}%`} meta="sem stats úteis na mesma liga" />
          <Kpi title="Model Error" value={`${(kpis.modelErrorPct * 100).toFixed(1)}%`} meta="erros restantes do runtime" />
          <Kpi title="Overround médio" value={kpis.avgOverround != null ? kpis.avgOverround.toFixed(3) : "—"} meta="margem do mercado" />
          <Kpi title="Divergência vs Market" value={kpis.avgDivergence != null ? (kpis.avgDivergence * 100).toFixed(2) + "%" : "—"} meta="|modelo − mercado|" />
          <Kpi title="Top EV" value={kpis.topEv != null ? kpis.topEv.toFixed(3) : "—"} meta="melhor oportunidade" />
        </div>
      )}

      <div className="section-title">Ranking — Coverage OK</div>
      <Card title="Opportunities">
        {!data ? (
          <div className="note">—</div>
        ) : buckets.ok.length === 0 ? (
          <div className="note">No OK items for current filters.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Kickoff</th>
                <th>Match</th>
                <th className="mono">Coverage</th>
                <th className="mono">Book</th>
                <th className="mono">Odds (H/D/A)</th>
                <th className="mono">Market p (novig)</th>
                <th className="mono">Model p</th>
                <th className="mono">Best</th>
                <th className="mono">EV</th>
                <th className="mono">Fresh(s)</th>
              </tr>
            </thead>
            <tbody>
              {buckets.ok.map((it) => {
                const odds = it.latest_snapshot?.odds_1x2;
                const mp = it.market_probs?.novig;
                const model = (it.model as any)?.probs_model;
                const bestSide = (it.model as any)?.best_side;
                const bestEv = (it.model as any)?.best_ev;

                return (
                  <tr key={it.event_id}>
                    <td className="mono">{isoShort(it.kickoff_utc)}</td>
                    <td>
                      {it.home_name} <span className="note">vs</span> {it.away_name}
                      <div className="note">
                        confidence: <span className="mono">{it.resolved.match_confidence}</span> • event_id:{" "}
                        <span className="mono">{it.event_id.slice(0, 8)}…</span>
                        {(it.model as any)?.runtime?.stats_runtime ? (
                          <>
                            {" "}• stats_mode: <span className="mono">{(it.model as any).runtime.stats_runtime.match_stats_mode}</span>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td className="mono">{(it.model as any)?.model_status ?? "—"}</td>
                    <td className="mono">{odds ? `${fmt(odds.H, 2)} / ${fmt(odds.D, 2)} / ${fmt(odds.A, 2)}` : "—"}</td>
                    <td className="mono">{mp ? `${pct(mp.H)} / ${pct(mp.D)} / ${pct(mp.A)}` : "—"}</td>
                    <td className="mono">{model ? `${pct(model.H)} / ${pct(model.D)} / ${pct(model.A)}` : "—"}</td>
                    <td className="mono">{bestSide ?? "—"}</td>
                    <td className="mono">{bestEv != null ? fmt(bestEv, 3) : "—"}</td>
                    <td className="mono">{it.latest_snapshot?.freshness_seconds ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <div className="section-title">Pendências — Identificação de Times</div>
      <Card title="Missing team_id (needs alias/resolve)">
        {!data ? (
          <div className="note">—</div>
        ) : buckets.missingTeam.length === 0 ? (
          <div className="note">No missing team_id for current filters.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Kickoff</th>
                <th>Match</th>
                <th className="mono">Home resolved</th>
                <th className="mono">Away resolved</th>
                <th className="mono">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {buckets.missingTeam.map((it) => (
                <tr key={it.event_id}>
                  <td className="mono">{isoShort(it.kickoff_utc)}</td>
                  <td>
                    {it.home_name} <span className="note">vs</span> {it.away_name}
                    <div className="note">
                      reason: <span className="mono">{it.reason}</span>
                    </div>
                  </td>
                  <td className="mono">{it.resolved.home_team_id ?? "null"}</td>
                  <td className="mono">{it.resolved.away_team_id ?? "null"}</td>
                  <td className="mono">{it.resolved.match_confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="section-title">Pendências — Dados do Modelo</div>
      <Card title="Model coverage gaps / runtime errors">
        {!data ? (
          <div className="note">—</div>
        ) : buckets.modelError.length === 0 ? (
          <div className="note">No model errors for current filters.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Kickoff</th>
                <th>Match</th>
                <th className="mono">Reason</th>
                <th className="mono">Model status</th>
                <th className="mono">Model error</th>
              </tr>
            </thead>
            <tbody>
              {buckets.modelError.map((it) => (
                <tr key={it.event_id}>
                  <td className="mono">{isoShort(it.kickoff_utc)}</td>
                  <td>
                    {it.home_name} <span className="note">vs</span> {it.away_name}
                    <div className="note">
                      confidence: <span className="mono">{it.resolved.match_confidence}</span>
                    </div>
                  </td>
                  <td className="mono">{it.reason ?? "—"}</td>
                  <td className="mono">{(it.model as any)?.model_status ?? "—"}</td>
                  <td className="mono">{it.model && (it.model as any).error ? String((it.model as any).error) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="note" style={{ marginTop: 10 }}>
        Source: <span className="mono">/admin/odds/queue/intel</span>
      </div>
    </>
  );
}
