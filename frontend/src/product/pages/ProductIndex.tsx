import React, { useEffect, useMemo, useState } from "react";

import type { ProductOddsEvent, ProductOddsQuoteResponse } from "../../api/contracts";
import { productListOddsEvents, productQuoteOdds } from "../../api/client";
import { useProductStore } from "../state/productStore";
import UpgradeModal from "../components/UpgradeModal";

// MVP: defaults do produto (TUDO fácil de mover para config depois)
// Mantive aqui para destravar o core com consistência.
const DEFAULTS = {
  sportKey: "soccer_epl",
  hoursAhead: 720,
  limit: 200,
  assumeLeagueId: 39,
  assumeSeason: 2025,
  artifactFilename: "epl_1x2_logreg_tempcal_v1_C_2021_2023_C0.3_cal2023.json",
  tolHours: 6,
};

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
  // Exibir em pt/en/es respeitando a máquina do usuário; MVP ok.
  // Se quiser "sempre SP", dá pra forçar timeZone: "America/Sao_Paulo".
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

function ymdInSaoPaulo(iso: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${day}`;
}

function ymdTodaySP(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "1");

  // base em UTC só pra somar dias de forma estável
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + offsetDays);

  // retorna YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

function LockedPanel({
  title,
  onUnlock,
  lang,
}: {
  title: string;
  onUnlock: () => void;
  lang: string;
}) {
  const txt =
    lang === "en"
      ? { body: "Available on a higher plan.", cta: "Unlock now" }
      : lang === "es"
      ? { body: "Disponible en un plan superior.", cta: "Desbloquear ahora" }
      : { body: "Disponível em um plano superior.", cta: "Desbloquear agora" };

  return (
    <div className="pi-panel pi-locked" role="button" tabIndex={0} onClick={onUnlock}>
      <div className="pi-panel-label">{title}</div>
      <div className="pi-muted" style={{ marginTop: 8 }}>{txt.body}</div>
      <div className="pi-locked-cta" style={{ marginTop: 10 }}>{txt.cta} →</div>
    </div>
  );
}

export default function ProductIndex() {
  const store = useProductStore();
  const lang = store.state.lang;
  const vis = store.entitlements.visibility;

  type UpgradeReason = "NO_CREDITS" | "FEATURE_LOCKED";

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>("NO_CREDITS");

  const [loadingEvents, setLoadingEvents] = useState(false);
  const [events, setEvents] = useState<ProductOddsEvent[]>([]);
  const [eventsError, setEventsError] = useState<string>("");

  const [selectedId, setSelectedId] = useState<string>("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<ProductOddsQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string>("");

  type DateFilter = "tomorrow" | "today" | "next7" | "all";

  const [dateFilter, setDateFilter] = useState<DateFilter>("tomorrow");

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

      // Seleciona automaticamente o primeiro "bom" (EXACT/PROBABLE) para reduzir fricção
      const firstGood = list.find((e) => e.match_status === "EXACT" || e.match_status === "PROBABLE") ?? list[0] ?? null;
      const nextSelected = selectedId && list.some((e) => e.event_id === selectedId) ? selectedId : firstGood?.event_id ?? "";
      setSelectedId(nextSelected);
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

    const ev = events.find((e) => String(e.event_id) === String(selectedId));
    if (ev && (ev.match_status === "NOT_FOUND" || ev.match_status === "AMBIGUOUS")) {
      setQuoteError(
        lang === "en"
          ? "This match can’t be matched reliably right now."
          : lang === "es"
          ? "Este partido no se puede emparejar con fiabilidad ahora."
          : "Este jogo ainda não pode ser pareado com confiança."
      );
      return;
    }

    // CORE DO PRODUTO:
    // 1) Revela (consome 1 crédito se ainda não revelado hoje)
    const r = store.tryReveal(String(selectedId));

    if (!r.ok && r.reason === "NO_CREDITS") {
      setUpgradeReason("NO_CREDITS");
      setUpgradeOpen(true);
      return;
    }

    // Se já revelado, não é erro: apenas abre normalmente (não consome novamente)
    await runQuote(String(selectedId));
  }

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // se o selecionado saiu do filtro atual, seleciona o primeiro do filtro
    if (selectedId && filteredEvents.some((e) => String(e.event_id) === String(selectedId))) return;

    const first = filteredEvents[0]?.event_id ?? "";
    setSelectedId(first);
    clearQuoteUI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, events.length]);

  const filteredEvents = useMemo(() => {
    const today = ymdTodaySP(0);
    const tomorrow = ymdTodaySP(1);

    if (dateFilter === "all") return events;

    if (dateFilter === "today") {
      return events.filter((e) => ymdInSaoPaulo(e.commence_time_utc) === today);
    }

    if (dateFilter === "tomorrow") {
      return events.filter((e) => ymdInSaoPaulo(e.commence_time_utc) === tomorrow);
    }

    if (dateFilter === "next7") {
      const set = new Set<string>();
      for (let i = 0; i < 7; i++) set.add(ymdTodaySP(i));
      return events.filter((e) => set.has(ymdInSaoPaulo(e.commence_time_utc)));
    }

    return events;
  }, [events, dateFilter]);

  const selected = useMemo(
    () => filteredEvents.find((e) => String(e.event_id) === String(selectedId)) ?? null,
    [filteredEvents, selectedId]
  );

  const key = selectedId ? String(selectedId) : "";
  const alreadyRevealed = key ? store.isRevealed(key) : false;
  const canReveal = key ? store.canReveal(key) : false;

  return (
    <div className="pi">
      <div className="pi-topline">
        <div className="pi-title">Jogos (Odds)</div>
          <div className="pi-meta">
            sport_key: <b>{DEFAULTS.sportKey}</b> • janela: <b>{DEFAULTS.hoursAhead}h</b> • exibindo: <b>{filteredEvents.length}</b>{" "}
            <span style={{ opacity: 0.6 }}>({events.length} carregados)</span>
          </div>
          <div style={{ flex: 1 }} />

          <select className="pi-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)}>
            <option value="tomorrow">{lang === "en" ? "Tomorrow" : lang === "es" ? "Mañana" : "Amanhã"}</option>
            <option value="today">{lang === "en" ? "Today" : lang === "es" ? "Hoy" : "Hoje"}</option>
            <option value="next7">{lang === "en" ? "Next 7 days" : lang === "es" ? "Next 7 days" : "Próx. 7 dias"}</option>
            <option value="all">{lang === "en" ? "All" : lang === "es" ? "Todos" : "Todos"}</option>
          </select>

          <button className="pi-btn pi-btn-ghost" onClick={loadEvents} disabled={loadingEvents}>
            {loadingEvents ? "Carregando…" : "Recarregar"}
          </button>

      </div>

      <div className="pi-grid">
        {/* LEFT: LISTA */}
        <section className="pi-card">
          {eventsError ? <div className="pi-error">{eventsError}</div> : null}

          <div className="pi-list" aria-label="Lista de jogos">
            {filteredEvents.map((e) => {
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
                            H {fmtOdds(e.odds_best.H)} / D {fmtOdds(e.odds_best.D)} / A {fmtOdds(e.odds_best.A)}
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
            <div className="pi-muted">Selecione um jogo para ver detalhes.</div>
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
                          Best: H {fmtOdds(selected.odds_best.H)} / D {fmtOdds(selected.odds_best.D)} / A{" "}
                          {fmtOdds(selected.odds_best.A)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                <button
                  className="pi-btn"
                  onClick={onRevealAndOpen}
                  disabled={!selectedId || quoteLoading}
                  title={!canReveal && !alreadyRevealed ? (lang === "en" ? "No credits" : lang === "es" ? "Sin créditos" : "Sem créditos") : ""}
                  >
                    {quoteLoading
                      ? (lang === "en" ? "Calculating…" : lang === "es" ? "Calculando…" : "Calculando…")
                      : alreadyRevealed
                      ? (lang === "en" ? "View analysis" : lang === "es" ? "Ver análisis" : "Ver análise")
                      : !canReveal
                      ? (lang === "en" ? "Get more credits" : lang === "es" ? "Obtener más créditos" : "Obter mais créditos")
                      : (lang === "en" ? "Reveal analysis (1 credit)" : lang === "es" ? "Revelar análisis (1 crédito)" : "Revelar análise (1 crédito)")}
                  </button>

              </div>

              {quoteError ? <div className="pi-error">{quoteError}</div> : null}

              {!quote ? (
                <div className="pi-muted">
                  Artifact: <b>{DEFAULTS.artifactFilename}</b>
                </div>
              ) : (
                <div className="pi-panels">
                  <div className="pi-panel">
                    <div className="pi-panel-label">Probabilidades</div>
                    {quote.probs ? (
                      <div className="pi-panel-value">
                        H {fmtPct(quote.probs.H)} <br />
                        D {fmtPct(quote.probs.D)} <br />
                        A {fmtPct(quote.probs.A)}
                      </div>
                    ) : (
                      <div className="pi-muted">Sem probs (modelo indisponível).</div>
                    )}
                  </div>

                  <div className="pi-panel">
                    <div className="pi-panel-label">Odds (best)</div>
                    {quote.odds?.best ? (
                      <div className="pi-panel-value">
                        H {fmtOdds(quote.odds.best.H)} <br />
                        D {fmtOdds(quote.odds.best.D)} <br />
                        A {fmtOdds(quote.odds.best.A)}
                      </div>
                    ) : (
                      <div className="pi-muted">Sem odds no momento.</div>
                    )}
                  </div>

                  {/* Confiança (por plano) */}
                  {vis.context.show_confidence_level ? (
                    <div className="pi-panel">
                      <div className="pi-panel-label">
                        {lang === "en" ? "Confidence" : lang === "es" ? "Confianza" : "Confiança"}
                      </div>

                      <div className="pi-panel-value">{fmtPct(quote?.matchup?.confidence ?? 0)}</div>

                      <div className="pi-muted">
                        status: <b>{quote?.matchup?.status}</b>
                      </div>
                    </div>
                  ) : (
                    <LockedPanel
                      title={lang === "en" ? "Confidence" : lang === "es" ? "Confianza" : "Confiança"}
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
                        <div className="pi-panel-label">Edge (vs market)</div>

                        <div className="pi-panel-value">
                          H {fmtPct(quote.value.edge.H)} <br />
                          D {fmtPct(quote.value.edge.D)} <br />
                          A {fmtPct(quote.value.edge.A)}
                        </div>

                        {vis.value.show_value_detected && (
                          <div className="pi-muted">
                            {lang === "en"
                              ? "Value detection enabled"
                              : lang === "es"
                              ? "Detección de valor habilitada"
                              : "Value detection habilitado"}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="pi-panel">
                        <div className="pi-panel-label">Edge (vs market)</div>
                        <div className="pi-muted">
                          {lang === "en"
                            ? "No edge data available."
                            : lang === "es"
                            ? "Sin datos de edge."
                            : "Sem dados de edge para este jogo."}
                        </div>
                      </div>
                    )
                  ) : (
                    <LockedPanel
                      title={lang === "en" ? "Edge vs market" : lang === "es" ? "Edge vs mercado" : "Edge vs mercado"}
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

      <UpgradeModal
        open={upgradeOpen}
        reason={upgradeReason}
        onClose={() => setUpgradeOpen(false)}
      />

    </div>
  );
}
