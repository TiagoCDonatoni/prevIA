import { useEffect, useMemo, useState } from "react";
import { getMetricsOverview, getArtifactMetrics } from "../api/client";
import { Card } from "../ui/Card";
import { Kpi } from "../ui/Kpi";
import { Pill } from "../ui/Pill";
import { fmtNum, fmtIsoToShort } from "../ui/components";

type Overview = {
  teams: number;
  fixtures_total: number;
  fixtures_finished: number;
  fixtures_cancelled: number;
  leagues: number;
  kickoff_min_utc: string | null;
  kickoff_max_utc: string | null;
};

type ArtifactMetricRow = {
  artifact_id: string;
  league_id: number | null;
  season: number | null;
  n_games: number;
  brier: number;
  logloss: number;
  top1_acc: number;
  eval_from_utc: string | null;
  eval_to_utc: string | null;
  notes: string | null;
  created_at_utc: string | null;
};

export default function Dashboard() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [lb, setLb] = useState<ArtifactMetricRow[]>([]);
  const [lbErr, setLbErr] = useState<string | null>(null);
  const [lbLoading, setLbLoading] = useState<boolean>(false);

  // Micro-controle do leaderboard
  const [leagueId, setLeagueId] = useState<number>(39);
  const [season, setSeason] = useState<number>(2024);
  const [limit, setLimit] = useState<number>(20);
  const [sort, setSort] = useState<"brier" | "logloss" | "top1_acc" | "created_at_utc">("brier");
  const [order, setOrder] = useState<"asc" | "desc">("asc");


  useEffect(() => {
    void (async () => {
      try {
        const data = await getMetricsOverview();
        setOv(data);
        setErr(null);
      } catch (e: any) {
        setErr(String(e?.message || e));
        setOv(null);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setLbLoading(true);
      setLbErr(null);
      try {
        const rows = (await getArtifactMetrics({
          league_id: leagueId,
          season,
          limit,
          sort,
          order,
        })) as ArtifactMetricRow[];

        setLb(Array.isArray(rows) ? rows : []);
      } catch (e: any) {
        setLb([]);
        setLbErr(String(e?.message || e));
      } finally {
        setLbLoading(false);
      }
    })();
  }, [leagueId, season, limit, sort, order]);

  const leaderboardMeta = useMemo(() => {
    if (lbLoading) return <Pill>Loading…</Pill>;
    if (lbErr) return <Pill>Error</Pill>;
    return <Pill>{leagueId} • {season} • top {limit} • {sort} {order}</Pill>;
  }, [lbLoading, lbErr, leagueId, season, limit]);

  return (
    <>
      {/* KPIs */}
      <div className="grid cards">
        <Kpi
          title="Teams"
          value={ov ? String(ov.teams) : "—"}
        />

        <Kpi
          title="Fixtures"
          value={ov ? String(ov.fixtures_total) : "—"}
        />

        <Kpi
          title="Last match in DB"
          value={ov?.kickoff_max_utc ? fmtIsoToShort(ov.kickoff_max_utc) : "—"}
        />

        <Kpi
          title="Leagues covered"
          value={ov ? String(ov.leagues) : "—"}
        />
      </div>

      {/* Artifact leaderboard */}
      <div className="section-title">Artifact leaderboard</div>
              <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <div className="note" style={{ marginRight: 6 }}>Filters:</div>

          <label className="note">
            League&nbsp;
            <input
              className="input"
              style={{ width: 90, marginLeft: 6 }}
              value={leagueId}
              onChange={(e) => setLeagueId(Number(e.target.value || 0))}
            />
          </label>

          <label className="note">
            Season&nbsp;
            <input
              className="input"
              style={{ width: 90, marginLeft: 6 }}
              value={season}
              onChange={(e) => setSeason(Number(e.target.value || 0))}
            />
          </label>

          <label className="note">
            Limit&nbsp;
            <select className="select" style={{ width: 90, marginLeft: 6 }} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <label className="note">
            Sort&nbsp;
            <select className="select" style={{ width: 140, marginLeft: 6 }} value={sort} onChange={(e) => setSort(e.target.value as any)}>
              <option value="brier">brier</option>
              <option value="logloss">logloss</option>
              <option value="top1_acc">top1_acc</option>
              <option value="created_at_utc">created_at_utc</option>
            </select>
          </label>

          <label className="note">
            Order&nbsp;
            <select className="select" style={{ width: 90, marginLeft: 6 }} value={order} onChange={(e) => setOrder(e.target.value as any)}>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </label>

          <div className="note">Auto-refresh on change.</div>
        </div>

      <Card title="Latest model quality snapshots" right={leaderboardMeta}>      
        {lbErr ? (
          <div className="note">
            Error loading leaderboard: <b>{lbErr}</b>
          </div>
        ) : lbLoading ? (
          <div className="note">Loading…</div>
        ) : lb.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Artifact</th>
                <th className="mono">n</th>
                <th className="mono">Brier</th>
                <th className="mono">LogLoss</th>
                <th className="mono">Top1</th>
                <th className="mono">Created</th>
              </tr>
            </thead>
            <tbody>
              {lb.map((r) => (
                <tr key={`${r.artifact_id}__${r.created_at_utc ?? ""}`}>
                  <td className="mono" title={r.artifact_id}>
                    {r.artifact_id}
                  </td>
                  <td className="mono">{r.n_games}</td>
                  <td className="mono">{fmtNum(r.brier, { maximumFractionDigits: 4 })}</td>
                  <td className="mono">{fmtNum(r.logloss, { maximumFractionDigits: 4 })}</td>
                  <td className="mono">{fmtNum(r.top1_acc, { maximumFractionDigits: 4 })}</td>
                  <td className="mono">{r.created_at_utc ? fmtIsoToShort(r.created_at_utc) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="note">
            No snapshots found yet. Run the manual evaluator and then refresh.
          </div>
        )}

        <div className="note" style={{ marginTop: 10 }}>
          Source: <span className="mono">/admin/metrics/artifacts</span> (latest per artifact).
        </div>
      </Card>

      {/* Operational */}
      <div className="section-title">Operational</div>
      <div className="split">
        <Card title="Backend">
          <div className="note">
            {err ? (
              <>
                Error: <b>{err}</b>
              </>
            ) : ov ? (
              <>
                Metrics endpoint: <b>/admin/metrics/overview</b>
                <br />
                Teams: <b>{ov.teams}</b> • Leagues: <b>{ov.leagues}</b>
              </>
            ) : (
              "Loading…"
            )}
          </div>
        </Card>

        <Card title="Next: Snapshots (team features)">
          <div className="note">
            Next step: persist <span className="mono">team_feature_snapshots</span> so matchup inference becomes O(1)
            reads + pure model eval (ready for Odds integration).
          </div>
        </Card>
      </div>
    </>
  );
}
