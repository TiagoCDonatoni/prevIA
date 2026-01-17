import { useEffect, useMemo, useState } from "react";
import { getOddsQueueIntel } from "../api/client";
import type { OddsIntelItem, OddsIntelResponse } from "../api/contracts";
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
  // mantém simples, sem libs
  // exemplo: 2026-01-17T15:00:00Z -> 2026-01-17 15:00Z
  return iso.replace("T", " ").replace(":00Z", "Z");
}

export default function OddsIntel() {
  // defaults alinhados com seu teste atual
  const [sportKey, setSportKey] = useState("soccer_epl");
  const [hoursAhead, setHoursAhead] = useState(72);
  const [limit, setLimit] = useState(50);
  const [minConfidence, setMinConfidence] = useState<"EXACT" | "ILIKE" | "FUZZY" | "NONE">("NONE");

  const [sort, setSort] = useState("best_ev"); // best_ev | ev_h | ev_d | ev_a
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [data, setData] = useState<OddsIntelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  useEffect(() => {
    void refresh();
    // auto refresh on filter changes, igual Dashboard
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportKey, hoursAhead, limit, minConfidence, sort, order]);

  const buckets = useMemo(() => {
    const items = data?.items ?? [];
    const ok: OddsIntelItem[] = [];
    const missingTeam: OddsIntelItem[] = [];
    const modelError: OddsIntelItem[] = [];

    for (const it of items) {
      if (it.status === "ok") ok.push(it);
      else if (it.reason === "missing_team_id") missingTeam.push(it);
      else modelError.push(it);
    }
    return { ok, missingTeam, modelError };
  }, [data]);

  const kpis = useMemo(() => {
    if (!data || data.items.length === 0) return null;

    const total = data.items.length;
    const ok = data.meta.counts.ok_model;
    const missingTeam = data.meta.counts.missing_team;
    const modelError = data.meta.counts.model_error;

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
          (Math.abs(mp.H - mpModel.H) +
            Math.abs(mp.D - mpModel.D) +
            Math.abs(mp.A - mpModel.A)) / 3;

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
      missingTeamPct: total > 0 ? missingTeam / total : 0,
      modelErrorPct: total > 0 ? modelError / total : 0,
      avgOverround: overroundCount > 0 ? overroundSum / overroundCount : null,
      avgDivergence: divergenceCount > 0 ? divergenceSum / divergenceCount : null,
      topEv,
    };
  }, [data]);

  return (
    <>
      <div className="section-title">Odds Intel</div>

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
          </div>
        )}
      </Card>

      {kpis && (
        <div className="row" style={{ gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <Kpi
            title="Coverage OK"
            value={`${(kpis.coverageOkPct * 100).toFixed(1)}%`}
            subtitle="jogos com modelo aplicado"
          />
          <Kpi
            title="Missing Team"
            value={`${(kpis.missingTeamPct * 100).toFixed(1)}%`}
            subtitle="falha de mapeamento"
          />
          <Kpi
            title="Model Data Missing"
            value={`${(kpis.modelErrorPct * 100).toFixed(1)}%`}
            subtitle="sem stats no banco"
          />
          <Kpi
            title="Overround médio"
            value={kpis.avgOverround != null ? kpis.avgOverround.toFixed(3) : "—"}
            subtitle="margem do mercado"
          />
          <Kpi
            title="Divergência vs Market"
            value={kpis.avgDivergence != null ? (kpis.avgDivergence * 100).toFixed(2) + "%" : "—"}
            subtitle="|modelo − mercado|"
          />
          <Kpi
            title="Top EV"
            value={kpis.topEv != null ? kpis.topEv.toFixed(3) : "—"}
            subtitle="melhor oportunidade"
          />
        </div>
      )}

      <div className="section-title">Ranking (OK)</div>
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
                      </div>
                    </td>
                    <td className="mono">{it.latest_snapshot?.bookmaker ?? "—"}</td>
                    <td className="mono">
                      {odds ? `${fmt(odds.H, 2)} / ${fmt(odds.D, 2)} / ${fmt(odds.A, 2)}` : "—"}
                    </td>
                    <td className="mono">{mp ? `${pct(mp.H)} / ${pct(mp.D)} / ${pct(mp.A)}` : "—"}</td>
                    <td className="mono">
                      {model ? `${pct(model.H)} / ${pct(model.D)} / ${pct(model.A)}` : "—"}
                    </td>
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
      <Card title="Model errors / missing snapshots">
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
