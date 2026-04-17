import React, { useEffect, useMemo, useState, useCallback } from "react";

import type {
  ProductEdgeSummary,
  ProductOddsBook,
  ProductOddsEvent,
  ProductOddsQuoteResponse,
  ProductOdds1x2,
} from "../../api/contracts";
import type { ProductLeagueItem } from "../../api/contracts";
import { productListLeagues, productListOddsEvents, productQuoteOdds } from "../../api/client";
import { t, type Lang } from "../i18n";
import { getLeagueDisplayName } from "../i18n/leagueCatalogHelpers";
import {
  useProductStore,
  type InternalNarrativeView,
} from "../state/productStore";
import type { NarrativeStyleId } from "../narrative/v2/core/types";
import { PlanChangeModal } from "../components/PlanChangeModal";

import { applyLeagueOverride } from "../config/leagueOverrides";

import { generateNarrativesForSport } from "../narrative/v2";
import type { PlanId } from "../entitlements";

import { SearchableMultiSelect } from "../components/SearchableMultiSelect";
import { ProductFiltersSheet } from "../components/ProductFiltersSheet";
import { SearchableSingleSelect } from "../components/SearchableSingleSelect";

import {
  buildBookOptions,
  buildCountryOptions,
  buildLeagueOptions,
  buildTeamOptions,
} from "../filters/productFilterOptions";

const UI_DEFAULTS = {
  hoursAheadFallback: 720,
  limit: 200,
  tolHoursFallback: 6,
};

type UpgradeReason = "NO_CREDITS" | "FEATURE_LOCKED";
type SortBy = "DATE" | "CONFIDENCE" | "EDGE";
type WindowMode = "UPCOMING" | "TODAY" | "3" | "7" | "30";

const MOBILE_ANALYSIS_BREAKPOINT = 980;
const UPCOMING_WINDOW_HOURS = 24;
const UPCOMING_FALLBACK_MAX_LEAGUES = 12;
const OPPORTUNITY_EDGE_THRESHOLD = 0.05;
const OPPORTUNITY_EV_THRESHOLD = 0.03;
const OPPORTUNITY_MIN_BOOKS = 4;
const OPPORTUNITY_MAX_FRESHNESS_SECONDS = 7 * 24 * 60 * 60;
const POSITIVE_EDGE_THRESHOLD = 0.02;
const NEUTRAL_EDGE_THRESHOLD = -0.02;

type AnalysisSectionKey = "probabilities" | "goals" | "oddsEdge";

const DEFAULT_ANALYSIS_SECTIONS_OPEN: Record<AnalysisSectionKey, boolean> = {
  probabilities: true,
  goals: false,
  oddsEdge: false,
};

const EVENT_FETCH_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) return;

      try {
        const value = await mapper(items[currentIndex], currentIndex);
        results[currentIndex] = { status: "fulfilled", value };
      } catch (reason) {
        results[currentIndex] = { status: "rejected", reason };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

function getCalendarDayBounds(reference = new Date()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);

  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function getUpcomingHorizonMs(nowMs: number) {
  return nowMs + UPCOMING_WINDOW_HOURS * 60 * 60 * 1000;
}

function getFetchHoursAheadForWindowMode(mode: WindowMode) {
  if (mode === "UPCOMING") return UI_DEFAULTS.hoursAheadFallback;

  if (mode === "TODAY") {
    const { end } = getCalendarDayBounds(new Date());
    const diffMs = Math.max(0, end.getTime() - Date.now());
    return Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)));
  }

  return Number(mode) * 24;
}

function narrativeStyleFromInternalView(
  view: InternalNarrativeView
): NarrativeStyleId | undefined {
  if (view === "RECREATIONAL") return "leve";
  if (view === "PROFESSIONAL") return "equilibrado";
  if (view === "CREATOR") return "pro";
  return undefined;
}

function fmtPct(x: number | null | undefined) {
  const v = typeof x === "number" && Number.isFinite(x) ? x : 0;
  return `${(v * 100).toFixed(1)}%`;
}

function fmtOutcome(outcome: "H" | "D" | "A" | null | undefined, home: string, away: string, lang: Lang) {
  if (!outcome) return "—";
  if (lang === "en") {
    if (outcome === "H") return `Home (${home})`;
    if (outcome === "D") return "Draw";
    return `Away (${away})`;
  }
  // pt + es
  if (outcome === "H") return `Casa (${home})`;
  if (outcome === "D") return "Empate";
  return `Fora (${away})`;
}

function edgeTier(edge: number | null | undefined) {
  if (edge == null || !Number.isFinite(edge)) return "none";
  if (edge >= OPPORTUNITY_EDGE_THRESHOLD) return "hot";
  if (edge >= POSITIVE_EDGE_THRESHOLD) return "ok";
  if (edge > NEUTRAL_EDGE_THRESHOLD) return "neutral";
  return "bad";
}

function fmtEdge(edge: number | null | undefined) {
  if (edge == null || !Number.isFinite(edge)) return "—";
  const pct = edge * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function fmtOdds(x: number | null | undefined) {
  if (x == null) return "—";
  const v = Number(x);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function fmtPctNullable(x: number | null | undefined) {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function probForOutcome(
  probs:
    | { H: number | null; D: number | null; A: number | null }
    | null
    | undefined,
  outcome: "H" | "D" | "A" | null | undefined
) {
  if (!probs || !outcome) return null;
  const value = probs[outcome];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function fairOddFromProb(prob: number | null | undefined) {
  if (prob == null || !Number.isFinite(prob) || prob <= 0) return null;
  return 1 / prob;
}

function fmtFreshnessSeconds(
  seconds: number | null | undefined,
  lang: "pt" | "en" | "es"
) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";

  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const hours = Math.floor(mins / 60);

  if (hours >= 1) {
    if (lang === "en") return `${hours}h ago`;
    if (lang === "es") return `hace ${hours} h`;
    return `há ${hours} h`;
  }

  if (mins >= 1) {
    if (lang === "en") return `${mins} min ago`;
    if (lang === "es") return `hace ${mins} min`;
    return `há ${mins} min`;
  }

  if (lang === "en") return "just now";
  if (lang === "es") return "justo ahora";
  return "agora";
}

function poissonProbAtLeastGoals(lam: number | null | undefined, minGoals: number) {
  if (
    lam == null ||
    !Number.isFinite(lam) ||
    !Number.isInteger(minGoals) ||
    minGoals < 1
  ) {
    return null;
  }

  let term = Math.exp(-lam); // P(0)
  let cumulative = term;

  for (let i = 1; i < minGoals; i += 1) {
    term = (term * lam) / i;
    cumulative += term;
  }

  const result = 1 - cumulative;
  return Math.max(0, Math.min(1, result));
}

function goalProbFromLambda(lam: number | null | undefined) {
  return poissonProbAtLeastGoals(lam, 1);
}

function bttsInsightLabel(lang: Lang, pYes: number | null | undefined) {
  if (pYes == null || !Number.isFinite(pYes)) return "—";

  if (pYes >= 0.62) {
    if (lang === "en") return "High chance";
    if (lang === "es") return "Alta probabilidad";
    return "Alta chance";
  }

  if (pYes >= 0.48) {
    if (lang === "en") return "Moderate chance";
    if (lang === "es") return "Probabilidad moderada";
    return "Chance moderada";
  }

  if (lang === "en") return "Low chance";
  if (lang === "es") return "Baja probabilidad";
  return "Baixa chance";
}

function bttsInsightHeadline(lang: Lang, pYes: number | null | undefined) {
  if (pYes == null || !Number.isFinite(pYes)) return "";

  if (pYes >= 0.62) {
    if (lang === "en") return "This matchup has a strong chance of both teams scoring.";
    if (lang === "es") return "Este partido tiene una buena probabilidad de gol de ambos equipos.";
    return "Esse confronto tem boa probabilidade de gol dos dois times.";
  }

  if (pYes >= 0.48) {
    if (lang === "en") return "There are reasonable signs of both teams scoring, but without a large margin.";
    if (lang === "es") return "Hay señales razonables de gol de ambos equipos, pero sin gran margen.";
    return "Há sinais razoáveis de gol para os dois times, mas sem grande folga.";
  }

  if (lang === "en") return "The current scenario does not favor both teams scoring.";
  if (lang === "es") return "El escenario actual no favorece el gol de ambos equipos.";
  return "O cenário atual não favorece gol dos dois times.";
}

function totalsInsightLabel(lang: Lang, pOver: number | null | undefined, pUnder: number | null | undefined) {
  const over = typeof pOver === "number" && Number.isFinite(pOver) ? pOver : null;
  const under = typeof pUnder === "number" && Number.isFinite(pUnder) ? pUnder : null;

  if (over == null && under == null) return "—";

  if (over != null && over >= 0.58) {
    if (lang === "en") return "Strong lean to over";
    if (lang === "es") return "Fuerte sesgo al over";
    return "Forte viés para over";
  }

  if (under != null && under >= 0.58) {
    if (lang === "en") return "Strong lean to under";
    if (lang === "es") return "Fuerte sesgo al under";
    return "Forte viés para under";
  }

  if (lang === "en") return "Balanced line";
  if (lang === "es") return "Línea equilibrada";
  return "Linha equilibrada";
}

function totalsInsightHeadline(
  lang: Lang,
  line: number | null | undefined,
  pOver: number | null | undefined,
  pUnder: number | null | undefined
) {
  const over = typeof pOver === "number" && Number.isFinite(pOver) ? pOver : null;
  const under = typeof pUnder === "number" && Number.isFinite(pUnder) ? pUnder : null;
  const mainLine = typeof line === "number" && Number.isFinite(line) ? line : null;

  if (over == null && under == null) return "";

  const lineText = mainLine != null ? mainLine.toFixed(1) : "—";

  if (over != null && over >= 0.58) {
    if (lang === "en") return `The model leans to over ${lineText} goals in this matchup.`;
    if (lang === "es") return `El modelo se inclina por over ${lineText} goles en este partido.`;
    return `O modelo aponta viés para over ${lineText} gols neste confronto.`;
  }

  if (under != null && under >= 0.58) {
    if (lang === "en") return `The model leans to under ${lineText} goals in this matchup.`;
    if (lang === "es") return `El modelo se inclina por under ${lineText} goles en este partido.`;
    return `O modelo aponta viés para under ${lineText} gols neste confronto.`;
  }

  if (lang === "en") return `The ${lineText} goals line looks balanced for this matchup.`;
  if (lang === "es") return `La línea de ${lineText} goles parece equilibrada para este partido.`;
  return `A linha de ${lineText} gols parece equilibrada para este confronto.`;
}

function pickBooksForDisplay(
  books: ProductOddsBook[] | null | undefined,
  planMax: number,
  showAffiliateLink: boolean
): { shown: ProductOddsBook[]; extra: number } {
  const list = Array.isArray(books) ? books : [];
  if (!list.length) return { shown: [], extra: 0 };

  const UI_MAX = 3;
  const planLimit = Math.max(1, planMax || 1);

  const sorted = sortBooksForSurface(list);

  // Respeita o que o plano permite (não “conta” books fora do entitlement)
  const allowed = sorted.slice(0, planLimit);

  // Cap visual fixo
  const shown = allowed.slice(0, Math.min(planLimit, UI_MAX));
  const extra = Math.max(0, allowed.length - shown.length);

  // Garantia: se existe afiliada e ela foi cortada do shown, força ela no topo
  if (showAffiliateLink) {
    const firstAffiliate = allowed.find((b) => !!b.is_affiliate);
    if (firstAffiliate && !shown.some((b) => b.key === firstAffiliate.key) && shown.length) {
      const withoutLast = shown.slice(0, shown.length - 1);
      return { shown: [firstAffiliate, ...withoutLast], extra };
    }
  }

  return { shown, extra };
}

function pickBooksForAnalysis(
  books: ProductOddsBook[] | null | undefined,
  planMax: number,
  showAffiliateLink: boolean
): { shown: ProductOddsBook[]; extra: number } {
  const list = Array.isArray(books) ? books : [];
  if (!list.length) return { shown: [], extra: 0 };

  const UI_MAX = 5; // análise: 5 casas + 1 chip "+x"
  const planLimit = Math.max(1, planMax || 1);

  const sorted = sortBooksForSurface(list);

  // respeita entitlement do plano
  const allowed = sorted.slice(0, planLimit);

  // cap visual (5)
  const shown = allowed.slice(0, Math.min(planLimit, UI_MAX));
  const extra = Math.max(0, allowed.length - shown.length);

  // garante afiliada no shown, se existir
  if (showAffiliateLink) {
    const firstAffiliate = allowed.find((b) => !!b.is_affiliate);
    if (firstAffiliate && !shown.some((b) => b.key === firstAffiliate.key) && shown.length) {
      const withoutLast = shown.slice(0, shown.length - 1);
      return { shown: [firstAffiliate, ...withoutLast], extra };
    }
  }

  return { shown, extra };
}

function fmtMoreBooks(extra: number, lang: Lang) {
  if (extra <= 0) return "";
  if (lang === "en") return `+${extra} books`;
  // pt + es
  return `+${extra} casas`;
}

function averageValidOdds(values: Array<number | null | undefined>) {
  const valid = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );

  if (!valid.length) return -Infinity;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function averageBookOdds(book: ProductOddsBook | null | undefined) {
  const odds = book?.odds_1x2;
  return averageValidOdds([odds?.H, odds?.D, odds?.A]);
}

function compareBooksForSurface(a: ProductOddsBook, b: ProductOddsBook) {
  const aPartner = a.is_affiliate ? 1 : 0;
  const bPartner = b.is_affiliate ? 1 : 0;

  if (aPartner !== bPartner) return bPartner - aPartner;

  const avgA = averageBookOdds(a);
  const avgB = averageBookOdds(b);

  if (avgA !== avgB) return avgB - avgA;

  return String(a.name ?? a.key).localeCompare(String(b.name ?? b.key));
}

function sortBooksForSurface(books: ProductOddsBook[] | null | undefined) {
  const list = Array.isArray(books) ? books : [];
  return [...list].sort(compareBooksForSurface);
}

function canOpenBooksModalForPlan(plan: PlanId) {
  return plan === "BASIC" || plan === "LIGHT" || plan === "PRO";
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

function fmtCountdownToIso(
  iso: string | null | undefined,
  nowMs: number
) {
  if (!iso) return "00:00";

  const targetMs = new Date(iso).getTime();
  if (!Number.isFinite(targetMs)) return "00:00";

  const diffMs = Math.max(0, targetMs - nowMs);
  const totalMinutes = Math.ceil(diffMs / 60000);

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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

function hasOpportunity(summary: ProductEdgeSummary | null | undefined) {
  const side = summary?.opportunity_outcome;
  const edge = summary?.opportunity_edge;
  const ev = summary?.opportunity_ev;
  const books =
    summary?.market_complete_books_count ??
    summary?.market_books_count ??
    0;
  const freshness = summary?.opportunity_book_freshness_seconds;

  return (
    (side === "H" || side === "D" || side === "A") &&
    typeof edge === "number" &&
    Number.isFinite(edge) &&
    typeof ev === "number" &&
    Number.isFinite(ev) &&
    edge >= OPPORTUNITY_EDGE_THRESHOLD &&
    ev >= OPPORTUNITY_EV_THRESHOLD &&
    books >= OPPORTUNITY_MIN_BOOKS &&
    (freshness == null || freshness <= OPPORTUNITY_MAX_FRESHNESS_SECONDS)
  );
}

function leagueDisplayName(league: ProductLeagueItem | null | undefined, lang: Lang) {
  if (!league) return "";

  const officialName = String(league.official_name ?? "").trim();
  if (officialName) return officialName;

  return (
    getLeagueDisplayName(league.sport_key, lang as "pt" | "en" | "es") ||
    league.sport_title ||
    league.sport_key
  );
}

function countryCodeToFlagEmoji(countryCode: string | null | undefined) {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌍";

  return String.fromCodePoint(
    ...Array.from(code).map((char) => 127397 + char.charCodeAt(0))
  );
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

function hasUsableAnalysisStatus(status: string | null | undefined) {
  return (
    status === "MODEL_FOUND" ||
    status === "EXACT" ||
    status === "PROBABLE"
  );
}

export default function ProductIndex() {
  const store = useProductStore();
  const lang = store.state.lang as Lang;
  const vis = store.entitlements.visibility;

  const plan = store.entitlements.plan as PlanId;

  const narrativeStyle = useMemo(
    () => narrativeStyleFromInternalView(store.internalNarrativeView),
    [store.internalNarrativeView]
  );

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>("NO_CREDITS");

  const [loadingEvents, setLoadingEvents] = useState(false);
  const [events, setEvents] = useState<ProductOddsEvent[]>([]);
  const [eventsError, setEventsError] = useState<string>("");

  // filtros
  const [leaguesLoading, setLeaguesLoading] = useState(false);
  const [leaguesError, setLeaguesError] = useState<string>("");
  const [leagues, setLeagues] = useState<
    Array<ProductLeagueItem & { assume_season: number; artifact_filename: string | null }>
  >([]);

  const [sportKey, setSportKey] = useState<string>("");
  const league = useMemo(() => {
    const list = leagues;
    if (!list.length) return null;
    return list.find((l) => l.sport_key === sportKey) ?? list[0];
  }, [leagues, sportKey]);

  const leaguesBySportKey = useMemo(() => {
    return new Map(leagues.map((item) => [item.sport_key, item]));
  }, [leagues]);

  const [windowMode, setWindowMode] = useState<WindowMode>("UPCOMING");
  const [sortBy, setSortBy] = useState<SortBy>("DATE");
  const [onlyOpportunities, setOnlyOpportunities] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCountryCodes, setSelectedCountryCodes] = useState<string[]>([]);
  const [selectedLeagueSportKeys, setSelectedLeagueSportKeys] = useState<string[]>([]);
  const [selectedBookKeys, setSelectedBookKeys] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);

  const countryOptions = useMemo(() => buildCountryOptions(leagues, lang), [leagues, lang]);

  const leagueOptions = useMemo(
    () => buildLeagueOptions(leagues, lang, selectedCountryCodes),
    [leagues, lang, selectedCountryCodes]
  );

  const bookOptions = useMemo(() => buildBookOptions(events), [events]);
  const teamOptions = useMemo(() => buildTeamOptions(events), [events]);

  const activeLeagueSportKeys = useMemo(() => {
    if (selectedLeagueSportKeys.length) return selectedLeagueSportKeys;

    if (selectedCountryCodes.length) {
      return leagueOptions.map((item) => item.value);
    }

    if (!leagues.length) return [];

    const now = new Date();
    const nowMs = now.getTime();
    const { start: todayStart, end: todayEnd } = getCalendarDayBounds(now);

    const eligible: string[] = [];
    const future: string[] = [];

    for (const item of leagues) {
      const kickoffRaw = item.next_kickoff_utc;
      if (!kickoffRaw) continue;

      const kickoffMs = new Date(kickoffRaw).getTime();
      if (!Number.isFinite(kickoffMs)) continue;
      if (kickoffMs < nowMs) continue;

      future.push(item.sport_key);

      if (windowMode === "UPCOMING") {
        if (kickoffMs <= getUpcomingHorizonMs(nowMs)) {
          eligible.push(item.sport_key);
        }
        continue;
      }

      if (windowMode === "TODAY") {
        if (kickoffMs >= todayStart.getTime() && kickoffMs <= todayEnd.getTime()) {
          eligible.push(item.sport_key);
        }
        continue;
      }

      const horizonMs = nowMs + Number(windowMode) * 24 * 60 * 60 * 1000;
      if (kickoffMs <= horizonMs) {
        eligible.push(item.sport_key);
      }
    }

    if (eligible.length) return eligible;

    if (windowMode === "UPCOMING") {
      return future.slice(0, UPCOMING_FALLBACK_MAX_LEAGUES);
    }

    return [];
  }, [selectedLeagueSportKeys, selectedCountryCodes, leagueOptions, leagues, windowMode]);

  const fetchLeagues = useMemo(() => {
    return activeLeagueSportKeys
      .map((key) => leaguesBySportKey.get(key))
      .filter(Boolean) as Array<
      ProductLeagueItem & { assume_season: number; artifact_filename: string | null }
    >;
  }, [activeLeagueSportKeys, leaguesBySportKey]);

  const hasActiveFilters =
    selectedCountryCodes.length > 0 ||
    selectedLeagueSportKeys.length > 0 ||
    selectedBookKeys.length > 0 ||
    selectedTeams.length > 0 ||
    onlyOpportunities;

  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const creditsResetCountdown = useMemo(() => {
    return fmtCountdownToIso(store.entitlements.credits.resets_at_iso, nowTick);
  }, [store.entitlements.credits.resets_at_iso, nowTick]);

  const [selectedId, setSelectedId] = useState<string>("");

  const [quoteLoading, setQuoteLoading] = useState(false);
  const [analysisOpening, setAnalysisOpening] = useState(false);
  const [quote, setQuote] = useState<ProductOddsQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string>("");

  const isAnalysisLoading = analysisOpening || quoteLoading;

  const [isMobileAnalysisView, setIsMobileAnalysisView] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= MOBILE_ANALYSIS_BREAKPOINT;
  });

  const [mobileAnalysisOpen, setMobileAnalysisOpen] = useState(false);
  const [booksModalEventId, setBooksModalEventId] = useState<string>("");

  const canOpenBooksModal = canOpenBooksModalForPlan(plan);

  function handleOpenBooksModal(eventItem: ProductOddsEvent) {
    setSelectedId(String(eventItem.event_id));
    clearQuoteUI();

    if (!canOpenBooksModal) {
      setUpgradeReason("FEATURE_LOCKED");
      setUpgradeOpen(true);
      return;
    }

    setBooksModalEventId(String(eventItem.event_id));
  }

  const [analysisSectionsOpen, setAnalysisSectionsOpen] = useState<Record<AnalysisSectionKey, boolean>>(
    () => ({ ...DEFAULT_ANALYSIS_SECTIONS_OPEN })
  );

  const toggleAnalysisSection = useCallback((key: AnalysisSectionKey) => {
    setAnalysisSectionsOpen((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const loadLeagues = useCallback(async () => {
    setLeaguesLoading(true);
    setLeaguesError("");
    try {
      const res = await productListLeagues();
      const items = (res?.items ?? []).map((l) => applyLeagueOverride(l));
      setLeagues(items);
      setSportKey((prev) => {
        if (prev && items.some((item) => item.sport_key === prev)) return prev;
        return items[0]?.sport_key ?? "";
      });
    } catch (e: any) {
      setLeaguesError(e?.message ?? "Failed to load leagues");
    } finally {
      setLeaguesLoading(false);
    }
  }, []);

  function clearAdvancedFilters() {
    setSelectedCountryCodes([]);
    setSelectedLeagueSportKeys([]);
    setSelectedBookKeys([]);
    setSelectedTeams([]);
    setOnlyOpportunities(false);
    setSortBy("DATE");
    setWindowMode("UPCOMING");
  }

  function renderOnlyOpportunitiesToggle(extraClassName = "") {
    return (
      <button
        type="button"
        className={`pi-toggle-inline ${onlyOpportunities ? "is-active" : ""} ${extraClassName}`.trim()}
        onClick={() => setOnlyOpportunities((prev) => !prev)}
        role="switch"
        aria-checked={onlyOpportunities}
      >
        <span className="pi-toggle-inline-copy">{t(lang, "odds.onlyOpportunities")}</span>

        <span className="pi-toggle-switch-track" aria-hidden="true">
          <span className="pi-toggle-switch-thumb" />
        </span>
      </button>
    );
  }

  function renderWindowDaysSelect(extraClassName = "") {
    const label =
      lang === "en" ? "Window" : lang === "es" ? "Ventana" : "Janela";

    return (
      <SearchableSingleSelect
        className={extraClassName}
        label={label}
        placeholder={t(lang, "odds.filterWindow")}
        searchPlaceholder={
          lang === "en"
            ? "Search window"
            : lang === "es"
            ? "Buscar ventana"
            : "Buscar janela"
        }
        emptyText={
          lang === "en"
            ? "No options found"
            : lang === "es"
            ? "No se encontraron opciones"
            : "Nenhuma opção encontrada"
        }
        selectedValue={windowMode}
        options={[
          { value: "UPCOMING", label: t(lang, "odds.windowUpcoming") },
          { value: "TODAY", label: t(lang, "odds.windowToday") },
          { value: "3", label: t(lang, "odds.window3d") },
          { value: "7", label: t(lang, "odds.window7d") },
          { value: "30", label: t(lang, "odds.window30d") },
        ]}
        onChange={(next) => setWindowMode(next as WindowMode)}
      />
    );
  }

  function renderSortSelect(extraClassName = "") {
    const label =
      lang === "en" ? "Sort by" : lang === "es" ? "Ordenar por" : "Ordenar por";

    return (
      <SearchableSingleSelect
        className={extraClassName}
        label={label}
        placeholder={t(lang, "odds.sortBy")}
        searchPlaceholder={
          lang === "en"
            ? "Search sort"
            : lang === "es"
            ? "Buscar ordenación"
            : "Buscar ordenação"
        }
        emptyText={
          lang === "en"
            ? "No options found"
            : lang === "es"
            ? "No se encontraron opciones"
            : "Nenhuma opção encontrada"
        }
        selectedValue={sortBy}
        options={[
          {
            value: "DATE",
            label:
              lang === "en"
                ? "Closest date"
                : lang === "es"
                ? "Fecha más próxima"
                : "Data mais próxima",
          },
          {
            value: "CONFIDENCE",
            label:
              lang === "en"
                ? "Highest confidence"
                : lang === "es"
                ? "Mayor confianza"
                : "Maior confiança",
          },
          {
            value: "EDGE",
            label:
              lang === "en"
                ? "Highest edge"
                : lang === "es"
                ? "Mayor edge"
                : "Maior edge",
          },
        ]}
        onChange={(next) => setSortBy(next as SortBy)}
      />
    );
  }

  function compactSelectedLabel(label: string) {
    const cleaned = String(label ?? "")
      .replace(/^\d+\.\s*/, "")
      .trim();

    if (cleaned.length <= 18) return cleaned;
    return `${cleaned.slice(0, 18).trim()}…`;
  }

  function buildSelectedSummary(
    type: "country" | "league" | "book" | "team",
    selectedOptions: Array<{ label: string }>,
    placeholder: string
  ) {
    if (!selectedOptions.length) return placeholder;

    if (selectedOptions.length === 1) {
      return compactSelectedLabel(selectedOptions[0].label);
    }

    if (lang === "en") {
      if (type === "country") return `${selectedOptions.length} countries`;
      if (type === "league") return `${selectedOptions.length} leagues`;
      if (type === "book") return `${selectedOptions.length} books`;
      return `${selectedOptions.length} teams`;
    }

    if (lang === "es") {
      if (type === "country") return `${selectedOptions.length} países`;
      if (type === "league") return `${selectedOptions.length} ligas`;
      if (type === "book") return `${selectedOptions.length} casas`;
      return `${selectedOptions.length} equipos`;
    }

    if (type === "country") return `${selectedOptions.length} países`;
    if (type === "league") return `${selectedOptions.length} ligas`;
    if (type === "book") return `${selectedOptions.length} casas`;
    return `${selectedOptions.length} times`;
  }

  useEffect(() => {
    const allowed = new Set(leagueOptions.map((item) => item.value));
    setSelectedLeagueSportKeys((prev) => prev.filter((item) => allowed.has(item)));
  }, [leagueOptions]);

  useEffect(() => {
    const allowed = new Set(bookOptions.map((item) => item.value));
    setSelectedBookKeys((prev) => prev.filter((item) => allowed.has(item)));
  }, [bookOptions]);

  useEffect(() => {
    const allowed = new Set(teamOptions.map((item) => item.value));
    setSelectedTeams((prev) => prev.filter((item) => allowed.has(item)));
  }, [teamOptions]);

  const loadEvents = useCallback(async () => {
    if (!fetchLeagues.length) {
      setEvents([]);
      setSelectedId("");
      setQuote(null);
      setQuoteError("");
      setLastLoadedAt(Date.now());
      return;
    }

    setLoadingEvents(true);
    setEventsError("");

    try {
      const hoursAhead = getFetchHoursAheadForWindowMode(windowMode);

      const settled = await mapWithConcurrency(
        fetchLeagues,
        EVENT_FETCH_CONCURRENCY,
        async (cfg) => {
          const res = await productListOddsEvents({
            sport_key: cfg.sport_key,
            hours_ahead: hoursAhead,
            limit: UI_DEFAULTS.limit,
            assume_league_id: cfg.league_id,
            assume_season: cfg.assume_season,
            artifact_filename: cfg.artifact_filename ?? undefined,
          });

          return res?.events ?? [];
        }
      );

      const merged = new Map<string, ProductOddsEvent>();
      let fulfilledCount = 0;
      let firstError: any = null;

      for (const result of settled) {
        if (result.status === "fulfilled") {
          fulfilledCount += 1;
          for (const item of result.value) {
            merged.set(String(item.event_id), item);
          }
          continue;
        }

        firstError = firstError ?? result.reason;
        console.warn("[product/index] failed to load one league batch", result.reason);
      }

      if (fulfilledCount === 0 && firstError) {
        throw firstError;
      }

      setEvents(Array.from(merged.values()));
      setLastLoadedAt(Date.now());
    } catch (e: any) {
      setEventsError(e?.message ?? "Failed to load events");
    } finally {
      setLoadingEvents(false);
    }
  }, [fetchLeagues, windowMode]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncViewportMode = () => {
      const isMobile = window.innerWidth <= MOBILE_ANALYSIS_BREAKPOINT;
      setIsMobileAnalysisView(isMobile);

      if (!isMobile) {
        setMobileAnalysisOpen(false);
      }
    };

    syncViewportMode();
    window.addEventListener("resize", syncViewportMode);

    return () => {
      window.removeEventListener("resize", syncViewportMode);
    };
  }, []);

  useEffect(() => {
    if (!isMobileAnalysisView || !mobileAnalysisOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileAnalysisView, mobileAnalysisOpen]);

  useEffect(() => {
    if (!mobileAnalysisOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileAnalysisOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileAnalysisOpen]);

  async function runQuote(eventId: string) {
    if (!league) return;
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError("");

    const eventIdStr = String(eventId ?? "").trim();
    if (!eventIdStr) {
      setQuoteLoading(false);
      setQuoteError("Invalid event_id");
      return;
    }

    try {
      const selectedEvent = visibleEvents.find((e) => String(e.event_id) === eventIdStr);

      const quoteLeague = selectedEvent
        ? leaguesBySportKey.get(selectedEvent.sport_key) ?? league
        : league;

      if (!quoteLeague) {
        setQuoteLoading(false);
        setQuoteError("League context not found");
        return;
      }

      // Snapshot-first:
      // se já temos modelo no /product/index, não bloquear a experiência
      // só porque o quote legado ainda depende de artifact antigo.
      if (!quoteLeague.artifact_filename) {
        if (selectedEvent?.match_status === "MODEL_FOUND") {
          setQuote(null);
          return;
        }
        setQuoteError(t(lang, "narrative.v1.headline.noModel"));
        return;
      }

      const res = await productQuoteOdds({
        assume_league_id: Number(quoteLeague.league_id),
        assume_season: Number(quoteLeague.assume_season),
        artifact_filename: quoteLeague.artifact_filename ?? undefined,
        tol_hours: Number(UI_DEFAULTS.tolHoursFallback),
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

  function handleSelectEvent(eventId: string) {
    setSelectedId(String(eventId));
    clearQuoteUI();

    if (isMobileAnalysisView) {
      setMobileAnalysisOpen(true);
    }
  }

  async function onRevealAndOpen() {
    if (!selectedId) return;

    const ev = visibleEvents.find((e) => String(e.event_id) === String(selectedId));
    const hasAnalysis =
      ev?.match_status === "MODEL_FOUND" ||
      ev?.match_status === "EXACT" ||
      ev?.match_status === "PROBABLE";

    if (ev && !hasAnalysis) {
      setQuoteError(t(lang, "errors.matchUnreliable"));
      return;
    }

    const fixtureKey = String(selectedId);

    setAnalysisOpening(true);

    try {
      const r = store.backendUsage.is_ready
        ? await store.revealViaBackend(fixtureKey)
        : store.tryReveal(fixtureKey);

      if (!r.ok) {
        if (r.reason === "NO_CREDITS") {
          setUpgradeReason("NO_CREDITS");
          setUpgradeOpen(true);
          return;
        }

        if (r.reason !== "ALREADY_REVEALED") {
          console.error("Reveal failed:", r.reason);
          return;
        }
      }

      await runQuote(fixtureKey);
    } finally {
      setAnalysisOpening(false);
    }
  }

  useEffect(() => {
    loadLeagues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // lista visível (filtro client-side)
  const visibleEventsState = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const { start: todayStart, end: todayEnd } = getCalendarDayBounds(now);

    const selectedBookSet = selectedBookKeys.length ? new Set(selectedBookKeys) : null;
    const selectedTeamSet = selectedTeams.length ? new Set(selectedTeams) : null;

    const futureFiltered = events.filter((e) => {
      const kickoffRaw = e.commence_time_utc;
      if (!kickoffRaw) return false;

      const kickoff = new Date(kickoffRaw);
      if (Number.isNaN(kickoff.getTime())) return false;
      if (kickoff.getTime() < nowMs) return false;

      if (!hasUsableAnalysisStatus(e.match_status)) return false;

      if (selectedTeamSet) {
        const home = String(e.home_name ?? "");
        const away = String(e.away_name ?? "");
        if (!selectedTeamSet.has(home) && !selectedTeamSet.has(away)) return false;
      }

      if (selectedBookSet) {
        const books = Array.isArray(e.odds_books) ? e.odds_books : [];
        const hasSelectedBook = books.some((book) => selectedBookSet.has(String(book.key ?? "")));
        if (!hasSelectedBook) return false;
      }

      if (onlyOpportunities && !hasOpportunity(e.edge_summary)) {
        return false;
      }

      return true;
    });

    let scoped = futureFiltered;
    let useUpcomingFallback = false;

    if (windowMode === "UPCOMING") {
      const horizonMs = getUpcomingHorizonMs(nowMs);
      const withinUpcoming = futureFiltered.filter((e) => {
        const kickoffRaw = e.commence_time_utc;
        if (!kickoffRaw) return false;
        const kickoffMs = new Date(kickoffRaw).getTime();
        return Number.isFinite(kickoffMs) && kickoffMs <= horizonMs;
      });

      if (withinUpcoming.length) {
        scoped = withinUpcoming;
      } else {
        scoped = futureFiltered;
        useUpcomingFallback = futureFiltered.length > 0;
      }
    } else if (windowMode === "TODAY") {
      scoped = futureFiltered.filter((e) => {
        const kickoffRaw = e.commence_time_utc;
        if (!kickoffRaw) return false;
        const kickoffMs = new Date(kickoffRaw).getTime();
        return Number.isFinite(kickoffMs) && kickoffMs >= todayStart.getTime() && kickoffMs <= todayEnd.getTime();
      });
    } else {
      const horizonMs = nowMs + Number(windowMode) * 24 * 60 * 60 * 1000;
      scoped = futureFiltered.filter((e) => {
        const kickoffRaw = e.commence_time_utc;
        if (!kickoffRaw) return false;
        const kickoffMs = new Date(kickoffRaw).getTime();
        return Number.isFinite(kickoffMs) && kickoffMs <= horizonMs;
      });
    }

    const effectiveSortBy: SortBy = useUpcomingFallback ? "DATE" : sortBy;
    const list = [...scoped];

    if (effectiveSortBy === "DATE") {
      list.sort(
        (a, b) => new Date(a.commence_time_utc ?? "").getTime() - new Date(b.commence_time_utc ?? "").getTime()
      );
    } else if (effectiveSortBy === "CONFIDENCE") {
      list.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
    } else {
      list.sort((a, b) => {
        const edgeA = a.edge_summary?.best_edge;
        const edgeB = b.edge_summary?.best_edge;

        const safeA = typeof edgeA === "number" && Number.isFinite(edgeA) ? edgeA : -Infinity;
        const safeB = typeof edgeB === "number" && Number.isFinite(edgeB) ? edgeB : -Infinity;

        if (safeA !== safeB) return safeB - safeA;

        return new Date(a.commence_time_utc ?? "").getTime() - new Date(b.commence_time_utc ?? "").getTime();
      });
    }

    return {
      items: list,
      useUpcomingFallback,
    };
  }, [events, windowMode, sortBy, selectedBookKeys, selectedTeams, onlyOpportunities]);

  const visibleEvents = visibleEventsState.items;
  const isUpcomingFallbackActive = visibleEventsState.useUpcomingFallback;

  const booksModalEvent = useMemo(() => {
    const targetId = String(booksModalEventId ?? "").trim();
    if (!targetId) return null;

    return (
      visibleEvents.find((item) => String(item.event_id) === targetId) ??
      events.find((item) => String(item.event_id) === targetId) ??
      null
    );
  }, [booksModalEventId, visibleEvents, events]);

  const booksModalList = useMemo(() => {
    return sortBooksForSurface(booksModalEvent?.odds_books);
  }, [booksModalEvent]);

  const showTodayEmptyNotice = useMemo(() => {
    if (windowMode !== "TODAY") return false;
    if (loadingEvents || !!eventsError || visibleEvents.length > 0) return false;

    const { end } = getCalendarDayBounds(new Date());

    return leagues.some((item) => {
      const kickoffRaw = item.next_kickoff_utc;
      if (!kickoffRaw) return false;

      const kickoffMs = new Date(kickoffRaw).getTime();
      return Number.isFinite(kickoffMs) && kickoffMs > end.getTime();
    });
  }, [windowMode, loadingEvents, eventsError, visibleEvents.length, leagues]);

  // só mantém a seleção se o usuário já tinha uma seleção anterior.
  // Não auto-seleciona no primeiro load.
  useEffect(() => {
    if (!visibleEvents.length) return;
    if (!selectedId) return;

    const stillExists = visibleEvents.some((e) => String(e.event_id) === String(selectedId));

    if (!stillExists) {
      const firstGood =
        visibleEvents.find(
          (e) =>
            e.match_status === "MODEL_FOUND" ||
            e.match_status === "EXACT" ||
            e.match_status === "PROBABLE"
        ) ?? visibleEvents[0];

      setSelectedId(String(firstGood.event_id));
      clearQuoteUI();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents, selectedId]);

  useEffect(() => {
    setAnalysisSectionsOpen({ ...DEFAULT_ANALYSIS_SECTIONS_OPEN });
  }, [selectedId]);

  const selected = useMemo(
    () => visibleEvents.find((e) => String(e.event_id) === String(selectedId)) ?? null,
    [visibleEvents, selectedId]
  );

  const selectedAllBooks = useMemo(() => {
    return sortBooksForSurface(selected?.odds_books);
  }, [selected]);

  const { shown: analysisPreviewBooks } = useMemo(() => {
    return pickBooksForAnalysis(
      selectedAllBooks,
      vis.odds.books_count,
      vis.odds.show_affiliate_link
    );
  }, [selectedAllBooks, vis.odds.books_count, vis.odds.show_affiliate_link]);

  const analysisHiddenBooksCount = useMemo(() => {
    return Math.max(0, selectedAllBooks.length - analysisPreviewBooks.length);
  }, [selectedAllBooks.length, analysisPreviewBooks.length]);

  const selectedProbs = useMemo(() => {
    if (!selected?.probs_1x2) return null;
    return {
      H: selected.probs_1x2.H ?? null,
      D: selected.probs_1x2.D ?? null,
      A: selected.probs_1x2.A ?? null,
    };
  }, [selected]);

  const effectiveProbs = quote?.probs ?? selectedProbs ?? null;

  const effectiveMatchStatus = quote?.matchup?.status ?? selected?.match_status ?? null;
  const effectiveConfidence =
    quote?.matchup?.confidence ??
    (selected?.match_status === "MODEL_FOUND" ? 1 : 0);

  const selectedSnapshot = selected?.snapshot_summary ?? null;

  const totalsLine = selectedSnapshot?.totals?.line ?? null;
  const totalsOver = selectedSnapshot?.totals?.p_over ?? null;
  const totalsUnder = selectedSnapshot?.totals?.p_under ?? null;

  const bttsYes = selectedSnapshot?.btts?.p_yes ?? null;
  const bttsNo = selectedSnapshot?.btts?.p_no ?? null;

  const lambdaHome = selectedSnapshot?.inputs?.lambda_home ?? null;
  const lambdaAway = selectedSnapshot?.inputs?.lambda_away ?? null;
  const lambdaTotal = selectedSnapshot?.inputs?.lambda_total ?? null;

  const homeGoalProb = goalProbFromLambda(lambdaHome);
  const awayGoalProb = goalProbFromLambda(lambdaAway);

  const homeOver15Prob = poissonProbAtLeastGoals(lambdaHome, 2);
  const awayOver15Prob = poissonProbAtLeastGoals(lambdaAway, 2);

  const hasTotalsInsight =
    (typeof totalsLine === "number" && Number.isFinite(totalsLine)) ||
    (typeof totalsOver === "number" && Number.isFinite(totalsOver)) ||
    (typeof totalsUnder === "number" && Number.isFinite(totalsUnder));

  const hasBttsInsight =
    typeof bttsYes === "number" &&
    Number.isFinite(bttsYes) &&
    (
      typeof homeGoalProb === "number" ||
      typeof awayGoalProb === "number" ||
      typeof bttsNo === "number"
    );

  const hasTeamGoalsInsight =
    (typeof homeGoalProb === "number" && Number.isFinite(homeGoalProb)) ||
    (typeof awayGoalProb === "number" && Number.isFinite(awayGoalProb)) ||
    (typeof homeOver15Prob === "number" && Number.isFinite(homeOver15Prob)) ||
    (typeof awayOver15Prob === "number" && Number.isFinite(awayOver15Prob));

  const hasGoalsMarketInsight =
    hasTotalsInsight || hasBttsInsight || hasTeamGoalsInsight;

  const hasEffectiveAnalysis =
    !!effectiveProbs ||
    effectiveMatchStatus === "MODEL_FOUND" ||
    !!selected?.has_model;

  const key = selectedId ? String(selectedId) : "";
  const alreadyRevealed = key ? store.isRevealed(key) : false;
  const canReveal = key ? store.canReveal(key) : false;

  const analysisOpened =
    alreadyRevealed ||
    isAnalysisLoading ||
    !!quote ||
    !!quoteError;

  function renderAnalysisPane() {
    return (
      <>
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

                  {(() => {
                    const hasOpportunityFlag = hasOpportunity(selected.edge_summary);
                    if (!hasOpportunityFlag) return null;

                    return (
                      <span className="pi-opportunity">
                        {t(lang, "odds.opportunityDetected")}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div className="pi-cta-wrap">
                <button
                  className="pi-btn"
                  onClick={onRevealAndOpen}
                  disabled={!selectedId || isAnalysisLoading}
                  title={!canReveal && !alreadyRevealed ? t(lang, "errors.noCredits") : ""}
                >
                  {isAnalysisLoading
                    ? (lang === "en"
                        ? "Loading analysis..."
                        : lang === "es"
                        ? "Cargando análisis..."
                        : "Carregando análise...")
                    : t(lang, "credits.viewAnalysis")}
                </button>

                {!alreadyRevealed ? (
                  <div className="pi-cta-sub">
                    ({t(lang, "credits.oneCredit")})
                  </div>
                ) : null}
              </div>
            </div>

            {quoteError ? <div className="pi-error">{quoteError}</div> : null}

            {!analysisOpened ? (
              <div className="pi-muted">{t(lang, "odds.revealHint")}</div>
            ) : !quote && !hasEffectiveAnalysis ? (
              <div className="pi-muted">{t(lang, "odds.revealHint")}</div>
            ) : (
              <>
                {/* ===== Narrativa (destaque) ===== */}
                {(() => {
                  const oddsBest =
                    quote?.odds?.best
                      ? {
                          H: quote.odds.best.H ?? null,
                          D: quote.odds.best.D ?? null,
                          A: quote.odds.best.A ?? null,
                        }
                      : selected?.odds_best
                      ? {
                          H: selected.odds_best.H ?? null,
                          D: selected.odds_best.D ?? null,
                          A: selected.odds_best.A ?? null,
                        }
                      : null;

                  const narrativeBundle = generateNarrativesForSport({
                    sportKey: selected.sport_key || sportKey || "football",
                    lang,
                    plan,
                    style: narrativeStyle,
                    eventId: selected.event_id,
                    match: {
                      homeTeam: selected.home_name,
                      awayTeam: selected.away_name,
                    },
                    model: {
                      probs1x2: effectiveProbs,
                      status: effectiveMatchStatus,
                    },
                    market: {
                      odds1x2Best: oddsBest,
                      totals: {
                        line: totalsLine,
                        pOver: totalsOver,
                        pUnder: totalsUnder,
                      },
                      btts: {
                        pYes: bttsYes,
                        pNo: bttsNo,
                      },
                      inputs: {
                        lambdaHome,
                        lambdaAway,
                        lambdaTotal,
                      },
                    },
                  });

                  const narrative = narrativeBundle.main;
                  const headline = narrative?.blocks.find((b) => b.type === "headline");
                  const summary = narrative?.blocks.find((b) => b.type === "summary");
                  const price = narrative?.blocks.find((b) => b.type === "price");
                  const pricePro = narrative?.blocks.find((b) => b.type === "pricePro");
                  const bullets = narrative?.blocks.filter((b) => b.type === "bullet") ?? [];
                  const warning = narrative?.blocks.find((b) => b.type === "warning");
                  const disclaimer = narrative?.blocks.find((b) => b.type === "disclaimer");

                  return (
                    <div className="pi-narrative">
                      {headline ? <div className="pi-narrative-head">{headline.text}</div> : null}
                      {summary ? <div className="pi-narrative-summary">{summary.text}</div> : null}
                      {price ? <div className="pi-narrative-price">{price.text}</div> : null}
                      {pricePro ? <div className="pi-narrative-pricepro">{pricePro.text}</div> : null}

                      {bullets.length ? (
                        <ul className="pi-narrative-bullets">
                          {bullets.map((b, i) => (
                            <li key={i}>{b.text}</li>
                          ))}
                        </ul>
                      ) : null}

                      {warning ? <div className="pi-narrative-warn">{warning.text}</div> : null}
                      {disclaimer ? (
                        <div className="pi-narrative-disclaimer">{disclaimer.text}</div>
                      ) : null}
                    </div>
                  );
                })()}

                {/* ===== Painéis técnicos com accordions no mobile ===== */}


                <div className="pi-technical-sections">
                  <section className={`pi-accordion ${analysisSectionsOpen.probabilities ? "is-open" : ""}`}>
                    <button
                      type="button"
                      className="pi-accordion-header"
                      onClick={() => toggleAnalysisSection("probabilities")}
                      aria-expanded={analysisSectionsOpen.probabilities}
                    >
                      <span className="pi-accordion-title">
                        {lang === "en"
                          ? "Odds & opportunity"
                          : lang === "es"
                          ? "Cuotas y oportunidad"
                          : "Odds e oportunidade"}
                      </span>
                      <span className="pi-accordion-icon" aria-hidden="true">
                        {analysisSectionsOpen.probabilities ? "−" : "+"}
                      </span>
                    </button>

                    <div className={`pi-accordion-content ${analysisSectionsOpen.probabilities ? "is-open" : ""}`}>
                      <div className="pi-panels">
                        <div className="pi-panel pi-panel-probabilities">
                          <div className="pi-panel-label">{t(lang, "matchup.probabilities")}</div>
                          {effectiveProbs ? (
                            <div className="pi-panel-value">
                              H {fmtPct(effectiveProbs.H)} <br />
                              D {fmtPct(effectiveProbs.D)} <br />
                              A {fmtPct(effectiveProbs.A)}
                            </div>
                          ) : (
                            <div className="pi-muted">{t(lang, "matchup.noProbs")}</div>
                          )}
                        </div>

                        {vis.context.show_confidence_level ? (
                          <div className="pi-panel">
                            <div className="pi-panel-label">{t(lang, "matchup.confidence")}</div>
                            <div className="pi-panel-value">{fmtPct(effectiveConfidence)}</div>
                            <div className="pi-muted">
                              {t(lang, "matchup.status")}: <b>{effectiveMatchStatus ?? "—"}</b>
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
                      </div>
                    </div>
                  </section>

                  {hasGoalsMarketInsight ? (
                    <section className={`pi-accordion ${analysisSectionsOpen.goals ? "is-open" : ""}`}>
                      <button
                        type="button"
                        className="pi-accordion-header"
                        onClick={() => toggleAnalysisSection("goals")}
                        aria-expanded={analysisSectionsOpen.goals}
                      >
                        <span className="pi-accordion-title">
                          {lang === "en"
                            ? "Goals markets"
                            : lang === "es"
                            ? "Mercados de goles"
                            : "Mercados de gols"}
                        </span>
                        <span className="pi-accordion-icon" aria-hidden="true">
                          {analysisSectionsOpen.goals ? "−" : "+"}
                        </span>
                      </button>

                      <div className={`pi-accordion-content ${analysisSectionsOpen.goals ? "is-open" : ""}`}>
                        <div className="pi-panel pi-panel-goals">
                          <div className="pi-panel-label">
                            {lang === "en"
                              ? "Goals markets"
                              : lang === "es"
                              ? "Mercados de goles"
                              : "Mercados de Gols"}
                          </div>

                          {(() => {
                            const goalsNarrative = generateNarrativesForSport({
                              sportKey: selected.sport_key || sportKey || "football",
                              lang,
                              plan,
                              style: narrativeStyle,                              
                              eventId: selected.event_id,
                              match: {
                                homeTeam: selected.home_name,
                                awayTeam: selected.away_name,
                              },
                              model: {
                                probs1x2: effectiveProbs,
                                status: effectiveMatchStatus,
                              },
                              market: {
                                odds1x2Best: quote?.odds?.best
                                  ? {
                                      H: quote.odds.best.H ?? null,
                                      D: quote.odds.best.D ?? null,
                                      A: quote.odds.best.A ?? null,
                                    }
                                  : selected.odds_best
                                  ? {
                                      H: selected.odds_best.H ?? null,
                                      D: selected.odds_best.D ?? null,
                                      A: selected.odds_best.A ?? null,
                                    }
                                  : null,
                                totals: {
                                  line: totalsLine,
                                  pOver: totalsOver,
                                  pUnder: totalsUnder,
                                },
                                btts: {
                                  pYes: bttsYes,
                                  pNo: bttsNo,
                                },
                                inputs: {
                                  lambdaHome,
                                  lambdaAway,
                                  lambdaTotal,
                                },
                              },
                            }).goals;

                            const goalsHeadline = goalsNarrative?.blocks.find((b) => b.type === "headline")?.text;
                            const goalsSummary = goalsNarrative?.blocks.find((b) => b.type === "summary")?.text;

                            return (
                              <>
                                <div className="pi-panel-value">
                                  {goalsHeadline ??
                                    (hasTotalsInsight
                                      ? totalsInsightLabel(lang, totalsOver, totalsUnder)
                                      : bttsInsightLabel(lang, bttsYes))}
                                </div>

                                <div className="pi-muted" style={{ marginTop: 6 }}>
                                  {goalsSummary ??
                                    (hasTotalsInsight
                                      ? totalsInsightHeadline(lang, totalsLine, totalsOver, totalsUnder)
                                      : bttsInsightHeadline(lang, bttsYes))}
                                </div>
                              </>
                            );
                          })()}

                          <div className="pi-goals-kpis">
                            {typeof totalsOver === "number" ? (
                              <div className="pi-goals-kpi">
                                <span className="pi-goals-kpi-label">
                                  {lang === "en"
                                    ? `Over ${typeof totalsLine === "number" ? totalsLine.toFixed(1) : "2.5"}`
                                    : lang === "es"
                                    ? `Over ${typeof totalsLine === "number" ? totalsLine.toFixed(1) : "2.5"}`
                                    : `Over ${typeof totalsLine === "number" ? totalsLine.toFixed(1) : "2.5"}`}
                                </span>
                                <strong>{fmtPctNullable(totalsOver)}</strong>
                              </div>
                            ) : null}

                            {typeof bttsYes === "number" ? (
                              <div className="pi-goals-kpi">
                                <span className="pi-goals-kpi-label">BTTS</span>
                                <strong>{fmtPctNullable(bttsYes)}</strong>
                              </div>
                            ) : null}

                            {typeof homeGoalProb === "number" ? (
                              <div className="pi-goals-kpi">
                                <span className="pi-goals-kpi-label">
                                  {lang === "en"
                                    ? "Home scores"
                                    : lang === "es"
                                    ? "Local marca"
                                    : "Casa marca"}
                                </span>
                                <strong>{fmtPctNullable(homeGoalProb)}</strong>
                              </div>
                            ) : null}

                            {typeof awayGoalProb === "number" ? (
                              <div className="pi-goals-kpi">
                                <span className="pi-goals-kpi-label">
                                  {lang === "en"
                                    ? "Away scores"
                                    : lang === "es"
                                    ? "Visitante marca"
                                    : "Fora marca"}
                                </span>
                                <strong>{fmtPctNullable(awayGoalProb)}</strong>
                              </div>
                            ) : null}
                          </div>

                          <div className="pi-goals-sections">
                            {hasTotalsInsight ? (
                              <div className="pi-goals-section">
                                <div className="pi-goals-section-title">
                                  {lang === "en"
                                    ? "Match totals"
                                    : lang === "es"
                                    ? "Totales del partido"
                                    : "Totais do jogo"}
                                </div>

                                <div className="pi-goals-grid">
                                  <div className="pi-goals-line">
                                    <span>
                                      {lang === "en"
                                        ? "Main line"
                                        : lang === "es"
                                        ? "Línea principal"
                                        : "Linha principal"}
                                    </span>
                                    <strong>
                                      {typeof totalsLine === "number" && Number.isFinite(totalsLine)
                                        ? totalsLine.toFixed(1)
                                        : "—"}
                                    </strong>
                                  </div>

                                  <div className="pi-goals-line">
                                    <span>Over</span>
                                    <strong>{fmtPctNullable(totalsOver)}</strong>
                                  </div>

                                  <div className="pi-goals-line">
                                    <span>Under</span>
                                    <strong>{fmtPctNullable(totalsUnder)}</strong>
                                  </div>

                                  <div className="pi-goals-line">
                                    <span>xG total</span>
                                    <strong>{fmtOdds(lambdaTotal)}</strong>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {hasBttsInsight ? (
                              <div className="pi-goals-section">
                                <div className="pi-goals-section-title">BTTS</div>

                                <div className="pi-goals-grid">
                                  <div className="pi-goals-line">
                                    <span>
                                      {lang === "en"
                                        ? "BTTS Yes"
                                        : lang === "es"
                                        ? "Ambos marcan"
                                        : "Ambos marcam"}
                                    </span>
                                    <strong>{fmtPctNullable(bttsYes)}</strong>
                                  </div>

                                  <div className="pi-goals-line">
                                    <span>
                                      {lang === "en"
                                        ? "BTTS No"
                                        : lang === "es"
                                        ? "Ambos no marcan"
                                        : "Ambos não marcam"}
                                    </span>
                                    <strong>{fmtPctNullable(bttsNo)}</strong>
                                  </div>
                                </div>

                                <div className="pi-muted" style={{ marginTop: 8 }}>
                                  {bttsInsightHeadline(lang, bttsYes)}
                                </div>
                              </div>
                            ) : null}

                            {hasTeamGoalsInsight ? (
                              <div className="pi-goals-section">
                                <div className="pi-goals-section-title">
                                  {lang === "en"
                                    ? "Goals by team"
                                    : lang === "es"
                                    ? "Goles por equipo"
                                    : "Gols por equipe"}
                                </div>

                                <div className="pi-goals-grid">
                                  <div className="pi-goals-line">
                                    <span>
                                      {lang === "en"
                                        ? `${selected.home_name} scores`
                                        : lang === "es"
                                        ? `${selected.home_name} marca`
                                        : `${selected.home_name} marca`}
                                    </span>
                                    <strong>{fmtPctNullable(homeGoalProb)}</strong>
                                  </div>

                                  <div className="pi-goals-line">
                                    <span>
                                      {lang === "en"
                                        ? `${selected.home_name} over 1.5`
                                        : lang === "es"
                                        ? `${selected.home_name} over 1.5`
                                        : `${selected.home_name} over 1.5`}
                                    </span>
                                    <strong>{fmtPctNullable(homeOver15Prob)}</strong>
                                  </div>

                                  <div className="pi-goals-line">
                                    <span>
                                      {lang === "en"
                                        ? `${selected.away_name} scores`
                                        : lang === "es"
                                        ? `${selected.away_name} marca`
                                        : `${selected.away_name} marca`}
                                    </span>
                                    <strong>{fmtPctNullable(awayGoalProb)}</strong>
                                  </div>

                                  <div className="pi-goals-line">
                                    <span>
                                      {lang === "en"
                                        ? `${selected.away_name} over 1.5`
                                        : lang === "es"
                                        ? `${selected.away_name} over 1.5`
                                        : `${selected.away_name} over 1.5`}
                                    </span>
                                    <strong>{fmtPctNullable(awayOver15Prob)}</strong>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {analysisPreviewBooks.length ? (
                    <div className="pi-panel pi-analysis-books">
                      <div className="pi-panel-label">
                        {lang === "en"
                          ? "Bookmakers"
                          : lang === "es"
                          ? "Casas de apuestas"
                          : "Casas de aposta"}
                      </div>

                      <div className="pi-books-stack">
                        {analysisPreviewBooks.map((book) => (
                          <div key={`${selected.event_id}-${book.key}`} className="pi-book-analysis-card">
                            <div className="pi-book-preview-head">
                              <span className="pi-book-preview-name">{book.name}</span>

                              {vis.odds.show_partner_label && book.is_affiliate ? (
                                <span className="pi-book-partner-badge">{t(lang, "odds.partner")}</span>
                              ) : null}
                            </div>

                            <div className="pi-book-preview-odds">
                              H {fmtOdds(book.odds_1x2?.H)} • D {fmtOdds(book.odds_1x2?.D)} • A {fmtOdds(book.odds_1x2?.A)}
                            </div>
                          </div>
                        ))}

                        {analysisHiddenBooksCount > 0 ? (
                          <button
                            type="button"
                            className="pi-book-more-btn pi-book-more-btn-inline"
                            aria-label={`${t(lang, "odds.seeAllBooks")} (+${analysisHiddenBooksCount})`}
                            title={t(lang, "odds.seeAllBooks")}
                            onClick={() => handleOpenBooksModal(selected)}
                          >
                            +{analysisHiddenBooksCount}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <section className={`pi-accordion ${analysisSectionsOpen.oddsEdge ? "is-open" : ""}`}>
                    <button
                      type="button"
                      className="pi-accordion-header"
                      onClick={() => toggleAnalysisSection("oddsEdge")}
                      aria-expanded={analysisSectionsOpen.oddsEdge}
                    >
                      <span className="pi-accordion-title">
                        {lang === "en"
                          ? "Odds & edge"
                          : lang === "es"
                          ? "Cuotas y edge"
                          : "Odds e edge"}
                      </span>
                      <span className="pi-accordion-icon" aria-hidden="true">
                        {analysisSectionsOpen.oddsEdge ? "−" : "+"}
                      </span>
                    </button>

                    <div className={`pi-accordion-content ${analysisSectionsOpen.oddsEdge ? "is-open" : ""}`}>
                      <div className="pi-panels">
                        <div className="pi-panel">
                          <div className="pi-panel-label">{t(lang, "odds.bestOdd")}</div>
                          {quote?.odds?.best ? (
                            <div className="pi-panel-value">
                              H {fmtOdds(quote.odds.best.H)} <br />
                              D {fmtOdds(quote.odds.best.D)} <br />
                              A {fmtOdds(quote.odds.best.A)}
                            </div>
                          ) : selected?.odds_best ? (
                            <div className="pi-panel-value">
                              H {fmtOdds(selected.odds_best.H)} <br />
                              D {fmtOdds(selected.odds_best.D)} <br />
                              A {fmtOdds(selected.odds_best.A)}
                            </div>
                          ) : (
                            <div className="pi-muted">{t(lang, "odds.noOdds")}</div>
                          )}
                        </div>

                        {!vis.value.show_edge_percent ? (
                          <LockedPanel
                            title={t(lang, "matchup.opportunityView")}
                            lang={lang}
                            onUnlock={() => {
                              setUpgradeReason("FEATURE_LOCKED");
                              setUpgradeOpen(true);
                            }}
                          />
                        ) : (
                          (() => {
                            const summary = selected?.edge_summary ?? null;

                            const edgeOutcome = summary?.best_outcome ?? null;
                            const bestEvOutcome = summary?.best_ev_outcome ?? null;

                            const opportunitySide = summary?.opportunity_outcome ?? null;
                            const opportunityEdge = summary?.opportunity_edge ?? null;
                            const opportunityEv = summary?.opportunity_ev ?? null;
                            const opportunityOdd = summary?.opportunity_odd ?? null;
                            const opportunityBook = summary?.opportunity_book_name ?? null;
                            const opportunityFreshness = summary?.opportunity_book_freshness_seconds ?? null;

                            const fairOdd = fairOddFromProb(probForOutcome(effectiveProbs, edgeOutcome));

                            const marketBooksCount =
                              summary?.market_complete_books_count ??
                              summary?.market_books_count ??
                              0;

                            const isProView = vis.model.show_metrics;
                            const hasOpportunityFlag = hasOpportunity(summary);

                            if (summary?.best_edge == null) {
                              return (
                                <div className="pi-panel">
                                  <div className="pi-panel-label">
                                    {t(lang, isProView ? "matchup.marketRead" : "matchup.opportunityView")}
                                  </div>
                                  <div className="pi-muted">{t(lang, "matchup.noEdge")}</div>
                                </div>
                              );
                            }

                            if (!isProView) {
                              return (
                                <div className="pi-panel">
                                  <div className="pi-panel-label">
                                    {t(lang, "matchup.opportunityView")}
                                  </div>

                                  <div className="pi-panel-value">
                                    {fmtOutcome(edgeOutcome, selected.home_name, selected.away_name, lang)}
                                  </div>

                                  <div className="pi-muted" style={{ marginTop: 8 }}>
                                    {t(lang, "matchup.edgeConsensus")}: <strong>{fmtEdge(summary.best_edge)}</strong>
                                  </div>

                                  {vis.value.show_fair_odds ? (
                                    <div className="pi-muted">
                                      {t(lang, "matchup.fairOdds")}: <strong>{fmtOdds(fairOdd)}</strong>
                                    </div>
                                  ) : null}

                                  <div className="pi-muted">
                                    {hasOpportunityFlag
                                      ? t(lang, "matchup.strongSignalNow")
                                      : t(lang, "matchup.noClearOpportunity")}
                                  </div>

                                  <div
                                    className="pi-locked-cta"
                                    style={{ marginTop: 10 }}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      setUpgradeReason("FEATURE_LOCKED");
                                      setUpgradeOpen(true);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        setUpgradeReason("FEATURE_LOCKED");
                                        setUpgradeOpen(true);
                                      }
                                    }}
                                  >
                                    {t(lang, "matchup.proUnlockCta")} →
                                  </div>
                                </div>
                              );
                            }

                            if (hasOpportunityFlag) {
                              return (
                                <div className="pi-panel">
                                  <div className="pi-panel-label">
                                    {t(lang, "matchup.validatedOpportunity")}
                                  </div>

                                  <div className="pi-panel-value">
                                    {fmtOutcome(opportunitySide, selected.home_name, selected.away_name, lang)}
                                  </div>

                                  <div className="pi-muted" style={{ marginTop: 8 }}>
                                    {t(lang, "matchup.edgeConsensus")}: <strong>{fmtEdge(opportunityEdge)}</strong>
                                  </div>

                                  <div className="pi-muted">
                                    {t(lang, "matchup.executableValue")}: <strong>{fmtPctNullable(opportunityEv)}</strong>
                                  </div>

                                  <div className="pi-muted">
                                    {t(lang, "matchup.validOdd")}: <strong>{fmtOdds(opportunityOdd)}</strong>
                                  </div>

                                  <div className="pi-muted">
                                    {t(lang, "matchup.book")}: <strong>{opportunityBook ?? "—"}</strong>
                                  </div>

                                  <div className="pi-muted">
                                    {t(lang, "matchup.marketBooks")}:{" "}
                                    <strong>{t(lang, "matchup.marketBooksValue", { count: marketBooksCount })}</strong>
                                  </div>

                                  <div className="pi-muted">
                                    {t(lang, "matchup.executionUpdated")}:{" "}
                                    <strong>{fmtFreshnessSeconds(opportunityFreshness, lang)}</strong>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div className="pi-panel">
                                <div className="pi-panel-label">
                                  {t(lang, "matchup.marketRead")}
                                </div>

                                <div className="pi-panel-value">
                                  {fmtOutcome(edgeOutcome, selected.home_name, selected.away_name, lang)}
                                </div>

                                <div className="pi-muted" style={{ marginTop: 8 }}>
                                  {t(lang, "matchup.edgeConsensus")}: <strong>{fmtEdge(summary.best_edge)}</strong>
                                </div>

                                <div className="pi-muted">
                                  {t(lang, "matchup.bestExecutableValue")}:{" "}
                                  <strong>{fmtPctNullable(summary.best_ev)}</strong>
                                  {bestEvOutcome ? (
                                    <>
                                      {" "}•{" "}
                                      {fmtOutcome(bestEvOutcome, selected.home_name, selected.away_name, lang)}
                                    </>
                                  ) : null}
                                </div>

                                <div className="pi-muted">
                                  {t(lang, "matchup.validOdd")}:{" "}
                                  <strong>{fmtOdds(summary.best_ev_odd ?? summary.best_odd)}</strong>
                                </div>

                                <div className="pi-muted">
                                  {t(lang, "matchup.book")}:{" "}
                                  <strong>{summary.best_ev_book_name ?? summary.best_book_name ?? "—"}</strong>
                                </div>

                                <div className="pi-muted">
                                  {t(lang, "matchup.marketBooks")}:{" "}
                                  <strong>{t(lang, "matchup.marketBooksValue", { count: marketBooksCount })}</strong>
                                </div>

                                <div className="pi-muted">
                                  {t(lang, "matchup.noValidatedOpportunity")}
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        )}
      </>
    );
  }

return (
  <div className="pi">
    <div className="pi-filters pi-filters-desktop">
      <div className="pi-filters-grid-desktop">
        <SearchableMultiSelect
          className="pi-filter-country"
          label={t(lang, "product.filterCountries")}
          placeholder={t(lang, "product.filterCountriesPlaceholder")}
          searchPlaceholder={t(lang, "product.searchCountryPlaceholder")}
          emptyText={t(lang, "product.noCountryResults")}
          clearText={t(lang, "product.filtersClear")}
          selectedValues={selectedCountryCodes}
          options={countryOptions}
          getSummaryText={(selectedOptions) =>
            buildSelectedSummary(
              "country",
              selectedOptions,
              t(lang, "product.filterCountriesPlaceholder")
            )
          }
          onChange={setSelectedCountryCodes}
          renderLeading={(option) => (
            <span aria-hidden="true">{countryCodeToFlagEmoji(option.flagCode)}</span>
          )}
        />

        <SearchableMultiSelect
          label={t(lang, "product.filterLeagues")}
          placeholder={t(lang, "product.filterLeaguesPlaceholder")}
          searchPlaceholder={t(lang, "product.searchLeaguePlaceholder")}
          emptyText={t(lang, "product.noLeagueResults")}
          clearText={t(lang, "product.filtersClear")}
          selectedValues={selectedLeagueSportKeys}
          options={leagueOptions}
          onChange={setSelectedLeagueSportKeys}
          renderLeading={(option) => (
            <span aria-hidden="true">{countryCodeToFlagEmoji(option.flagCode)}</span>
          )}
        />

        <SearchableMultiSelect
          label={t(lang, "product.filterBooks")}
          placeholder={t(lang, "product.filterBooksPlaceholder")}
          searchPlaceholder={t(lang, "product.searchBookPlaceholder")}
          emptyText={t(lang, "product.noBookResults")}
          clearText={t(lang, "product.filtersClear")}
          selectedValues={selectedBookKeys}
          options={bookOptions}
          onChange={setSelectedBookKeys}
        />

        <SearchableMultiSelect
          label={t(lang, "product.filterTeams")}
          placeholder={t(lang, "product.filterTeamsPlaceholder")}
          searchPlaceholder={t(lang, "product.searchTeamPlaceholder")}
          emptyText={t(lang, "product.noTeamResults")}
          clearText={t(lang, "product.filtersClear")}
          selectedValues={selectedTeams}
          options={teamOptions}
          onChange={setSelectedTeams}
        />

      {renderWindowDaysSelect("pi-filter-window")}
      {renderSortSelect("pi-filter-sort")}
      {renderOnlyOpportunitiesToggle("pi-filter-toggle")}
      </div>
    </div>

    <div className="pi-topline">
      <div className="pi-title">{t(lang, "odds.pageTitle")}</div>

      <div className="pi-meta">
        {leaguesError ? (
          <>
            <span style={{ color: "#c00" }}>{leaguesError}</span>
            <span className="pi-subsep">•</span>
          </>
        ) : null}
        <span>
          {lang === "en"
            ? `${visibleEvents.length} matches`
            : lang === "es"
            ? `${visibleEvents.length} partidos`
            : `${visibleEvents.length} jogos`}
        </span>

        <span className="pi-subsep">•</span>
        <span>
        {lang === "en"
          ? `Credits reset in ${creditsResetCountdown}`
          : lang === "es"
          ? `Reset de créditos en ${creditsResetCountdown}`
          : `Reset de créditos em ${creditsResetCountdown}`}
        </span>

        {lastLoadedAt ? (
          <>
            <span className="pi-subsep">•</span>
            <span>{t(lang, "common.updatedAgo", { ago: fmtAgo(lastLoadedAt, lang, nowTick) })}</span>
          </>
        ) : null}
      </div>

      <button
        type="button"
        className="pi-filters-mobile-trigger"
        onClick={() => setFiltersOpen(true)}
      >
        {t(lang, "product.mobileFiltersButton")}
        {hasActiveFilters
          ? ` (${selectedCountryCodes.length + selectedLeagueSportKeys.length + selectedBookKeys.length + selectedTeams.length})`
          : ""}
      </button>
    </div>

    {isUpcomingFallbackActive ? (
      <div className="pi-card" style={{ marginBottom: 12, padding: 12 }}>
        {t(lang, "odds.upcomingFallbackNotice")}
      </div>
    ) : showTodayEmptyNotice ? (
      <div className="pi-card" style={{ marginBottom: 12, padding: 12 }}>
        {t(lang, "odds.todayEmptyNotice")}
      </div>
    ) : null}

    {hasActiveFilters ? (
      <div className="pi-active-filters">
        {selectedCountryCodes.map((value) => {
          const item = countryOptions.find((option) => option.value === value);
          if (!item) return null;

          return (
            <span key={`country-${value}`} className="pi-filter-chip">
              {countryCodeToFlagEmoji(item.flagCode)} {item.label}
              <button
                type="button"
                onClick={() =>
                  setSelectedCountryCodes((prev) => prev.filter((x) => x !== value))
                }
              >
                ×
              </button>
            </span>
          );
        })}

        {selectedLeagueSportKeys.map((value) => {
          const item = leagueOptions.find((option) => option.value === value);
          if (!item) return null;

          return (
            <span key={`league-${value}`} className="pi-filter-chip">
              {item.label}
              <button
                type="button"
                onClick={() =>
                  setSelectedLeagueSportKeys((prev) => prev.filter((x) => x !== value))
                }
              >
                ×
              </button>
            </span>
          );
        })}

        {selectedBookKeys.map((value) => {
          const item = bookOptions.find((option) => option.value === value);
          if (!item) return null;

          return (
            <span key={`book-${value}`} className="pi-filter-chip">
              {item.label}
              <button
                type="button"
                onClick={() =>
                  setSelectedBookKeys((prev) => prev.filter((x) => x !== value))
                }
              >
                ×
              </button>
            </span>
          );
        })}

        {selectedTeams.map((value) => (
          <span key={`team-${value}`} className="pi-filter-chip">
            {value}
            <button
              type="button"
              onClick={() =>
                setSelectedTeams((prev) => prev.filter((x) => x !== value))
              }
            >
              ×
            </button>
          </span>
        ))}

        {onlyOpportunities ? (
          <button
            type="button"
            className="pi-filter-chip pi-filter-chip-action"
            onClick={() => setOnlyOpportunities(false)}
          >
            <span>{t(lang, "odds.onlyOpportunities")}</span>
            <span aria-hidden="true">×</span>
          </button>
        ) : null}

        <button
          type="button"
          className="pi-filter-chip pi-filter-chip-action pi-filter-chip-clear"
          onClick={clearAdvancedFilters}
        >
          <span>{t(lang, "product.filtersClear")}</span>
          <span aria-hidden="true">×</span>
        </button>
      </div>
    ) : null}

    <ProductFiltersSheet
      open={filtersOpen}
      title={t(lang, "product.filtersTitle")}
      clearText={t(lang, "product.filtersClear")}
      applyText={t(lang, "product.filtersApply")}
      hasActiveFilters={hasActiveFilters}
      onClose={() => setFiltersOpen(false)}
      onClear={clearAdvancedFilters}
    >
      <div className="pi-sheet-stack">
        <SearchableMultiSelect
          label={t(lang, "product.filterCountries")}
          placeholder={t(lang, "product.filterCountriesPlaceholder")}
          searchPlaceholder={t(lang, "product.searchCountryPlaceholder")}
          emptyText={t(lang, "product.noCountryResults")}
          clearText={t(lang, "product.filtersClear")}
          selectedValues={selectedCountryCodes}
          options={countryOptions}
          onChange={setSelectedCountryCodes}
          renderLeading={(option) => (
            <span aria-hidden="true">{countryCodeToFlagEmoji(option.flagCode)}</span>
          )}
        />

        <SearchableMultiSelect
          className="pi-filter-league"
          label={t(lang, "product.filterLeagues")}
          placeholder={t(lang, "product.filterLeaguesPlaceholder")}
          searchPlaceholder={t(lang, "product.searchLeaguePlaceholder")}
          emptyText={t(lang, "product.noLeagueResults")}
          clearText={t(lang, "product.filtersClear")}
          selectedValues={selectedLeagueSportKeys}
          options={leagueOptions}
          getSummaryText={(selectedOptions) =>
            buildSelectedSummary(
              "league",
              selectedOptions,
              t(lang, "product.filterLeaguesPlaceholder")
            )
          }
          onChange={setSelectedLeagueSportKeys}
          renderLeading={(option) => (
            <span aria-hidden="true">{countryCodeToFlagEmoji(option.flagCode)}</span>
          )}
        />

        <SearchableMultiSelect
          className="pi-filter-book"
          label={t(lang, "product.filterBooks")}
          placeholder={t(lang, "product.filterBooksPlaceholder")}
          searchPlaceholder={t(lang, "product.searchBookPlaceholder")}
          emptyText={t(lang, "product.noBookResults")}
          clearText={t(lang, "product.filtersClear")}
          selectedValues={selectedBookKeys}
          options={bookOptions}
          getSummaryText={(selectedOptions) =>
            buildSelectedSummary(
              "book",
              selectedOptions,
              t(lang, "product.filterBooksPlaceholder")
            )
          }
          onChange={setSelectedBookKeys}
        />

        <SearchableMultiSelect
          className="pi-filter-team"
          label={t(lang, "product.filterTeams")}
          placeholder={t(lang, "product.filterTeamsPlaceholder")}
          searchPlaceholder={t(lang, "product.searchTeamPlaceholder")}
          emptyText={t(lang, "product.noTeamResults")}
          clearText={t(lang, "product.filtersClear")}
          selectedValues={selectedTeams}
          options={teamOptions}
          getSummaryText={(selectedOptions) =>
            buildSelectedSummary(
              "team",
              selectedOptions,
              t(lang, "product.filterTeamsPlaceholder")
            )
          }
          onChange={setSelectedTeams}
        />

        <div className="pi-inline-filter-selects">
          {renderWindowDaysSelect()}
          {renderSortSelect()}
        </div>

        {renderOnlyOpportunitiesToggle()}
      </div>
    </ProductFiltersSheet>

    <div className="pi-grid">
      {/* LEFT: LISTA */}
      <section className="pi-card pi-card-list">
        {eventsError ? <div className="pi-error">{eventsError}</div> : null}

        <div className="pi-list" aria-label={t(lang, "odds.listAria")}>
          {visibleEvents.map((e) => {
            const eventKey = String(e.event_id);
            const active = eventKey === String(selectedId);
            const es = e.edge_summary ?? null;
            const hasOpportunityFlag = hasOpportunity(es);
            const isProbableOnly = e.match_status === "PROBABLE";

            return (
              <div
                key={e.event_id}
                className={`pi-row ${active ? "is-active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  handleSelectEvent(String(e.event_id));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleSelectEvent(String(e.event_id));
                  }
                }}
              >
                <div className="pi-row-main">
                  <div className="pi-row-title">
                    <span className="pi-team">{e.home_name}</span>
                    <span className="pi-vs">vs</span>
                    <span className="pi-team">{e.away_name}</span>
                  </div>

                  <div className="pi-row-sub">
                    <div className="pi-row-meta-inline">
                      <span className="pi-league" title={leagueDisplayName(leaguesBySportKey.get(e.sport_key) ?? league, lang)}>
                        {leagueDisplayName(leaguesBySportKey.get(e.sport_key) ?? league, lang)}
                      </span>

                      <span className="pi-subsep">•</span>

                      <span className="pi-kick">
                        {fmtKickoff(e.commence_time_utc, lang)}
                      </span>

                      {e.odds_best ? (
                        <>
                          <span className="pi-subsep">•</span>
                          <span className="pi-odds-mini">
                            H {fmtOdds(e.odds_best.H)} / D {fmtOdds(e.odds_best.D)} / A {fmtOdds(e.odds_best.A)}
                          </span>
                        </>
                      ) : null}
                    </div>

                    {hasOpportunityFlag || isProbableOnly ? (
                      <div className="pi-row-actions-inline">
                        {isProbableOnly ? (
                          <span className="pi-chip pi-chip-muted">
                            {lang === "en"
                              ? "Moderate confidence"
                              : lang === "es"
                              ? "Confianza moderada"
                              : "Confiança moderada"}
                          </span>
                        ) : null}

                        {hasOpportunityFlag ? (
                          <span className="pi-opportunity">
                            {t(lang, "odds.opportunityDetected")}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* RIGHT: DETALHE + ANÁLISE */}
      {!isMobileAnalysisView ? (
        <aside className="pi-card-analysis">
          <div className="pi-card pi-card-analysis-box">
            {renderAnalysisPane()}
          </div>
        </aside>
      ) : null}
    </div>

    {booksModalEvent ? (
      <div
        className="um-overlay"
        onClick={() => setBooksModalEventId("")}
      >
        <div
          className="um-modal pi-books-modal"
          role="dialog"
          aria-modal="true"
          aria-label={
            lang === "en"
              ? "Bookmakers"
              : lang === "es"
              ? "Casas de apuestas"
              : "Casas de aposta"
          }
          onClick={(event) => event.stopPropagation()}
          style={{ maxWidth: 720 }}
        >
          <div className="product-modal-head">
            <div className="product-modal-head-copy">
              <div className="product-modal-kicker">prevIA</div>
              <div className="product-modal-title">
                {lang === "en"
                  ? "Bookmakers"
                  : lang === "es"
                  ? "Casas de apuestas"
                  : "Casas de aposta"}
              </div>

              <div className="product-modal-subtitle">
                {booksModalEvent.home_name} <span className="pi-vs">vs</span> {booksModalEvent.away_name}
                <span className="pi-subsep">•</span>
                {fmtKickoff(booksModalEvent.commence_time_utc, lang)}
              </div>
            </div>

            <button
              type="button"
              className="product-modal-close"
              onClick={() => setBooksModalEventId("")}
              aria-label={lang === "en" ? "Close" : lang === "es" ? "Cerrar" : "Fechar"}
            >
              ×
            </button>
          </div>

          <div className="product-modal-body">
            {booksModalList.length ? (
              <div className="pi-books-modal-list">
                {booksModalList.map((book) => {
                  const capturedAtMs = book.captured_at_utc
                    ? new Date(book.captured_at_utc).getTime()
                    : NaN;

                  return (
                    <div key={book.key} className="pi-books-modal-row">
                      <div className="pi-books-modal-book">
                        <div className="pi-books-modal-book-top">
                          <span className="pi-books-modal-book-name">{book.name}</span>

                          {vis.odds.show_partner_label && book.is_affiliate ? (
                            <span className="pi-book-partner-badge">
                              {t(lang, "odds.partner")}
                            </span>
                          ) : null}
                        </div>

                        {Number.isFinite(capturedAtMs) ? (
                          <div className="pi-books-modal-book-time">
                            {t(lang, "common.updatedAgo", {
                              ago: fmtAgo(capturedAtMs, lang, nowTick),
                            })}
                          </div>
                        ) : null}
                      </div>

                      <div className="pi-books-modal-odds">
                        <div className="pi-books-modal-odd">
                          <span>H</span>
                          <strong>{fmtOdds(book.odds_1x2?.H)}</strong>
                        </div>

                        <div className="pi-books-modal-odd">
                          <span>D</span>
                          <strong>{fmtOdds(book.odds_1x2?.D)}</strong>
                        </div>

                        <div className="pi-books-modal-odd">
                          <span>A</span>
                          <strong>{fmtOdds(book.odds_1x2?.A)}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="pi-muted">
                {lang === "en"
                  ? "No bookmaker odds available for this match."
                  : lang === "es"
                  ? "No hay cuotas disponibles para este partido."
                  : "Não há odds disponíveis para este jogo."}
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null}

    {isMobileAnalysisView && mobileAnalysisOpen ? (
      <div
        className="pi-mobile-analysis-overlay"
        onClick={() => setMobileAnalysisOpen(false)}
      >
        <div
          className="pi-mobile-analysis-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={
            lang === "en"
              ? "Match analysis"
              : lang === "es"
              ? "Análisis del partido"
              : "Análise do jogo"
          }
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pi-mobile-analysis-head">
            <div className="pi-mobile-analysis-headcopy">
              <div className="pi-mobile-analysis-kicker">
                {lang === "en"
                  ? "Match analysis"
                  : lang === "es"
                  ? "Análisis del partido"
                  : "Análise do jogo"}
              </div>

              {selected ? (
                <div className="pi-mobile-analysis-match">
                  {selected.home_name} <span className="pi-vs">vs</span> {selected.away_name}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="pi-mobile-analysis-close"
              onClick={() => setMobileAnalysisOpen(false)}
              aria-label={lang === "en" ? "Close" : lang === "es" ? "Cerrar" : "Fechar"}
            >
              ×
            </button>
          </div>

          <div className="pi-mobile-analysis-body">
            {renderAnalysisPane()}
          </div>
        </div>
      </div>
    ) : null}

    {isAnalysisLoading ? (
      <div className="pi-analysis-loading-overlay" aria-live="polite" aria-busy="true">
        <div className="pi-analysis-loading-card">
          <div className="pi-analysis-loading-spinner" aria-hidden="true" />
          <div className="pi-analysis-loading-title">
            {lang === "en"
              ? "Loading analysis..."
              : lang === "es"
              ? "Cargando análisis..."
              : "Carregando análise..."}
          </div>
          <div className="pi-analysis-loading-sub">
            {lang === "en"
              ? "Please wait while we prepare the match insights."
              : lang === "es"
              ? "Espera mientras preparamos el análisis del partido."
              : "Aguarde enquanto preparamos a análise da partida."}
          </div>
        </div>
      </div>
    ) : null}

    <PlanChangeModal
      open={upgradeOpen}
      reason={upgradeReason}
      onClose={() => setUpgradeOpen(false)}
    />
  </div>
);

}