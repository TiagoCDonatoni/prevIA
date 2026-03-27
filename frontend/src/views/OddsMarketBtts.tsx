import { useEffect, useState } from "react";
import { getAdminOddsBtts } from "../api/client";
import type { AdminOddsBttsResponse } from "../api/contracts";
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

function isoShort(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.replace("T", " ").replace(":00Z", "Z");
}

export default function OddsMarketBtts() {
  const [sportKey, setSportKey] = useState("soccer_epl");
  const [hoursAhead, setHoursAhead] = useState(720);
  const [limit, setLimit] = useState(50);

  const [data, setData] = useState<AdminOddsBttsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const out = await getAdminOddsBtts({
        sport_key: sportKey,
        hours_ahead: hoursAhead,
        limit,
      });
      setData(out);
    } catch (e: any) {
      setData(null);
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const counts = data?.meta.counts;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card title="Odds BTTS">
        <div style={{ opacity: 0.8, marginBottom: 12 }}>
          Visão técnica do mercado BTTS usando odds_snapshots_market + matchup_snapshot_v1
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
            alignItems: "end",
          }}
        >
          <label>
            <div style={{ marginBottom: 6 }}>Sport Key</div>
            <input
              value={sportKey}
              onChange={(e) => setSportKey(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div style={{ marginBottom: 6 }}>Hours Ahead</div>
            <input
              type="number"
              value={hoursAhead}
              onChange={(e) => setHoursAhead(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div style={{ marginBottom: 6 }}>Limit</div>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </label>

          <div style={{ display: "flex", alignItems: "end" }}>
            <button
              className="nav-btn"
              onClick={refresh}
              disabled={loading}
              style={{ minWidth: 120 }}
            >
              {loading ? "Carregando..." : "Atualizar"}
            </button>
          </div>
        </div>

        {err && <div style={{ marginTop: 12, color: "#ff8080" }}>{err}</div>}
      </Card>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <div style={{ flex: "0 0 220px" }}>
          <Kpi title="Jogos" value={String(counts?.total ?? 0)} />
        </div>
        <div style={{ flex: "0 0 220px" }}>
          <Kpi title="Com mercado" value={String(counts?.with_market ?? 0)} />
        </div>
        <div style={{ flex: "0 0 220px" }}>
          <Kpi title="Com snapshot" value={String(counts?.with_snapshot ?? 0)} />
        </div>
        <div style={{ flex: "0 0 220px" }}>
          <Kpi title="Com p_model" value={String(counts?.with_model_probs ?? 0)} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {(data?.items || []).map((it) => {
          const pModel = it.snapshot?.btts?.p_model;
          const pMarket = it.market?.market_probs;
          const edge = it.edge;
          const ev = it.ev;

          return (
            <Card key={it.event_id} title={`${it.home_name} x ${it.away_name}`}>
              <div style={{ opacity: 0.8, marginBottom: 12 }}>
                {isoShort(it.kickoff_utc)} • conf={it.match_confidence || "—"} • fixture={it.fixture_id ?? "—"}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ opacity: 0.7 }}>Best Yes</div>
                  <div>{fmt(it.market?.best_yes, 2)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>Best No</div>
                  <div>{fmt(it.market?.best_no, 2)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>Snapshot Count</div>
                  <div>{String(it.market?.snapshot_count ?? 0)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>Captured</div>
                  <div>{isoShort(it.market?.latest_captured_at_utc)}</div>
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "14px 0" }} />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ opacity: 0.7 }}>P_market Yes</div>
                  <div>{pct(pMarket?.yes)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>P_market No</div>
                  <div>{pct(pMarket?.no)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>P_model Yes</div>
                  <div>{pct(pModel?.yes)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>P_model No</div>
                  <div>{pct(pModel?.no)}</div>
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "14px 0" }} />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ opacity: 0.7 }}>Edge Yes</div>
                  <div>{pct(edge?.yes)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>Edge No</div>
                  <div>{pct(edge?.no)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>EV Yes</div>
                  <div>{pct(ev?.yes)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>EV No</div>
                  <div>{pct(ev?.no)}</div>
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "14px 0" }} />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ opacity: 0.7 }}>lambda_home</div>
                  <div>{fmt(it.snapshot?.inputs?.lambda_home, 3)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>lambda_away</div>
                  <div>{fmt(it.snapshot?.inputs?.lambda_away, 3)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>lambda_total</div>
                  <div>{fmt(it.snapshot?.inputs?.lambda_total, 3)}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>Overround</div>
                  <div>{pct(it.market?.overround != null ? it.market.overround - 1 : null)}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}