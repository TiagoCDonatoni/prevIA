import React, { useEffect, useState } from "react";
import type { RunRow } from "../api/contracts";
import { listRuns } from "../api/client";
import { Card, Pill, fmtNum } from "../ui/components";

export default function Runs() {
  const [rows, setRows] = useState<RunRow[]>([]);

  useEffect(() => {
    void (async () => setRows(await listRuns()))();
  }, []);

  return (
    <Card title="Model runs / metrics (snapshot)" right={<Pill>v1</Pill>}>
      <div className="note">
        Runs should be persisted so the Admin does not recompute backtests on every page load.
      </div>

      <hr className="sep" />

      <table className="table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Created</th>
            <th>Artifact</th>
            <th>Scope</th>
            <th>Brier</th>
            <th>LogLoss</th>
            <th>Acc</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.run_id}>
              <td className="mono">{r.run_id}</td>
              <td className="mono">{r.created_at_utc}</td>
              <td className="mono">{r.artifact_id}</td>
              <td>{r.scope}</td>
              <td className="mono">{fmtNum(r.brier, 3)}</td>
              <td className="mono">{fmtNum(r.logloss, 3)}</td>
              <td className="mono">{fmtNum(r.top1_acc, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="note" style={{ marginTop: 10 }}>
        Suggested backend endpoints:
        <div className="code">
          GET /admin/model-runs
          <br />
          GET /admin/metrics?competition_id=&season=
        </div>
      </div>
    </Card>
  );
}
