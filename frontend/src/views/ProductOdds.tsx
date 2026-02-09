import { useEffect, useMemo, useState } from "react";

import { Card } from "../ui/Card";
import { Pill } from "../ui/Pill";

import type { ProductOddsEvent, ProductOddsQuoteResponse } from "../api/contracts";
import { productListOddsEvents, productQuoteOdds } from "../api/client";

import { t } from "../i18n";
import { PLAN_LABELS } from "../product/entitlements";
import { useProductStore } from "../product/state/productStore";

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

function bestSideFromEdge(edge?: { H?: number | null; D?: number | null; A?: number | null } | null): "H" | "D" | "A" | null {
  if (!edge) return null;
  const pairs: Array<["H" | "D" | "A", number]> = [
    ["H", edge.H ?? -Infinity],
    ["D", edge.D ?? -Infinity],
    ["A", edge.A ?? -Infinity],
  ];
  pairs.sort((a, b) => b[1] - a[1]);
  if (!isFinite(pairs[0][1])) return null;
  return pairs[0][0];
}

export default function ProductOdds() {
  const store = useProductStore();

  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ProductOddsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [onlyGood, setOnlyGood] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Product state (plan/lang/credits) is persisted via ProductStoreProvider.
  const productState = store.state;
  const ent = store.entitlements;

  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<ProductOddsQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const lang = ent.lang;
  const tr = (k: string, vars?: Record<string, any>) => t(lang, k, vars);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await productListOddsEvents({
        sport_key: DEFAULTS.sportKey,
        hours_ahead: DEFAULTS.hoursAhead,
        limit: DEFAULTS.limit,
      });
      setEvents(res.events || []);
      const first = (res.events || []).find((e) => e.match_status === "EXACT" || e.match_status === "PROBABLE");
      if (!selectedId && first) setSelectedId(first.event_id);
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

  // Auth modal removed for this iteration (kept for later when we add real login).

  function revealSelected() {
    if (!selectedId) return;

    const res = store.tryReveal(selectedId);
    if (!res.ok) return;

    // MVP fix: evita depender do useEffect (selectedId/revealed) para disparar o quote
    runQuote(selectedId);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events
      .filter((e) => {
        if (onlyGood) {
          if (!(e.match_status === "EXACT" || e.match_status === "PROBABLE")) return false;
        }
        if (!q) return true;
        const hay = `${e.home_name} ${e.away_name}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (a.commence_time_utc < b.commence_time_utc ? -1 : 1));
  }, [events, query, onlyGood]);

  const selected = useMemo(() => events.find((e) => e.event_id === selectedId) ?? null, [events, selectedId]);
  const revealed = useMemo(
    () => (selectedId ? !!productState.credits.revealed_today?.[selectedId] : false),
    [productState, selectedId]
  );

  function deriveBestSideFromEdge(edge?: { H?: number | null; D?: number | null; A?: number | null } | null): "H" | "D" | "A" | "—" {
    if (!edge) return "—";
    const entries: Array<["H" | "D" | "A", number]> = [
      ["H", edge.H ?? 0],
      ["D", edge.D ?? 0],
      ["A", edge.A ?? 0],
    ];
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? "—";
  }

  // Load events on mount
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reveal-gated quote fetch
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (selectedId && revealed) runQuote(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, revealed]);

  const noCredits = ent.credits.remaining_today <= 0;
  const showSignupNudge = ent.plan === "FREE_ANON";

  return (
    <div className="container">

      {showSignupNudge ? (
        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 12,
            borderRadius: 14,
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{tr("credits.gainBySignup")}</div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <Card title={tr("matchup.gamesTitle")}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <input
              className="input"
              placeholder={lang === "en" ? "Search team…" : lang === "es" ? "Buscar equipo…" : "Buscar time…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ minWidth: 240 }}
            />

            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: 0 }}>
              <input type="checkbox" checked={onlyGood} onChange={(e) => setOnlyGood(e.target.checked)} />
              <span style={{ fontSize: 12, color: "var(--muted)" }}>EXACT/PROBABLE</span>
            </label>

            <button className="btn" onClick={load} disabled={loading}>
              {loading ? (lang === "en" ? "Loading…" : lang === "es" ? "Cargando…" : "Carregando…") : lang === "en" ? "Reload" : lang === "es" ? "Recargar" : "Recarregar"}
            </button>

            <div style={{ opacity: 0.7, fontSize: 12 }}>
              sport_key: <b>{DEFAULTS.sportKey}</b> • janela: <b>{DEFAULTS.hoursAhead}h</b> • total: <b>{events.length}</b>
            </div>
          </div>

          {error ? <div className="error">{error}</div> : null}

          <div style={{ display: "grid", gap: 8 }}>
            {filtered.map((e) => {
              const active = e.event_id === selectedId;
              const status = e.match_status ?? "—";
              const isRevealed = !!productState.credits.revealed_today?.[e.event_id];

              return (
                <button
                  key={e.event_id}
                  className={`list-row ${active ? "active" : ""}`}
                  onClick={() => setSelectedId(e.event_id)}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                    cursor: "pointer",
                    transition: "background 0.15s ease, border-color 0.15s ease",
                  }}
                  onMouseEnter={(evt) => {
                    if (!active) evt.currentTarget.style.background = "rgba(255,255,255,0.07)";
                  }}
                  onMouseLeave={(evt) => {
                    if (!active) evt.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 650 }}>
                      {e.home_name} <span style={{ opacity: 0.6 }}>vs</span> {e.away_name}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {isRevealed ? <Pill>{tr("credits.alreadyRevealed")}</Pill> : null}
                      <Pill>{status}</Pill>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    <div>{e.commence_time_utc}</div>
                    <div>{tr("matchup.available")}</div>
                  </div>
                </button>
              );
            })}

            {!loading && filtered.length === 0 ? (
              <div style={{ opacity: 0.7 }}>{lang === "en" ? "No games found." : lang === "es" ? "No se encontraron partidos." : "Nenhum jogo encontrado."}</div>
            ) : null}
          </div>
        </Card>

        <Card title={tr("matchup.analysisTitle")}>
          {!selected ? <div style={{ opacity: 0.7 }}>{tr("matchup.selectGame")}</div> : null}

          {selected ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {selected.home_name} <span style={{ opacity: 0.6 }}>vs</span> {selected.away_name}
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Pill>match: {selected.match_status ?? "—"}</Pill>
                <Pill>{PLAN_LABELS.find((p) => p.id === ent.plan)?.label ?? ent.plan}</Pill>
              </div>

              {!revealed ? (
                <>
                  {noCredits ? (
                    <div className="warn" style={{ fontSize: 12 }}>
                      {tr("credits.usedUpTitle")} {tr("credits.usedUpBody")}
                    </div>
                  ) : null}

                  <button className="btn" onClick={revealSelected} disabled={noCredits}>
                    {noCredits ? tr("errors.noCredits") : tr("credits.revealCost", { cost: 1 })}
                  </button>

                  {showSignupNudge ? <div style={{ fontSize: 12, opacity: 0.75 }}>{tr("credits.gainBySignup")}</div> : null}
                </>
              ) : null}

              {revealed ? (
                <>
                  {quoteLoading ? <div style={{ opacity: 0.7 }}>Calculando…</div> : null}
                  {quoteError ? <div className="error">{quoteError}</div> : null}

                  {quote && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div className="kpi">
                          <div className="kpi-label">{tr("matchup.probabilities")}</div>
                          <div className="kpi-value">
                            H {fmtPct(quote.probs?.H ?? 0)} <br />
                            D {fmtPct(quote.probs?.D ?? 0)} <br />
                            A {fmtPct(quote.probs?.A ?? 0)}
                          </div>
                        </div>

                        <div className="kpi">
                          <div className="kpi-label">{tr("matchup.marketOdds")}</div>
                          <div className="kpi-value">
                            {/* MVP: backend currently returns best odds snapshot. We'll show a single book label for all plans. */}
                            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                              <span style={{ opacity: 0.8 }}>Casa Parceira</span> <span style={{ opacity: 0.6 }}>★</span>
                              {ent.visibility.odds.show_partner_label ? (
                                <span style={{ marginLeft: 6, opacity: 0.7 }}>({tr("odds.partner")})</span>
                              ) : null}
                            </div>
                            H {quote.odds?.best?.H ?? "—"} <br />
                            D {quote.odds?.best?.D ?? "—"} <br />
                            A {quote.odds?.best?.A ?? "—"}
                          </div>
                        </div>
                      </div>

                      <div className="kpi">
                        <div className="kpi-label">{tr("matchup.valueDetected")}</div>
                        <div className="kpi-value">{bestSideFromEdge(quote.value?.edge) ?? "—"}</div>
                      </div>

                      {ent.visibility.value.show_edge_percent && quote.value?.edge ? (
                        <div className="kpi">
                          <div className="kpi-label">{tr("matchup.edge")}</div>
                          <div className="kpi-value" style={{ fontSize: 14 }}>
                            H {(quote.value.edge.H ?? 0).toFixed(3)} • D {(quote.value.edge.D ?? 0).toFixed(3)} • A {(quote.value.edge.A ?? 0).toFixed(3)}
                          </div>
                        </div>
                      ) : null}

                      {ent.visibility.model.show_metrics && quote.matchup?.model_season_used ? (
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          model_season: <b>{quote.matchup.model_season_used}</b>
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              ) : null}

              <div style={{ fontSize: 12, opacity: 0.7 }}>
                artifact: <b>{DEFAULTS.artifactFilename}</b>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    

    </div>
  );
}
