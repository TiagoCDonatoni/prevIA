import React, { useEffect, useMemo, useState, useCallback } from "react";

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

type LeagueId = "EPL"; // no futuro: "BUNDESLIGA" | "BRASILEIRAO_A" | ...

type LeagueCfg = {
  id: LeagueId;
  sportKey: string;
  // nomes finais (produto): nada de keys aqui
  name: Record<Lang, string>;
  // parâmetros de quote (por liga)
  assumeLeagueId: number;
  assumeSeason: number;
  artifactFilename: string;
};

const LEAGUES: LeagueCfg[] = [
  {
    id: "EPL",
    sportKey: "soccer_epl",
    name: { pt: "Premier League", en: "Premier League", es: "Premier League" },
    assumeLeagueId: 39,
    assumeSeason: 2025,
    artifactFilename: "epl_1x2_logreg_tempcal_v1_C_2021_2023_C0.3_cal2023.json",
  },
];

// helper seguro
function getLeagueCfg(id: LeagueId): LeagueCfg {
  return LEAGUES.find((l) => l.id === id) ?? LEAGUES[0];
}

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

function fmtAgo(ts: number, lang: Lang, now: number) {
  const diffMs = now - ts;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) return lang === "pt" ? "agora" : lang === "es" ? "ahora" : "now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    if (lang === "pt") return `há ${diffMin} min`;
    if (lang === "es") return `hace ${diffMin} min`;
    return `${diffMin}m ago`;
  }

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    if (lang === "pt") return `há ${diffHr} h`;
    if (lang === "es") return `hace ${diffHr} h`;
    return `${diffHr}h ago`;
  }

  const diffDay = Math.floor(diffHr / 24);
  if (lang === "pt") return `há ${diffDay} d`;
  if (lang === "es") return `hace ${diffDay} d`;
  return `${diffDay}d ago`;
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
  const [leagueId, setLeagueId] = useState<LeagueId>("EPL");
  const league = useMemo(() => getLeagueCfg(leagueId), [leagueId]);

  const [windowDays, setWindowDays] = useState<number>(7);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("DATE");

  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  const [selectedId, setSelectedId] = useState<string>("");

  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<ProductOddsQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string>("");

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    setEventsError("");
    try {
      const res = await productListOddsEvents({
        sport_key: league.sportKey,
        hours_ahead: DEFAULTS.hoursAhead,
        limit: DEFAULTS.limit,
      });

      const list = res?.events ?? [];
      setEvents(list);
      setLastLoadedAt(Date.now());

      // opcional: se o selecionado não existe mais, limpa
      // (evita UI presa em item que sumiu)
      // if (selectedId && !list.some((x) => String(x.event_id) === String(selectedId))) {
      //   setSelectedId("");
      //   clearQuoteUI();
      // }
    } catch (e: any) {
      setEventsError(e?.message ?? "Failed to load events");
    } finally {
      setLoadingEvents(false);
    }
  }, [league.sportKey, windowDays, statusFilter, sortBy]); // ajuste deps se você filtra no server

  // Auto-refresh: 12h (fallback) + refresh ao voltar para a aba
  useEffect(() => {
    // fallback longo
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

    const intervalId = window.setInterval(() => {
      // só atualiza se a aba estiver visível
      if (document.visibilityState === "visible") {
        loadEvents();
      }
    }, TWELVE_HOURS_MS);

    // quando o usuário volta para a aba, garante atualização
    const onVis = () => {
      if (document.visibilityState === "visible") {
        loadEvents();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadEvents]);

  useEffect(() => {
    if (!lastLoadedAt) return;

    // Atualiza o "agora" a cada 30s (baixo custo)
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [lastLoadedAt]);

  async function runQuote(eventId: string) {
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError("");
    try {
      const res = await productQuoteOdds({
        event_id: eventId,
        assume_league_id: league.assumeLeagueId,
        assume_season: league.assumeSeason,
        artifact_filename: league.artifactFilename,
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
            value={leagueId}
            onChange={(e) => {
              setLeagueId(e.target.value as LeagueId);
              setSelectedId("");
              clearQuoteUI();
              // recarrega imediatamente a lista da liga escolhida
              // (usa a liga nova na próxima renderização)
              setTimeout(() => loadEvents(), 0);
            }}
            aria-label={t(lang, "odds.filterLeague")}
          >
            {LEAGUES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name[lang]}
              </option>
            ))}
          </select>

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
          {t(lang, "odds.metaCount", { showing: visibleEvents.length, loaded: events.length })}
          {lastLoadedAt ? (
            <>
              <span className="pi-subsep">•</span>
              <span>{t(lang, "common.updatedAgo", { ago: fmtAgo(lastLoadedAt, lang, nowTick) })}</span>
            </>
          ) : null}
        </div>

        <div style={{ flex: 1 }} />

      </div>

      <div className="pi-grid">
        {/* LEFT: LISTA */}
        <section className="pi-card pi-card-list">
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
                      <span className="pi-league">{league.name[lang]}</span>
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
        <aside className="pi-card pi-card-analysis">
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

              <div className="pi-cta-wrap">
                <button
                  className="pi-btn"
                  onClick={onRevealAndOpen}
                  disabled={!selectedId || quoteLoading}
                  title={!canReveal && !alreadyRevealed ? t(lang, "errors.noCredits") : ""}
                >
                  {t(lang, "credits.viewAnalysis")}
                </button>

                {!alreadyRevealed ? (
                  <div className="pi-cta-sub">
                    ({t(lang, "credits.oneCredit")})
                  </div>
                ) : null}
              </div>
              </div>

              {quoteError ? <div className="pi-error">{quoteError}</div> : null}

              {!quote ? (
                <div className="pi-muted">{t(lang, "odds.revealHint")}</div>
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
