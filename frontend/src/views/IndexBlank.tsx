import { useEffect, useMemo, useState } from "react";
import { Card } from "../ui/Card";
import type { ProductOddsEvent, ProductOddsQuoteResponse } from "../api/contracts";
import { productListOddsEvents, productQuoteOdds } from "../api/client";

const DEFAULTS = {
  sportKey: "soccer_epl",
  hoursAhead: 720,
  limit: 200,
  assumeLeagueId: 39,
  assumeSeason: 2025,
  artifactFilename: "epl_1x2_logreg_tempcal_v1_C_2021_2023_C0.3_cal2023.json",
  tolHours: 6,
};

function fmtPct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

export default function IndexBlank() {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ProductOddsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<ProductOddsQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await productListOddsEvents({
        sport_key: DEFAULTS.sportKey,
        hours_ahead: DEFAULTS.hoursAhead,
        limit: DEFAULTS.limit,
      });

      const list = res.events || [];
      setEvents(list);

      const firstGood =
        list.find((e) => e.match_status === "EXACT" || e.match_status === "PROBABLE") ?? list[0] ?? null;

      setSelectedId((prev) => (prev && list.some((e) => e.event_id === prev) ? prev : firstGood?.event_id ?? null));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runQuote(eventId: string) {
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError(null);

    try {
      const res = await productQuoteOdds({
        event_id: eventId,
        assume_league_id: DEFAULTS.assumeLeagueId,
        assume_season: DEFAULTS.assumeSeason,
        artifact_filename: DEFAULTS.artifactFilename,
        tol_hours: DEFAULTS.tolHours,
      });
      setQuote(res);
    } catch (e: any) {
      setQuoteError(e?.message ?? String(e));
    } finally {
      setQuoteLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => events.find((e) => e.event_id === selectedId) ?? null, [events, selectedId]);

  return (
    <div className="container">
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <Card title="Jogos">
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? "Carregando…" : "Recarregar"}
            </button>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              sport_key: <b>{DEFAULTS.sportKey}</b> • janela: <b>{DEFAULTS.hoursAhead}h</b> • total: <b>{events.length}</b>
            </div>
          </div>

          {error ? <div className="error">{error}</div> : null}

          <div style={{ display: "grid", gap: 8 }}>
            {events.map((e) => {
              const active = e.event_id === selectedId;
              return (
                <button
                  key={e.event_id}
                  className={`list-row ${active ? "active" : ""}`}
                  onClick={() => {
                    setSelectedId(e.event_id);
                    setQuote(null);
                    setQuoteError(null);
                  }}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 650 }}>
                    {e.home_name} <span style={{ opacity: 0.6 }}>vs</span> {e.away_name}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{e.commence_time_utc}</div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card title="Análise">
          {!selected ? <div style={{ opacity: 0.7 }}>Selecione um jogo.</div> : null}

          {selected ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {selected.home_name} <span style={{ opacity: 0.6 }}>vs</span> {selected.away_name}
              </div>

              <button className="btn" onClick={() => selectedId && runQuote(selectedId)} disabled={!selectedId || quoteLoading}>
                {quoteLoading ? "Calculando…" : "Gerar análise"}
              </button>

              {quoteError ? <div className="error">{quoteError}</div> : null}

              {quote ? (
                <>
                  <div className="kpi">
                    <div className="kpi-label">Probabilidades</div>
                    <div className="kpi-value">
                      H {fmtPct(quote.probs?.H ?? 0)} <br />
                      D {fmtPct(quote.probs?.D ?? 0)} <br />
                      A {fmtPct(quote.probs?.A ?? 0)}
                    </div>
                  </div>

                  <div className="kpi">
                    <div className="kpi-label">Odds (best)</div>
                    <div className="kpi-value">
                      H {quote.odds?.best?.H ?? "—"} <br />
                      D {quote.odds?.best?.D ?? "—"} <br />
                      A {quote.odds?.best?.A ?? "—"}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  artifact: <b>{DEFAULTS.artifactFilename}</b>
                </div>
              )}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
