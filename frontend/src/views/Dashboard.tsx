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

  // defaults do leaderboard (ajuste depois se quiser)
  const leagueId = 39;
  const season = 2024;
  const limit = 20;

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
          sort: "brier",
          order: "asc",
        })) as ArtifactMetricRow[];

        setLb(Array.isArray(rows) ? rows : []);
      } catch (e: any) {
        setLb([]);
        setLbErr(String(e?.message || e));
      } finally {
        setLbLoading(false);
      }
    })();
  }, [leagueId, season, limit]);

  const leaderboardMeta = useMemo(() => {
    if (lbLoading) return <Pill>Loading…</Pill>;
    if (lbErr) return <Pill>Error</Pill>;
    return <Pill>{leagueId} • {season} • top {limit}</Pill>;
  }, [lbLoading, lbErr, leagueId, season, limit]);

  return (
    <>
      {/* KPIs */}
      <div className="grid cards">
        <Kpi
          title="Teams"
          value={ov ? String(ov.teams) : "—"}
          meta={<Pill>Total clubs in DB</Pill>}
        />

        <Kpi
          title="Fixtures"
          value={ov ? String(ov.fixtures_total) : "—"}
          meta={
            ov ? (
              <Pill>
                Finished: {ov.fixtures_finished} • Cancelled: {ov.fixtures_cancelled}
              </Pill>
            ) : null
          }
        />

        <Kpi
          title="Last match in DB"
          value={ov?.kickoff_max_utc ? fmtIsoToShort(ov.kickoff_max_utc) : "—"}
          meta={ov?.kickoff_min_utc ? <Pill>From {fmtIsoToShort(ov.kickoff_min_utc)}</Pill> : null}
        />

        <Kpi
          title="Leagues covered"
          value={ov ? String(ov.leagues) : "—"}
          meta={<Pill>Distinct league_id</Pill>}
        />
      </div>

      {/* Artifact leaderboard */}
      <div className="section-title">Artifact leaderboard</div>
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
