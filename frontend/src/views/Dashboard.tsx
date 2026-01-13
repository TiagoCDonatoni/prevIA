import { useEffect, useState } from "react";
import { getMetricsOverview } from "../api/client";
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

export default function Dashboard() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <>
      <div className="grid cards">
        <Kpi
          title="Teams (total)"
          value={ov ? String(ov.teams) : "—"}
          meta={ov ? <Pill>Leagues: {ov.leagues}</Pill> : null}
        />

        <Kpi
          title="Fixtures (total)"
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
          title="Data window"
          value={ov?.kickoff_max_utc ? fmtIsoToShort(ov.kickoff_max_utc) : "—"}
          meta={
            ov?.kickoff_min_utc ? (
              <Pill>From: {fmtIsoToShort(ov.kickoff_min_utc)}</Pill>
            ) : null
          }
        />

        <Kpi
          title="Coverage"
          value={ov ? fmtNum(ov.fixtures_finished / Math.max(1, ov.fixtures_total), 3) : "—"}
          meta={<Pill>Finished / Total</Pill>}
        />
      </div>

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

        <Card title="Next: Quality metrics">
          <div className="note">
            Next step is to expose model quality (Accuracy/Brier/LogLoss) by artifact and season,
            then render a leaderboard in this Dashboard.
          </div>
        </Card>
      </div>
    </>
  );
}
