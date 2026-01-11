import React, { useEffect, useState } from "react";
import { getKpis } from "../api/client";
import type { KpiSnapshot } from "../api/contracts";
import { Card, Kpi, Pill, fmtNum } from "../ui/components";

export default function Dashboard() {
  const [kpis, setKpis] = useState<KpiSnapshot | null>(null);

  useEffect(() => {
    void (async () => {
      const data = await getKpis();
      setKpis(data);
    })();
  }, []);

  return (
    <>
      <div className="grid cards">
        <Kpi
          title="Teams (total)"
          value={kpis ? String(kpis.world.teams_total) : "—"}
          meta={kpis ? <Pill>Competitions: {kpis.world.competitions_total}</Pill> : null}
        />
        <Kpi
          title="Fixtures (total)"
          value={kpis ? String(kpis.world.fixtures_total) : "—"}
          meta={kpis ? <Pill>With features: {kpis.world.fixtures_with_features}</Pill> : null}
        />
        <Kpi
          title="Brier (global)"
          value={kpis ? fmtNum(kpis.quality.brier, 3) : "—"}
          meta={kpis ? <Pill>LogLoss: {fmtNum(kpis.quality.logloss, 3)}</Pill> : null}
        />
        <Kpi
          title="Top-1 Acc"
          value={kpis ? fmtNum(kpis.quality.top1_acc, 3) : "—"}
          meta={kpis ? <Pill>ECE: {kpis.quality.ece ?? "—"}</Pill> : null}
        />
      </div>

      <div className="section-title">Operational / Freshness</div>
      <div className="split">
        <Card title="DB freshness">
          <div className="note">
            {kpis ? (
              <>
                Last update (UTC): <b>{kpis.freshness.last_db_update_utc}</b>
                <br />
                Lag: <b>{fmtNum(kpis.freshness.lag_hours, 1)}h</b>
              </>
            ) : (
              "Loading…"
            )}
          </div>
        </Card>
        <Card title="Pipeline health">
          <div className="note">
            {kpis ? (
              <>
                Failed jobs (7d): <b>{kpis.freshness.failed_jobs_7d}</b>
                <br />
                Allowlisted leagues: <b>{kpis.world.leagues_allowlisted}</b>
              </>
            ) : (
              "Loading…"
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
