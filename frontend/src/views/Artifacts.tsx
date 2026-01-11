import React, { useEffect, useState } from "react";
import type { ArtifactRow } from "../api/contracts";
import { listArtifacts } from "../api/client";
import { Card, Pill, fmtNum } from "../ui/components";

export default function Artifacts() {
  const [rows, setRows] = useState<ArtifactRow[]>([]);

  useEffect(() => {
    void (async () => setRows(await listArtifacts()))();
  }, []);

  return (
    <Card title="Artifacts leaderboard" right={<Pill>sorted by status</Pill>}>
      <div className="note">
        This table is designed to be backed by the database. In v1 it is mocked.
      </div>

      <hr className="sep" />

      <table className="table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Artifact</th>
            <th>Model</th>
            <th>Scope</th>
            <th>Brier</th>
            <th>LogLoss</th>
            <th>Acc</th>
            <th>Trained</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .slice()
            .sort((a, b) => (a.status === b.status ? 0 : a.status === "champion" ? -1 : 1))
            .map((r) => (
              <tr key={r.artifact_id}>
                <td className="mono">{r.status}</td>
                <td className="mono">{r.artifact_id}</td>
                <td className="mono">{r.model_id}</td>
                <td>{r.league_or_competition ?? "—"} • {r.seasons_train}</td>
                <td className="mono">{fmtNum(r.brier, 3)}</td>
                <td className="mono">{fmtNum(r.logloss, 3)}</td>
                <td className="mono">{fmtNum(r.top1_acc, 3)}</td>
                <td className="mono">{r.trained_at_utc}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="note" style={{ marginTop: 10 }}>
        Suggested backend endpoints:
        <div className="code">
          GET /admin/artifacts
          <br />
          GET /admin/artifacts/:artifact_id
        </div>
      </div>
    </Card>
  );
}
