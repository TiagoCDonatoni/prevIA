import { useEffect, useMemo, useState } from "react";
import { Card } from "../ui/Card";
import { listTeams, getTeamSummary } from "../api/client";
import type { TeamLite, TeamSummary } from "../api/contracts";
import { fmtIsoToShort } from "../ui/components";

export default function TeamExplorer() {
  const [q, setQ] = useState("");
  const [allTeams, setAllTeams] = useState<TeamLite[]>([]);

  const [selectedId, setSelectedId] = useState<number | "">("");
  const [selectedTeam, setSelectedTeam] = useState<TeamLite | null>(null);

  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load teams once
  useEffect(() => {
    void (async () => {
      try {
        const teams = await listTeams(1000, 0); // ajuste se quiser (300/500/1000)
        setAllTeams(teams);
      } catch (e: any) {
        setErr(String(e?.message || e));
      }
    })();
  }, []);

  // Filter locally
  const options = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return allTeams;
    return allTeams.filter((t) => t.name.toLowerCase().includes(qq));
  }, [q, allTeams]);

  // Resolve selectedTeam from selectedId
  useEffect(() => {
    const t = options.find((x) => x.team_id === selectedId) || null;
    setSelectedTeam(t);
  }, [selectedId, options]);

  // Load summary when selectedTeam changes
  useEffect(() => {
    if (!selectedTeam) return;

    setLoading(true);
    setErr(null);

    void (async () => {
      try {
        const s = await getTeamSummary(selectedTeam.team_id, 20);
        setSummary(s);
      } catch (e: any) {
        setErr(String(e?.message || e));
        setSummary(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedTeam]);

  return (
    <div className="page">
      <div className="page-title">Team Explorer</div>

      <Card title="Select team">
        <div className="row">
          <input
            className="input"
            placeholder="Filter (optional)…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSelectedId("");
              setSelectedTeam(null);
              setSummary(null);
              if (err) setErr(null);
            }}
          />

          <select
            className="select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : "")}
            disabled={allTeams.length === 0}
          >
            <option value="">{allTeams.length === 0 ? "Loading teams…" : "Select…"}</option>

            {options.map((t) => (
              <option key={t.team_id} value={t.team_id}>
                {t.name}{t.country ? ` (${t.country})` : ""}
              </option>
            ))}
          </select>
        </div>

        {allTeams.length > 0 && q.trim() && options.length === 0 ? (
          <div className="note">No teams match “{q.trim()}”.</div>
        ) : null}

        {loading && <div className="note">Loading summary…</div>}
        {err && <div className="note">Error: {err}</div>}
      </Card>

      {summary && (
        <>
          <div className="grid-3">
            <Card title="Team">
              <div className="team-head">
                {summary.team.logo_url ? (
                  <img className="team-logo" src={summary.team.logo_url} alt="" />
                ) : null}
                <div>
                  <div className="team-name">{summary.team.name}</div>
                  <div className="note">{summary.team.country ?? "—"}</div>
                </div>
              </div>
              <div className="note">
                Venue: {summary.team.venue.name ?? "—"} / {summary.team.venue.city ?? "—"}
              </div>
            </Card>

            <Card title="Results">
              <div className="kpi-row"><div>W</div><div className="mono">{summary.stats.wins}</div></div>
              <div className="kpi-row"><div>D</div><div className="mono">{summary.stats.draws}</div></div>
              <div className="kpi-row"><div>L</div><div className="mono">{summary.stats.losses}</div></div>
              <div className="kpi-row"><div>Points</div><div className="mono">{summary.stats.points}</div></div>
              <div className="kpi-row"><div>PPG</div><div className="mono">{summary.stats.ppg.toFixed(2)}</div></div>
            </Card>

            <Card title="Goals">
              <div className="kpi-row"><div>GF</div><div className="mono">{summary.stats.goals_for}</div></div>
              <div className="kpi-row"><div>GA</div><div className="mono">{summary.stats.goals_against}</div></div>
              <div className="kpi-row"><div>Avg GF</div><div className="mono">{summary.stats.avg_goals_for.toFixed(2)}</div></div>
              <div className="kpi-row"><div>Avg GA</div><div className="mono">{summary.stats.avg_goals_against.toFixed(2)}</div></div>
            </Card>
          </div>

          <div className="section-title">Last matches</div>
          <Card title={`Last ${summary.filters.last_n} (chronological)`}>
            {summary.last_matches.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Kickoff</th>
                    <th>Match</th>
                    <th>Score</th>
                    <th>Res</th>
                    <th>Season</th>
                    <th>League</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.last_matches.map((m) => (
                    <tr key={m.fixture_id}>
                      <td className="mono">{m.kickoff_utc ? fmtIsoToShort(m.kickoff_utc) : "—"}</td>
                      <td>{m.home_team.name} vs {m.away_team.name}</td>
                      <td className="mono">{m.goals_home ?? "—"} - {m.goals_away ?? "—"}</td>
                      <td className="mono">{m.team_result}</td>
                      <td className="mono">{m.season ?? "—"}</td>
                      <td className="mono">{m.league_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="note">No finished matches found for this team.</div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
