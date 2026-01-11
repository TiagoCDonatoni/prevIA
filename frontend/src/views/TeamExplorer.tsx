import React, { useEffect, useState } from "react";
import type { TeamLite } from "../api/contracts";
import { searchTeams } from "../api/client";
import { Card, Pill } from "../ui/components";

export default function TeamExplorer() {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<TeamLite[]>([]);
  const [team, setTeam] = useState<TeamLite | null>(null);

  useEffect(() => {
    void (async () => setOptions(await searchTeams(q)))();
  }, [q]);

  return (
    <div className="split">
      <Card title="Select team (global)" right={<Pill>Season: auto</Pill>}>
        <label>Search</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team name" />
        <div style={{ marginTop: 8 }}>
          <select
            value={team?.team_id ?? ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              const t = options.find((x) => x.team_id === id) ?? null;
              setTeam(t);
            }}
          >
            <option value="">Select…</option>
            {options.map((t) => (
              <option key={t.team_id} value={t.team_id}>
                {t.name}{t.country ? ` (${t.country})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="note" style={{ marginTop: 10 }}>
          In v1 this is a placeholder. When wired to the backend, this page should show:
          <ul>
            <li>Team season profile (W/D/L, goals, rolling form)</li>
            <li>Model performance restricted to this team (Brier/LogLoss, confidence bins)</li>
            <li>Top “most costly errors” for debugging</li>
          </ul>
        </div>
      </Card>

      <Card title="Team output (placeholder)">
        {team ? (
          <>
            <div className="note">
              Team: <b>{team.name}</b> {team.country ? <>• {team.country}</> : null}
            </div>
            <hr className="sep" />
            <div className="code">
              GET /admin/team/summary?team_id={team.team_id}&season=auto
              <br />
              GET /admin/team/model-performance?team_id={team.team_id}&season=auto
            </div>
          </>
        ) : (
          <div className="note">Select a team to see the intended calls and structure.</div>
        )}
      </Card>
    </div>
  );
}
