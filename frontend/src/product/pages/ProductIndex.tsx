import React, { useEffect, useMemo, useState } from "react";

import type { ProductOddsEvent, ProductOddsQuoteResponse } from "../../api/contracts";
import { productListOddsEvents, productQuoteOdds } from "../../api/client";
import { t, type Lang } from "../i18n";
import { useProductStore } from "../state/productStore";
import UpgradeModal from "../components/UpgradeModal";

// MVP: defaults do produto (TUDO fácil de mover para config depois)
const DEFAULTS = {
  sportKey: "soccer_epl",
  hoursAhead: 720,
  limit: 200,
  assumeLeagueId: 39,
  assumeSeason: 2025,
  artifactFilename: "epl_1x2_logreg_tempcal_v1_C_2021_2023_C0.3_cal2023.json",
  tolHours: 6,
};

type UpgradeReason = "NO_CREDITS" | "FEATURE_LOCKED";
type StatusFilter = "ALL" | "EXACT" | "NOT_FOUND";
type SortBy = "DATE" | "CONFIDENCE";

function fmtPct(x: number | null | undefined) {
  const v = typeof x === "number" && Number.isFinite(x) ? x : 0;
  return `${(v * 100).toFixed(1)}%`;
}

function fmtOdds(x: number | null | undefined) {
  if (x == null) return "—";
  const v = Number(x);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function fmtKickoff(iso: string, lang: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : lang, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function statusBadge(status: ProductOddsEvent["match_status"]) {
  if (!status) return { text: "—", cls: "pi-badge pi-badge-muted" };
  if (status === "EXACT") return { text: "EXACT", cls: "pi-badge pi-badge-good" };
  if (status === "PROBABLE") return { text: "PROBABLE", cls: "pi-badge pi-badge-warn" };
  if (status === "AMBIGUOUS") return { text: "AMBIGUOUS", cls: "pi-badge pi-badge-bad" };
  if (status === "NOT_FOUND") return { text: "NOT_FOUND", cls: "pi-badge pi-badge-bad" };
  return { text: String(status), cls: "pi-badge pi-badge-muted" };
}

function LockedPanel({
  title,
  onUnlock,
  lang,
}: {
  title: string;
  onUnlock: () => void;
  lang: Lang;
}) {
  return (
    <div className="pi-panel pi-locked" role="button" tabIndex={0} onClick={onUnlock}>
      <div className="pi-panel-label">{title}</div>
      <div className="pi-muted" style={{ marginTop: 8 }}>
        {t(lang, "credits.featureLockedBody")}
      </div>
      <div className="pi-locked-cta" style={{ marginTop: 10 }}>
        {t(lang, "credits.featureLockedCta")} →
      </div>
    </div>
  );
}

export default function ProductIndex() {
  const store = useProductStore();
  const lang = store.state.lang as Lang;
  const vis = store.entitlements.visibility;

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>("NO_CREDITS");

  const [loadingEvents, setLoadingEvents] = useState(false);
  const [events, setEvents] = useState<ProductOddsEvent[]>([]);
  const [eventsError, setEventsError] = useState<string>("");

  // filtros
  const [windowDays, setWindowDays] = useState<number>(7);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("DATE");

  const [selectedId, setSelectedId] = useState<string>("");

  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<ProductOddsQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string>("");

  async function loadEvents() {
    setLoadingEvents(true);
    setEventsError("");
    try {
      const res = await productListOddsEvents({
        sport_key: DEFAULTS.sportKey,
        hours_ahead: DEFAULTS.hoursAhead,
        limit: DEFAULTS.limit,
      });

      const list = res.events || [];
      setEvents(list);

      // seleciona automaticamente o primeiro "bom"
      const firstGood =
        list.find((e) => e.match_status === "EXACT" || e.match_status === "PROBABLE") ??
        list[0] ??
        null;

      const nextSelected =
        selectedId && list.some((e) => String(e.event_id) === String(selectedId))
          ? selectedId
          : firstGood?.event_id ?? "";

      setSelectedId(String(nextSelected));
    } catch (e: any) {
      setEventsError(e?.message ?? String(e));
    } finally {
      setLoadingEvents(false);
    }
  }

  async function runQuote(eventId: string) {
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError("");
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

  function clearQuoteUI() {
    setQuote(null);
    setQuoteError("");
  }

  async function onRevealAndOpen() {
    if (!selectedId) return;

    const ev = visibleEvents.find((e) => String(e.event_id) === String(selectedId));
    if (ev && (ev.match_status === "NOT_FOUND" || ev.match_status === "AMBIGUOUS")) {
      setQuoteError(t(lang, "errors.matchUnreliable"));
      return;
    }

    const r = store.tryReveal(String(selectedId));
    if (!r.ok && r.reason === "NO_CREDITS") {
      setUpgradeReason("NO_CREDITS");
      setUpgradeOpen(true);
      return;
    }

    await runQuote(String(selectedId));
  }

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // lista visível (filtro client-side)
  const visibleEvents = useMemo(() => {
    const now = new Date();
    const max = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

    let list = events.filter((e) => {
      const kickoff = new Date(e.commence_time_utc);
      if (Number.isNaN(kickoff.getTime())) return false;
      if (kickoff < now || kickoff > max) return false;

      if (statusFilter !== "ALL" && e.match_status !== statusFilter) return false;
      return true;
    });

    if (sortBy === "DATE") {
      list.sort(
        (a, b) => new Date(a.commence_time_utc).getTime() - new Date(b.commence_time_utc).getTime()
      );
    } else {
      list.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
    }

    return list;
  }, [events, windowDays, statusFilter, sortBy]);

  // garante selection válida dentro dos filtros atuais
  useEffect(() => {
    if (!visibleEvents.length) return;

    const stillExists =
      selectedId && visibleEvents.some((e) => String(e.event_id) === String(selectedId));

    if (!stillExists) {
      const firstGood =
        visibleEvents.find((e) => e.match_status === "EXACT" || e.match_status === "PROBABLE") ??
        visibleEvents[0];

      setSelectedId(String(firstGood.event_id));
      clearQuoteUI();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents]);

  const selected = useMemo(
    () => visibleEvents.find((e) => String(e.event_id) === String(selectedId)) ?? null,
    [visibleEvents, selectedId]
  );

  const key = selectedId ? String(selectedId) : "";
  const alreadyRevealed = key ? store.isRevealed(key) : false;
  const canReveal = key ? store.canReveal(key) : false;

  const revealBtnLabel = quoteLoading
    ? t(lang, "common.loading")
    : alreadyRevealed
    ? t(lang, "credits.reveal")
    : !canReveal
    ? t(lang, "plans.cta.upgrade")
    : t(lang, "credits.revealCost", { cost: 1 });

  return (
    <div className="pi">
      <div className="pi-topline">
        <div className="pi-filters" style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <select
            className="pi-select"
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            aria-label={t(lang, "odds.filterWindow")}
          >
            <option value={1}>{t(lang, "odds.windowToday")}</option>
            <option value={3}>{t(lang, "odds.window3d")}</option>
            <option value={7}>{t(lang, "odds.window7d")}</option>
            <option value={30}>{t(lang, "odds.window30d")}</option>
          </select>

          <select
            className="pi-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label={t(lang, "odds.filterStatus")}
          >
            <option value="ALL">{t(lang, "odds.statusAll")}</option>
            <option value="EXACT">{t(lang, "odds.statusExact")}</option>
            <option value="NOT_FOUND">{t(lang, "odds.statusNotFound")}</option>
          </select>

          <select
            className="pi-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            aria-label={t(lang, "odds.sortBy")}
          >
            <option value="DATE">{t(lang, "odds.sortDate")}</option>
            <option value="CONFIDENCE">{t(lang, "odds.sortConfidence")}</option>
          </select>
        </div>

        <div className="pi-title">{t(lang, "odds.pageTitle")}</div>

        <div className="pi-meta">
          {t(lang, "odds.meta", {
            sportKey: DEFAULTS.sportKey,
            hoursAhead: DEFAULTS.hoursAhead,
            showing: visibleEvents.length,
            loaded: events.length,
          })}
        </div>

        <div style={{ flex: 1 }} />

        <button className="pi-btn pi-btn-ghost" onClick={loadEvents} disabled={loadingEvents}>
          {loadingEvents ? t(lang, "common.loading") : t(lang, "odds.reload")}
        </button>
      </div>

      <div className="pi-grid">
        {/* LEFT: LISTA */}
        <section className="pi-card">
          {eventsError ? <div className="pi-error">{eventsError}</div> : null}

          <div className="pi-list" aria-label={t(lang, "odds.listAria")}>
            {visibleEvents.map((e) => {
              const active = String(e.event_id) === String(selectedId);
              const b = statusBadge(e.match_status);

              return (
                <button
                  key={e.event_id}
                  className={`pi-row ${active ? "is-active" : ""}`}
                  onClick={() => {
                    setSelectedId(String(e.event_id));
                    clearQuoteUI();
                  }}
                >
                  <div className="pi-row-main">
                    <div className="pi-row-title">
                      <span className="pi-team">{e.home_name}</span>
                      <span className="pi-vs">vs</span>
                      <span className="pi-team">{e.away_name}</span>
                    </div>

                    <div className="pi-row-sub">
                      <span className={b.cls}>{b.text}</span>
                      <span className="pi-subsep">•</span>
                      <span className="pi-kick">{fmtKickoff(e.commence_time_utc, lang)}</span>

                      {e.odds_best ? (
                        <>
                          <span className="pi-subsep">•</span>
                          <span className="pi-odds-mini">
                            H {fmtOdds(e.odds_best.H)} / D {fmtOdds(e.odds_best.D)} / A{" "}
                            {fmtOdds(e.odds_best.A)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* RIGHT: DETALHE + ANÁLISE */}
        <aside className="pi-card">
          {!selected ? (
            <div className="pi-muted">{t(lang, "odds.selectHint")}</div>
          ) : (
            <div className="pi-detail">
              <div className="pi-detail-head">
                <div>
                  <div className="pi-detail-title">
                    {selected.home_name} <span className="pi-vs">vs</span> {selected.away_name}
                  </div>

                  <div className="pi-detail-sub">
                    <span className="pi-kick">{fmtKickoff(selected.commence_time_utc, lang)}</span>

                    {selected.odds_best ? (
                      <>
                        <span className="pi-subsep">•</span>
                        <span className="pi-odds-mini">
                          {t(lang, "odds.bestLabel")}: H {fmtOdds(selected.odds_best.H)} / D{" "}
                          {fmtOdds(selected.odds_best.D)} / A {fmtOdds(selected.odds_best.A)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                <button
                  className="pi-btn"
                  onClick={onRevealAndOpen}
                  disabled={!selectedId || quoteLoading}
                  title={!canReveal && !alreadyRevealed ? t(lang, "errors.noCredits") : ""}
                >
                  {revealBtnLabel}
                </button>
              </div>

              {quoteError ? <div className="pi-error">{quoteError}</div> : null}

              {!quote ? (
                <div className="pi-muted">
                  {t(lang, "odds.artifact")}: <b>{DEFAULTS.artifactFilename}</b>
                </div>
              ) : (
                <div className="pi-panels">
                  <div className="pi-panel">
                    <div className="pi-panel-label">{t(lang, "matchup.probabilities")}</div>
                    {quote.probs ? (
                      <div className="pi-panel-value">
                        H {fmtPct(quote.probs.H)} <br />
                        D {fmtPct(quote.probs.D)} <br />
                        A {fmtPct(quote.probs.A)}
                      </div>
                    ) : (
                      <div className="pi-muted">{t(lang, "matchup.noProbs")}</div>
                    )}
                  </div>

                  <div className="pi-panel">
                    <div className="pi-panel-label">{t(lang, "odds.bestOdd")}</div>
                    {quote.odds?.best ? (
                      <div className="pi-panel-value">
                        H {fmtOdds(quote.odds.best.H)} <br />
                        D {fmtOdds(quote.odds.best.D)} <br />
                        A {fmtOdds(quote.odds.best.A)}
                      </div>
                    ) : (
                      <div className="pi-muted">{t(lang, "odds.noOdds")}</div>
                    )}
                  </div>

                  {/* Confiança (por plano) */}
                  {vis.context.show_confidence_level ? (
                    <div className="pi-panel">
                      <div className="pi-panel-label">{t(lang, "matchup.confidence")}</div>
                      <div className="pi-panel-value">{fmtPct(quote?.matchup?.confidence ?? 0)}</div>
                      <div className="pi-muted">
                        {t(lang, "matchup.status")}: <b>{quote?.matchup?.status}</b>
                      </div>
                    </div>
                  ) : (
                    <LockedPanel
                      title={t(lang, "matchup.confidence")}
                      lang={lang}
                      onUnlock={() => {
                        setUpgradeReason("FEATURE_LOCKED");
                        setUpgradeOpen(true);
                      }}
                    />
                  )}

                  {/* Edge (por plano) */}
                  {vis.value.show_edge_percent ? (
                    quote?.value?.edge ? (
                      <div className="pi-panel">
                        <div className="pi-panel-label">{t(lang, "matchup.edge")}</div>
                        <div className="pi-panel-value">
                          H {fmtPct(quote.value.edge.H)} <br />
                          D {fmtPct(quote.value.edge.D)} <br />
                          A {fmtPct(quote.value.edge.A)}
                        </div>

                        {vis.value.show_value_detected ? (
                          <div className="pi-muted">{t(lang, "matchup.valueEnabled")}</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="pi-panel">
                        <div className="pi-panel-label">{t(lang, "matchup.edge")}</div>
                        <div className="pi-muted">{t(lang, "matchup.noEdge")}</div>
                      </div>
                    )
                  ) : (
                    <LockedPanel
                      title={t(lang, "matchup.edge")}
                      lang={lang}
                      onUnlock={() => {
                        setUpgradeReason("FEATURE_LOCKED");
                        setUpgradeOpen(true);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <UpgradeModal open={upgradeOpen} reason={upgradeReason} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
