import { useEffect, useMemo, useState } from "react";

import { Card } from "../ui/Card";
import { Pill } from "../ui/Pill";

import type { ProductOddsEvent, ProductOddsQuoteResponse } from "../api/contracts";
import { productListOddsEvents, productQuoteOdds } from "../api/client";

import { useI18n } from "../product/i18n/useI18n";
import { STORAGE_REVEALS, useEntitlements } from "../product/state/useEntitlements";

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

type RevealsMap = Record<string, true>;

function readReveals(): RevealsMap {
  try {
    const raw = localStorage.getItem(STORAGE_REVEALS);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as RevealsMap;
  } catch {
    return {};
  }
}

function writeReveals(map: RevealsMap) {
  localStorage.setItem(STORAGE_REVEALS, JSON.stringify(map));
}

export default function ProductOdds() {
  const { t } = useI18n();
  const { plan, remainingToday, consumeCredit, resetNonce } = useEntitlements();

  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ProductOddsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [onlyGood, setOnlyGood] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<ProductOddsQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // 🔑 Reveals sincronizados com STORAGE_REVEALS
  const [reveals, setReveals] = useState<RevealsMap>(() => readReveals());

  const revealed = useMemo(() => (selectedId ? !!reveals[selectedId] : false), [reveals, selectedId]);
  const noCredits = remainingToday <= 0;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await productListOddsEvents({
        sport_key: DEFAULTS.sportKey,
        hours_ahead: DEFAULTS.hoursAhead,
        limit: DEFAULTS.limit,
      });
      const evts = res.events || [];
      setEvents(evts);

      const first = evts.find((e) => e.match_status === "EXACT" || e.match_status === "PROBABLE");
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

  function revealSelected() {
    if (!selectedId) return;

    // idempotente: se já revelou, não consome crédito
    if (reveals[selectedId]) return;

    if (noCredits) return;

    // 1) grava reveal
    const next = { ...reveals, [selectedId]: true as const };
    setReveals(next);
    writeReveals(next);

    // 2) consome 1 crédito do dia (fonte única)
    consumeCredit();
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

  // Load events on mount
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando revelar (ou trocar jogo), busca quote somente se revealed=true
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (selectedId && revealed) runQuote(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, revealed]);

  // ✅ FIX PRINCIPAL: quando clicar Reset (DEV), limpar state em memória também
  useEffect(() => {
    // storage já foi limpo no reset, então sincroniza
    const next = readReveals();
    setReveals(next);

    // também limpa quote/seleção da análise para evitar “fantasma”
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(false);

    console.log("[DEV] ProductOdds: resetNonce mudou -> state ressincronizado");
  }, [resetNonce]);

  return (
    <div className="container">
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <Card title={t("matchup.gamesTitle")}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <input
              className="input"
              placeholder={t("matchup.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ minWidth: 240 }}
            />

            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: 0 }}>
              <input type="checkbox" checked={onlyGood} onChange={(e) => setOnlyGood(e.target.checked)} />
              <span style={{ fontSize: 12, color: "var(--muted)" }}>EXACT/PROBABLE</span>
            </label>

            <button className="btn" onClick={load} disabled={loading}>
              {loading ? t("common.loading") : t("common.reload")}
            </button>

            <div style={{ opacity: 0.7, fontSize: 12 }}>
              sport_key: <b>{DEFAULTS.sportKey}</b> • janela: <b>{DEFAULTS.hoursAhead}h</b> • total: <b>{events.length}</b> • plan: <b>{plan}</b>
            </div>
          </div>

          {error ? <div className="error">{error}</div> : null}

          <div style={{ display: "grid", gap: 8 }}>
            {filtered.map((e) => {
              const active = e.event_id === selectedId;
              const status = e.match_status ?? "—";
              const isRevealed = !!reveals[e.event_id];

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
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 650 }}>
                      {e.home_name} <span style={{ opacity: 0.6 }}>vs</span> {e.away_name}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {isRevealed ? <Pill>{t("credits.alreadyRevealed")}</Pill> : null}
                      <Pill>{status}</Pill>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    <div>{e.commence_time_utc}</div>
                    <div>{t("matchup.available")}</div>
                  </div>
                </button>
              );
            })}

            {!loading && filtered.length === 0 ? <div style={{ opacity: 0.7 }}>{t("matchup.noGames")}</div> : null}
          </div>
        </Card>

        <Card title={t("matchup.analysisTitle")}>
          {!selected ? <div style={{ opacity: 0.7 }}>{t("matchup.selectGame")}</div> : null}

          {selected ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {selected.home_name} <span style={{ opacity: 0.6 }}>vs</span> {selected.away_name}
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Pill>match: {selected.match_status ?? "—"}</Pill>
                <Pill>plan: {plan}</Pill>
              </div>

              {!revealed ? (
                <>
                  {noCredits ? (
                    <div className="warn" style={{ fontSize: 12 }}>
                      {t("credits.usedUpTitle")} {t("credits.usedUpBody")}
                    </div>
                  ) : null}

                  <button className="btn" onClick={revealSelected} disabled={noCredits}>
                    {noCredits ? t("errors.noCredits") : t("credits.revealCost", { cost: 1 })}
                  </button>
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
                          <div className="kpi-label">{t("matchup.probabilities")}</div>
                          <div className="kpi-value">
                            H {fmtPct(quote.probs?.H ?? 0)} <br />
                            D {fmtPct(quote.probs?.D ?? 0)} <br />
                            A {fmtPct(quote.probs?.A ?? 0)}
                          </div>
                        </div>

                        <div className="kpi">
                          <div className="kpi-label">{t("matchup.marketOdds")}</div>
                          <div className="kpi-value">
                            H {quote.odds?.best?.H ?? "—"} <br />
                            D {quote.odds?.best?.D ?? "—"} <br />
                            A {quote.odds?.best?.A ?? "—"}
                          </div>
                        </div>
                      </div>

                      <div className="kpi">
                        <div className="kpi-label">{t("matchup.valueDetected")}</div>
                        <div className="kpi-value">{bestSideFromEdge(quote.value?.edge) ?? "—"}</div>
                      </div>
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
