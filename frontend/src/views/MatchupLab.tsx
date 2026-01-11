import React, { useEffect, useMemo, useState } from "react";
import type { FixtureLite, MatchupResponse, TeamLite } from "../api/contracts";
import {
  findUpcomingFixturesBetweenTeams,
  matchupByFixture,
  matchupWhatIf,
  searchTeams,
  listArtifacts,
} from "../api/client";
import { Card, Pill, fmtNum, fmtPct, fmtIsoToShort } from "../ui/components";

function ProbRow(props: { label: string; p: number; odd: number }) {
  return (
    <tr>
      <td>{props.label}</td>
      <td className="mono">{fmtPct(props.p)}</td>
      <td className="mono">{fmtNum(props.odd, 2)}</td>
    </tr>
  );
}

export default function MatchupLab() {
  const [qHome, setQHome] = useState("");
  const [qAway, setQAway] = useState("");
  const [homeOptions, setHomeOptions] = useState<TeamLite[]>([]);
  const [awayOptions, setAwayOptions] = useState<TeamLite[]>([]);
  const [home, setHome] = useState<TeamLite | null>(null);
  const [away, setAway] = useState<TeamLite | null>(null);

  const [fixtures, setFixtures] = useState<FixtureLite[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | "">( "");

  const [advanced, setAdvanced] = useState(false);
  const [venueMode, setVenueMode] = useState<"HOME" | "NEUTRAL">("HOME");
  const [referenceDateUtc, setReferenceDateUtc] = useState<string>("");

  const [artifactId, setArtifactId] = useState<string>("");
  const [artifactOptions, setArtifactOptions] = useState<string[]>([]);

  const [result, setResult] = useState<MatchupResponse | null>(null);
  const canSearchFixtures = useMemo(() => !!home && !!away, [home, away]);

  useEffect(() => {
    void (async () => {
      const arts = await listArtifacts();
      const ids = arts.map((a) => a.artifact_id);
      setArtifactOptions(ids);
      setArtifactId(ids[0] ?? "");
    })();
  }, []);

  useEffect(() => {
    void (async () => setHomeOptions(await searchTeams(qHome)))();
  }, [qHome]);

  useEffect(() => {
    void (async () => setAwayOptions(await searchTeams(qAway)))();
  }, [qAway]);

  async function onFindFixtures() {
    if (!home || !away) return;
    const rows = await findUpcomingFixturesBetweenTeams(home.team_id, away.team_id);
    setFixtures(rows);
    setSelectedFixtureId(rows[0]?.fixture_id ?? "");
  }

  async function onCalculate() {
    if (!home || !away) return;
    setResult(null);

    if (!advanced && selectedFixtureId) {
      const res = await matchupByFixture({ fixture_id: Number(selectedFixtureId), artifact_id: artifactId || undefined });
      setResult(res);
      return;
    }

    const res = await matchupWhatIf({
      home_team_id: home.team_id,
      away_team_id: away.team_id,
      venue_mode: venueMode,
      reference_date_utc: referenceDateUtc || undefined,
      artifact_id: artifactId || undefined,
    });
    setResult(res);
  }

  return (
    <>
      <div className="split">
        <Card
          title="Inputs"
          right={<Pill>Season: auto</Pill>}
        >
          <div className="form-row">
            <div className="field w6">
              <label>Home team (global)</label>
              <input value={qHome} onChange={(e) => setQHome(e.target.value)} placeholder="Search (e.g., Arsenal)" />
              <div style={{ marginTop: 8 }}>
                <select
                  value={home?.team_id ?? ""}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const t = homeOptions.find((x) => x.team_id === id) ?? null;
                    setHome(t);
                    setFixtures([]);
                    setSelectedFixtureId("");
                  }}
                >
                  <option value="">Select home…</option>
                  {homeOptions.map((t) => (
                    <option key={t.team_id} value={t.team_id}>
                      {t.name}{t.country ? ` (${t.country})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field w6">
              <label>Away team (global)</label>
              <input value={qAway} onChange={(e) => setQAway(e.target.value)} placeholder="Search (e.g., Chelsea)" />
              <div style={{ marginTop: 8 }}>
                <select
                  value={away?.team_id ?? ""}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const t = awayOptions.find((x) => x.team_id === id) ?? null;
                    setAway(t);
                    setFixtures([]);
                    setSelectedFixtureId("");
                  }}
                >
                  <option value="">Select away…</option>
                  {awayOptions.map((t) => (
                    <option key={t.team_id} value={t.team_id}>
                      {t.name}{t.country ? ` (${t.country})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field w6">
              <label>Artifact</label>
              <select value={artifactId} onChange={(e) => setArtifactId(e.target.value)}>
                {artifactOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>

            <div className="field w6" style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn ghost" disabled={!canSearchFixtures} onClick={onFindFixtures}>
                Find upcoming fixtures
              </button>
              <button className="btn primary" disabled={!home || !away} onClick={onCalculate}>
                Calculate
              </button>
            </div>

            <div className="field w12">
              <label>
                <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> Advanced (what-if)
              </label>
              <div className="note">
                Default mode prefers a real fixture when available. Advanced mode runs a what-if simulation without relying on a fixture.
              </div>
            </div>

            {!advanced ? (
              <div className="field w12">
                <label>Upcoming fixtures between selected teams</label>
                <select
                  value={selectedFixtureId}
                  onChange={(e) => setSelectedFixtureId(e.target.value ? Number(e.target.value) : "")}
                  disabled={fixtures.length === 0}
                >
                  <option value="">{fixtures.length ? "Select fixture…" : "No fixtures loaded (click “Find upcoming fixtures”)"} </option>
                  {fixtures.map((f) => (
                    <option key={f.fixture_id} value={f.fixture_id}>
                      {fmtIsoToShort(f.kickoff_utc)} — {f.competition_name} — season {f.season}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="field w6">
                  <label>Venue mode</label>
                  <select value={venueMode} onChange={(e) => setVenueMode(e.target.value as any)}>
                    <option value="HOME">Home</option>
                    <option value="NEUTRAL">Neutral</option>
                  </select>
                </div>
                <div className="field w6">
                  <label>Reference date (UTC, optional)</label>
                  <input
                    value={referenceDateUtc}
                    onChange={(e) => setReferenceDateUtc(e.target.value)}
                    placeholder="2026-01-11T12:00:00Z (leave blank = auto)"
                  />
                </div>
              </>
            )}
          </div>
        </Card>

        <Card
          title="Output"
          right={result ? <Pill>{result.meta.is_whatif ? "what-if" : "fixture"}</Pill> : <Pill>waiting</Pill>}
        >
          {result ? (
            <>
              <div className="note">
                Artifact: <b>{result.meta.artifact_id}</b>
                <br />
                {result.meta.kickoff_utc ? (
                  <>Kickoff: <b>{result.meta.kickoff_utc}</b><br /></>
                ) : null}
                {result.meta.competition_name ? (
                  <>Competition: <b>{result.meta.competition_name}</b> • Season: <b>{result.meta.season}</b></>
                ) : null}
              </div>

              <hr className="sep" />

              <table className="table">
                <thead>
                  <tr>
                    <th>Outcome</th>
                    <th>Prob</th>
                    <th>Fair odds</th>
                  </tr>
                </thead>
                <tbody>
                  <ProbRow label="H" p={result.probs_1x2.H} odd={result.fair_odds_1x2.H} />
                  <ProbRow label="D" p={result.probs_1x2.D} odd={result.fair_odds_1x2.D} />
                  <ProbRow label="A" p={result.probs_1x2.A} odd={result.fair_odds_1x2.A} />
                </tbody>
              </table>

              {result.drivers?.length ? (
                <>
                  <div className="section-title">Drivers (preview)</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Label</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.drivers.map((d) => (
                        <tr key={d.key}>
                          <td className="mono">{d.key}</td>
                          <td>{d.label}</td>
                          <td className="mono">{d.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
            </>
          ) : (
            <div className="note">Pick teams, then calculate. Default mode uses a real fixture when available.</div>
          )}
        </Card>
      </div>
    </>
  );
}
