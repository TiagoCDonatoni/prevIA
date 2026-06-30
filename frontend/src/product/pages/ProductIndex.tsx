import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { PRODUCT_AUTH_ENABLED } from "../../config";

import type {
  ProductEdgeSummary,
  ProductOddsBook,
  ProductOddsEvent,
  ProductOddsQuoteResponse,
  ProductOdds1x2,
  ProductNarrativeContext,
  ProductDecisionSummary,
} from "../../api/contracts";
import type { ProductLeagueItem } from "../../api/contracts";
import { productListLeagues, productListOddsEvents, productQuoteOdds } from "../../api/client";
import { t, type Lang } from "../i18n";
import { getLeagueDisplayName } from "../i18n/leagueCatalogHelpers";
import { getCountryNameByCode } from "../i18n/countryCatalog";
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
import {
  readPersistedProductIndexFilters,
  writePersistedProductIndexFilters,
} from "../filters/productIndexFilterSession";

import { trackProductTelemetry } from "../telemetry/productTelemetry";

const UI_DEFAULTS = {
  hoursAheadFallback: 24,
  limit: 100,
  tolHoursFallback: 6,
};

type UpgradeReason = "NO_CREDITS" | "FEATURE_LOCKED";
type SortBy = "DATE" | "CONFIDENCE" | "EDGE";
type WindowMode = "UPCOMING" | "TODAY" | "3" | "7" | "30";

type ProductIndexMode = "app" | "public_embed";
type ProductIndexProps = {
  mode?: ProductIndexMode;
};

const MOBILE_ANALYSIS_BREAKPOINT = 980;
const UPCOMING_WINDOW_HOURS = 24;
const UPCOMING_FALLBACK_7D_HOURS = 7 * 24;
const UPCOMING_FALLBACK_30D_HOURS = 30 * 24;
const UPCOMING_FALLBACK_MAX_LEAGUES = 12;
const OPPORTUNITY_EDGE_THRESHOLD = 0.12;
const OPPORTUNITY_EV_THRESHOLD = 0.10;
const OPPORTUNITY_MIN_BOOKS = 7;
const OPPORTUNITY_MAX_FRESHNESS_SECONDS = 2 * 24 * 60 * 60;
const POSITIVE_EDGE_THRESHOLD = 0.02;
const NEUTRAL_EDGE_THRESHOLD = -0.02;

const ACTIVE_EVENT_GRACE_MINUTES = 90;
const ACTIVE_EVENT_GRACE_MS = ACTIVE_EVENT_GRACE_MINUTES * 60 * 1000;

type AnalysisSectionKey = "probabilities" | "goals" | "oddsEdge";

const DEFAULT_ANALYSIS_SECTIONS_OPEN: Record<AnalysisSectionKey, boolean> = {
  probabilities: true,
  goals: false,
  oddsEdge: false,
};

const EVENT_FETCH_CONCURRENCY = 4;
const PUBLIC_EMBED_MAX_LEAGUES = 8;

const EVENTS_CACHE_TTL_MS = 2 * 60 * 1000;
const PUBLIC_EMBED_EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const EVENTS_CACHE_STORAGE_PREFIX = "previa.product.eventsCache.v1:";
const LEAGUES_CACHE_TTL_MS = 10 * 60 * 1000;
const LEAGUES_CACHE_STORAGE_KEY = "previa.product.leaguesCache.v1";

type ProductLeaguesCacheEntry = {
  createdAt: number;
  leagues: ProductLeagueOption[];
};

type ProductEventsCacheEntry = {
  createdAt: number;
  events: ProductOddsEvent[];
};

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function sanitizeWindowMode(value: unknown): WindowMode {
  return value === "UPCOMING" || value === "TODAY" || value === "3" || value === "7" || value === "30"
    ? value
    : "UPCOMING";
}

function sanitizeSortBy(value: unknown): SortBy {
  return value === "DATE" || value === "CONFIDENCE" || value === "EDGE"
    ? value
    : "DATE";
}

function sameStringArray(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

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
  if (mode === "TODAY") return UI_DEFAULTS.hoursAheadFallback;

  return Number(mode) * 24;
}

function buildEventsCacheKey(input: {
  productMode: ProductIndexMode;
  hoursAhead: number;
  leagueKeys: string[];
  includeRevealed?: boolean;
  revealedKeys?: string[];
}) {
  return [
    input.productMode,
    String(input.hoursAhead),
    input.includeRevealed ? "revealed" : "public",
    input.leagueKeys.slice().sort().join(","),
    (input.revealedKeys ?? []).slice().sort().join(","),
  ].join("|");
}

function readStoredEventsCache(cacheKey: string): ProductEventsCacheEntry | null {
  try {
    const raw = sessionStorage.getItem(`${EVENTS_CACHE_STORAGE_PREFIX}${cacheKey}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ProductEventsCacheEntry;

    if (!parsed || !Number.isFinite(parsed.createdAt) || !Array.isArray(parsed.events)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeStoredEventsCache(cacheKey: string, entry: ProductEventsCacheEntry) {
  try {
    sessionStorage.setItem(`${EVENTS_CACHE_STORAGE_PREFIX}${cacheKey}`, JSON.stringify(entry));
  } catch {
    // Cache é otimização de performance; falha não deve quebrar a tela.
  }
}

function readStoredLeaguesCache(): ProductLeaguesCacheEntry | null {
  try {
    const raw = sessionStorage.getItem(LEAGUES_CACHE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ProductLeaguesCacheEntry;

    if (!parsed || !Number.isFinite(parsed.createdAt) || !Array.isArray(parsed.leagues)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeStoredLeaguesCache(entry: ProductLeaguesCacheEntry) {
  try {
    sessionStorage.setItem(LEAGUES_CACHE_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Cache é otimização de performance; falha não deve quebrar a tela.
  }
}

function narrativeStyleFromInternalView(
  view: InternalNarrativeView
): NarrativeStyleId | undefined {
  if (view === "RECREATIONAL") return "leve";
  if (view === "PROFESSIONAL") return "equilibrado";
  if (view === "CREATOR") return "pro";
  return undefined;
}

type MatchNarrativeCard = {
  key: "context" | "model" | "price" | "conclusion";
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "caution";
};

type MatchNarrativeView = {
  headline: string;
  paragraphs: string[];
  cards: MatchNarrativeCard[];
  chips: Array<{ label: string; value: string }>;
  isCompact: boolean;
};

function getMatchContextTitle(lang: Lang) {
  if (lang === "en") return "Match context";
  if (lang === "es") return "Contexto del partido";
  return "Contexto da partida";
}

function getNarrativeContextLanguageKey(lang: Lang) {
  if (lang === "en") return "en";
  if (lang === "es") return "es";
  return "pt-BR";
}

function isFullNarrativeContextPlan(plan: PlanId) {
  return plan === "LIGHT" || plan === "PRO";
}

function getGuidedNarrativeLabels(lang: Lang) {
  if (lang === "en") {
    return {
      context: "Context",
      model: "Model",
      price: "Odds",
      conclusion: "prevIA read",
      balanced: "Balanced",
      missing: "Not clear",
      draw: "Draw",
      valueLabel: "Value read",
      alignedValue: "Model and odds aligned",
      contextValue: "Context and odds aligned",
      contrarianValue: "Price against favorite",
      balancedValue: "Price matters more",
      noValue: "More caution",
      contextBalancedText: "The recent context does not separate the teams that much.",
      contextMissingText: "There is not enough context to point clearly to one side.",
      modelMissingText: "The model does not have a clear main side for this match.",
      priceMissingText: "The odds do not add enough information to call a price read.",
    };
  }

  if (lang === "es") {
    return {
      context: "Contexto",
      model: "Modelo",
      price: "Cuota",
      conclusion: "Lectura prevIA",
      balanced: "Equilibrado",
      missing: "Sin lado claro",
      draw: "Empate",
      valueLabel: "Lectura de valor",
      alignedValue: "Modelo y cuota alineados",
      contextValue: "Contexto y cuota alineados",
      contrarianValue: "Precio contra el favorito",
      balancedValue: "El precio pesa más",
      noValue: "Más cautela",
      contextBalancedText: "El contexto reciente no separa tanto a los equipos.",
      contextMissingText: "Todavía no hay contexto suficiente para apuntar claramente a un lado.",
      modelMissingText: "El modelo no tiene un lado principal claro para este partido.",
      priceMissingText: "Las cuotas no suman lo suficiente para cerrar una lectura de precio.",
    };
  }

  return {
    context: "Contexto",
    model: "Modelo",
    price: "Odd",
    conclusion: "Leitura prevIA",
    balanced: "Equilibrado",
    missing: "Sem lado claro",
    draw: "Empate",
    valueLabel: "Leitura de valor",
    alignedValue: "Modelo e odd alinhados",
    contextValue: "Contexto e odd alinhados",
    contrarianValue: "Preço contra o favorito",
    balancedValue: "Preço pesa mais",
    noValue: "Mais cautela",
    contextBalancedText: "O contexto recente não separa tanto os times.",
    contextMissingText: "Ainda não há contexto suficiente para apontar claramente para um lado.",
    modelMissingText: "O modelo não tem um lado principal claro para esta partida.",
    priceMissingText: "As odds não acrescentam o bastante para fechar uma leitura de preço.",
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripNarrativeMatchupPrefix(headline: string, home: string, away: string) {
  const text = String(headline || "").trim();
  if (!text) return "";

  const homePattern = escapeRegExp(home);
  const awayPattern = escapeRegExp(away);

  const patterns = [
    new RegExp(`^${homePattern}\\s+(?:x|vs\\.?|v\\.?|versus)\\s+${awayPattern}\\s*[:：-]\\s*`, "i"),
    new RegExp(`^${homePattern}\\s*[–—-]\\s*${awayPattern}\\s*[:：-]\\s*`, "i"),
  ];

  for (const pattern of patterns) {
    const cleaned = text.replace(pattern, "").trim();
    if (cleaned !== text) return cleaned;
  }

  return text;
}

function outcomeNameForNarrative(
  outcome: string | null | undefined,
  home: string,
  away: string,
  lang: Lang
) {
  const labels = getGuidedNarrativeLabels(lang);
  if (outcome === "home") return home;
  if (outcome === "away") return away;
  if (outcome === "draw") return labels.draw;
  return labels.missing;
}

function shortOutcomeRole(outcome: string | null | undefined, lang: Lang) {
  if (outcome === "home") return lang === "en" ? "Home" : lang === "es" ? "Local" : "Mandante";
  if (outcome === "away") return lang === "en" ? "Away" : lang === "es" ? "Visitante" : "Visitante";
  if (outcome === "draw") return lang === "en" ? "Draw" : lang === "es" ? "Empate" : "Empate";
  return "—";
}

function getNarrativeOutcomeProb(
  narrativeContext: ProductNarrativeContext,
  outcome: string | null | undefined,
  fallbackProbs: ProductOdds1x2 | null | undefined
) {
  if (!outcome) return null;

  const pricing =
    narrativeContext.facts && "pricing" in narrativeContext.facts
      ? narrativeContext.facts.pricing
      : null;

  const fromPricing =
    pricing && typeof pricing === "object" && "outcomes" in pricing
      ? pricing.outcomes?.[outcome]?.model_prob
      : null;

  if (typeof fromPricing === "number" && Number.isFinite(fromPricing)) {
    return fromPricing;
  }

  if (outcome === "home") return fallbackProbs?.H ?? null;
  if (outcome === "draw") return fallbackProbs?.D ?? null;
  if (outcome === "away") return fallbackProbs?.A ?? null;

  return null;
}

function narrativeValueLabel(alignment: string | null | undefined, lang: Lang) {
  const labels = getGuidedNarrativeLabels(lang);

  if (alignment === "aligned_value") return labels.alignedValue;
  if (alignment === "context_value") return labels.contextValue;
  if (alignment === "contrarian_value") return labels.contrarianValue;
  if (alignment === "balanced_value") return labels.balancedValue;

  return labels.noValue;
}

function isPositivePriceAlignment(alignment: string | null | undefined) {
  return alignment === "aligned_value" || alignment === "context_value" || alignment === "contrarian_value" || alignment === "balanced_value";
}

function pickSnapshotNarrativeContext(
  narrativeContext: ProductNarrativeContext | null | undefined,
  lang: Lang,
  plan: PlanId,
  home: string,
  away: string,
  fallbackProbs: ProductOdds1x2 | null | undefined
): MatchNarrativeView | null {
  if (!narrativeContext) return null;

  const status = String(narrativeContext.status ?? "");
  if (status !== "available" && status !== "limited") return null;

  const requestedLanguage = getNarrativeContextLanguageKey(lang);
  const defaultLanguage = String(narrativeContext.default_language || "pt-BR");
  const texts = narrativeContext.texts ?? {};

  const localized =
    texts[requestedLanguage] ??
    texts[defaultLanguage] ??
    texts["pt-BR"] ??
    texts.en ??
    texts.es ??
    null;

  const rawHeadline = String(localized?.headline ?? narrativeContext.headline ?? "").trim();
  const headline = stripNarrativeMatchupPrefix(rawHeadline, home, away);

  const rawParagraphs = Array.isArray(localized?.paragraphs)
    ? localized?.paragraphs
    : Array.isArray(narrativeContext.paragraphs)
      ? narrativeContext.paragraphs
      : [];

  const paragraphs = (rawParagraphs ?? [])
    .map((paragraph) => String(paragraph ?? "").trim())
    .filter(Boolean);

  if (!headline && !paragraphs.length) return null;

  const isCompact = !isFullNarrativeContextPlan(plan);
  const visibleParagraphs = isCompact
    ? paragraphs.length <= 2
      ? paragraphs
      : [paragraphs[0], paragraphs[paragraphs.length - 1]].filter(Boolean)
    : paragraphs;

  const sections = localized?.sections ?? narrativeContext.sections ?? {};
  const marketConclusion = String(
    sections?.market_connection?.text ?? paragraphs[paragraphs.length - 1] ?? ""
  ).trim();

  const labels = getGuidedNarrativeLabels(lang);
  const signals = narrativeContext.signals ?? {};

  const contextSide = signals.context_side ?? null;
  const likelyOutcome = signals.most_likely_outcome ?? null;
  const pricingOutcome = signals.pricing_outcome ?? null;
  const valueOutcome = signals.value_outcome ?? pricingOutcome ?? null;
  const priceAlignment = signals.price_context_alignment ?? null;

  const contextName = outcomeNameForNarrative(contextSide, home, away, lang);
  const likelyName = outcomeNameForNarrative(likelyOutcome, home, away, lang);
  const valueName = outcomeNameForNarrative(valueOutcome, home, away, lang);
  const likelyProb = getNarrativeOutcomeProb(narrativeContext, likelyOutcome, fallbackProbs);

  const contextText =
    contextSide === "balanced"
      ? labels.contextBalancedText
      : contextSide === "home" || contextSide === "away"
        ? lang === "en"
          ? `The recent context favors ${contextName}.`
          : lang === "es"
            ? `El contexto reciente favorece a ${contextName}.`
            : `O contexto recente favorece ${contextName}.`
        : labels.contextMissingText;

  const modelText =
    likelyOutcome === "home" || likelyOutcome === "away" || likelyOutcome === "draw"
      ? lang === "en"
        ? `The model puts ${likelyName} as the most likely outcome${typeof likelyProb === "number" ? ` (${fmtPct(likelyProb)})` : ""}.`
        : lang === "es"
          ? `El modelo coloca a ${likelyName} como el resultado más probable${typeof likelyProb === "number" ? ` (${fmtPct(likelyProb)})` : ""}.`
          : `O modelo coloca ${likelyName} como resultado mais provável${typeof likelyProb === "number" ? ` (${fmtPct(likelyProb)})` : ""}.`
      : labels.modelMissingText;

  const priceText =
    priceAlignment === "favorite_no_value" && valueOutcome
      ? lang === "en"
        ? `The odds on ${valueName} look short for the risk.`
        : lang === "es"
          ? `La cuota de ${valueName} parece corta para el riesgo.`
          : `A odd de ${valueName} parece curta para o risco.`
      : valueOutcome === "home" || valueOutcome === "away" || valueOutcome === "draw"
        ? lang === "en"
          ? `The most interesting price is on ${valueName}.`
          : lang === "es"
            ? `El precio más interesante aparece en ${valueName}.`
            : `O preço mais interessante aparece em ${valueName}.`
        : labels.priceMissingText;

  const positivePrice = isPositivePriceAlignment(priceAlignment);

  return {
    // Contexto textual escondido temporariamente.
    // Motivo: a headline/parágrafos atuais ainda misturam "contexto equilibrado"
    // com leitura de modelo/odd e acabam duplicando a Leitura prevIA.
    // Vamos reaproveitar depois em uma narrativa unificada.
    headline: "",
    paragraphs: [],

    isCompact,
    cards: [
      // Contexto escondido temporariamente.
      // {
      //   key: "context",
      //   label: labels.context,
      //   value: contextText,
      //   tone: "neutral",
      // },

      { key: "model", label: labels.model, value: modelText, tone: "neutral" },
      {
        key: "price",
        label: labels.price,
        value: priceText,
        tone: positivePrice ? "positive" : "caution",
      },
      {
        key: "conclusion",
        label: labels.conclusion,
        value: marketConclusion,
        tone: positivePrice ? "positive" : "caution",
      },
    ],
    chips: [
      // Contexto escondido temporariamente.
      // {
      //   label: labels.context,
      //   value: contextSide === "balanced" ? labels.balanced : shortOutcomeRole(contextSide, lang),
      // },

      { label: labels.model, value: shortOutcomeRole(likelyOutcome, lang) },
      { label: labels.price, value: shortOutcomeRole(valueOutcome, lang) },
      { label: labels.valueLabel, value: narrativeValueLabel(priceAlignment, lang) },
    ],
  };
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

function getEventModelConfidenceOverall(event: ProductOddsEvent | null | undefined) {
  const direct = event?.model_confidence_overall;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  const fromSnapshot = event?.snapshot_summary?.confidence?.overall;
  if (typeof fromSnapshot === "number" && Number.isFinite(fromSnapshot)) return fromSnapshot;

  const fromGuardrails = event?.snapshot_summary?.guardrails?.confidence_overall;
  if (typeof fromGuardrails === "number" && Number.isFinite(fromGuardrails)) return fromGuardrails;

  return null;
}

function getModelConfidenceMiniTitle(lang: Lang) {
  return lang === "en"
    ? "Model confidence"
    : lang === "es"
    ? "Confianza del modelo"
    : "Confiança do modelo";
}

function getModelConfidenceLabel(lang: Lang, level?: string | null) {
  const normalized = String(level || "").toLowerCase();

  if (normalized === "high") {
    return lang === "en" ? "High" : lang === "es" ? "Alta" : "Alta";
  }

  if (normalized === "medium") {
    return lang === "en" ? "Moderate" : lang === "es" ? "Moderada" : "Moderada";
  }

  if (normalized === "low") {
    return lang === "en" ? "Low" : lang === "es" ? "Baja" : "Baixa";
  }

  return lang === "en" ? "Not available" : lang === "es" ? "No disponible" : "Não informada";
}

function getModelSourceLabel(lang: Lang, source?: string | null) {
  const normalized = String(source || "").toLowerCase();

  if (normalized === "team_season_stats_blended") {
    return lang === "en"
      ? "Base: team season + competition context"
      : lang === "es"
      ? "Base: temporada del equipo + contexto de competición"
      : "Base: temporada do time + contexto da competição";
  }

  if (normalized === "team_season_stats") {
    return lang === "en"
      ? "Base: team season data"
      : lang === "es"
      ? "Base: datos de temporada del equipo"
      : "Base: dados da temporada do time";
  }

  if (normalized === "recent_fixtures") {
    return lang === "en"
      ? "Base: recent form"
      : lang === "es"
      ? "Base: forma reciente"
      : "Base: forma recente";
  }

  if (normalized === "league_prior") {
    return lang === "en"
      ? "Base: league average, limited team data"
      : lang === "es"
      ? "Base: promedio de liga, datos limitados del equipo"
      : "Base: média da liga, dados limitados do time";
  }

  if (!normalized) return null;

  return lang === "en"
    ? "Base: model data"
    : lang === "es"
    ? "Base: datos del modelo"
    : "Base: dados do modelo";
}

function getModelConfidenceNotes(
  lang: Lang,
  confidence?: ProductOddsEvent["snapshot_summary"] extends infer S
    ? S extends { confidence?: infer C }
      ? C
      : null
    : null,
  guardrails?: ProductOddsEvent["snapshot_summary"] extends infer S
    ? S extends { guardrails?: infer G }
      ? G
      : null
    : null
) {
  const notes: string[] = [];
  const factors = (confidence as any)?.factors || {};
  const coverage = (confidence as any)?.coverage || {};
  const blockedReasons = Array.isArray((guardrails as any)?.blocked_reasons)
    ? (guardrails as any).blocked_reasons
    : [];

  const coverageTier =
    (guardrails as any)?.coverage_tier ||
    factors.coverage_tier ||
    coverage.match_coverage_tier ||
    null;

  /*
   * Temporariamente oculto do card público de confiança.
   *
   * A cobertura técnica do modelo pode ser útil futuramente para debug,
   * auditoria ou uma visão avançada, mas por enquanto gera redundância
   * com a porcentagem e o nível de confiança exibidos ao usuário.
   *
   * if (coverageTier) {
   *   notes.push(
   *     lang === "en"
   *       ? `Coverage: ${coverageTier}`
   *       : lang === "es"
   *       ? `Cobertura: ${coverageTier}`
   *       : `Cobertura: ${coverageTier}`
   *   );
   * }
   */

  if (blockedReasons.includes("low_model_confidence")) {
    notes.push(
      lang === "en"
        ? "Low statistical confidence."
        : lang === "es"
        ? "Confianza estadística baja."
        : "Baixa confiança estatística."
    );
  }

  if (blockedReasons.includes("insufficient_team_coverage")) {
    notes.push(
      lang === "en"
        ? "Limited team coverage."
        : lang === "es"
        ? "Cobertura limitada de equipos."
        : "Cobertura limitada dos times."
    );
  }

  if (blockedReasons.includes("large_cross_league_strength_gap")) {
    notes.push(
      lang === "en"
        ? "Cross-league strength adjustment applied."
        : lang === "es"
        ? "Ajuste de fuerza entre ligas aplicado."
        : "Ajuste de força entre ligas aplicado."
    );
  }

  if (factors.lambda_floor_hit) {
    notes.push(
      lang === "en"
        ? "Extreme lambda guardrail triggered."
        : lang === "es"
        ? "Protección por lambda extremo activada."
        : "Proteção por lambda extremo ativada."
    );
  }

  if (!notes.length && (confidence as any)?.source) {
    const sourceLabel = getModelSourceLabel(lang, (confidence as any).source);
    if (sourceLabel) {
      notes.push(sourceLabel);
    }
  }

  return notes.slice(0, 3);
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

function normalizeDecisionLabel(label: unknown): string {
  return String(label ?? "").trim().toUpperCase();
}

function getEventDecisionSummary(
  event: ProductOddsEvent | null | undefined
): ProductDecisionSummary | null {
  if (!event?.decision_summary || typeof event.decision_summary !== "object") {
    return null;
  }

  return event.decision_summary;
}

function getEventDecisionLabel(event: ProductOddsEvent | null | undefined): string {
  return normalizeDecisionLabel(getEventDecisionSummary(event)?.label);
}

function isPositiveDecisionLabel(label: string) {
  return label === "OPPORTUNITY" || label === "CAUTION_OPPORTUNITY";
}

function eventDecisionIsPositive(event: ProductOddsEvent | null | undefined) {
  const summary = getEventDecisionSummary(event);
  const label = normalizeDecisionLabel(summary?.label);

  if (!label) return null;

  if (typeof summary?.is_positive === "boolean") {
    return summary.is_positive && isPositiveDecisionLabel(label);
  }

  return isPositiveDecisionLabel(label);
}

function getDecisionAnalysisChipMeta(
  event: ProductOddsEvent | null | undefined,
  lang: Lang
): { label: string; description: string; icon: string; tone: string } | null {
  const label = getEventDecisionLabel(event);
  if (!label) return null;

  if (label === "OPPORTUNITY") {
    return {
      icon: "✦",
      tone: "opportunity",
      label:
        lang === "en"
          ? "Worth a look"
          : lang === "es"
          ? "Vale la atención"
          : "Vale atenção",
      description:
        lang === "en"
          ? "The odd looks good for prevIA's read."
          : lang === "es"
          ? "La cuota parece buena para la lectura de prevIA."
          : "A odd parece boa para a leitura do prevIA.",
    };
  }

  if (label === "CAUTION_OPPORTUNITY") {
    return {
      icon: "!",
      tone: "caution",
      label:
        lang === "en"
          ? "Go with caution"
          : lang === "es"
          ? "Con cautela"
          : "Com cautela",
      description:
        lang === "en"
          ? "There is a signal, but it is not a clean entry."
          : lang === "es"
          ? "Hay señal, pero no es una entrada limpia."
          : "Tem sinal, mas não é uma entrada limpa.",
    };
  }

  if (label === "NO_GOOD_PRICE") {
    return {
      icon: "−",
      tone: "no-good-price",
      label:
        lang === "en"
          ? "Not at this price"
          : lang === "es"
          ? "No a este precio"
          : "Não vale nesse preço",
      description:
        lang === "en"
          ? "The scenario may make sense, but the odd is too short."
          : lang === "es"
          ? "El escenario puede tener sentido, pero la cuota está corta."
          : "O cenário pode fazer sentido, mas a odd está curta.",
    };
  }

  if (label === "NO_CLEAR_EDGE") {
    return {
      icon: "○",
      tone: "neutral",
      label:
        lang === "en"
          ? "Better to pass"
          : lang === "es"
          ? "Mejor pasar"
          : "Melhor passar",
      description:
        lang === "en"
          ? "No clear advantage showed up right now."
          : lang === "es"
          ? "No apareció una ventaja clara ahora."
          : "Não apareceu uma vantagem clara agora.",
    };
  }

  if (label === "HIGH_RISK") {
    return {
      icon: "!",
      tone: "risk",
      label:
        lang === "en"
          ? "High risk"
          : lang === "es"
          ? "Riesgo alto"
          : "Risco alto",
      description:
        lang === "en"
          ? "The price may stand out, but the risk weighs more."
          : lang === "es"
          ? "El precio puede llamar la atención, pero el riesgo pesa más."
          : "O preço pode chamar atenção, mas o risco pesa mais.",
    };
  }

  if (label === "INSUFFICIENT_DATA") {
    return {
      icon: "?",
      tone: "muted",
      label:
        lang === "en"
          ? "Not enough data"
          : lang === "es"
          ? "Datos insuficientes"
          : "Dados insuficientes",
      description:
        lang === "en"
          ? "There is not enough information to call it safely."
          : lang === "es"
          ? "Todavía falta información para una lectura segura."
          : "Ainda falta informação para uma leitura segura.",
    };
  }

  return null;
}

function renderDecisionAnalysisChip(
  event: ProductOddsEvent | null | undefined,
  lang: Lang
) {
  const chip = getDecisionAnalysisChipMeta(event, lang);
  if (!chip) return null;

  return (
    <div className={`pi-analysis-decision-chip pi-analysis-decision-chip--${chip.tone}`}>
      <span className="pi-analysis-decision-chip-icon" aria-hidden="true">
        {chip.icon}
      </span>
      <div className="pi-analysis-decision-chip-body">
        <div className="pi-analysis-decision-chip-label">{chip.label}</div>
        <div className="pi-analysis-decision-chip-description">{chip.description}</div>
      </div>
    </div>
  );
}

function eventHasOpportunity(event: ProductOddsEvent | null | undefined) {
  if (!event) return false;

  const decisionPositive = eventDecisionIsPositive(event);
  if (typeof decisionPositive === "boolean") return decisionPositive;

  if (typeof event.has_opportunity === "boolean") return event.has_opportunity;

  return hasOpportunity(event.edge_summary);
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

function leagueCountryDisplayName(
  league: ProductLeagueItem | null | undefined,
  lang: Lang
) {
  if (!league) return "";

  const localized = getCountryNameByCode(league.official_country_code, lang);
  if (localized) return localized;

  return String(league.country_name ?? "").trim();
}

function leagueWithCountryLabel(
  league: ProductLeagueItem | null | undefined,
  lang: Lang
) {
  const leagueName = leagueDisplayName(league, lang);
  const countryName = leagueCountryDisplayName(league, lang);

  if (!leagueName) return countryName;
  if (!countryName) return leagueName;

  return `${leagueName} - ${countryName}`;
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

function getPublicEmbedEmptyAnalysisCopy(lang: Lang) {
  return {
    pt: {
      eyebrow: "Análise grátis",
      title: "Abra sua primeira análise grátis",
      body: "Clique em um jogo da lista para ver probabilidades, odds, preço justo e valor do confronto.",
      bullets: [
        "Probabilidades estimadas",
        "Odds e preço justo",
        "Diferença entre modelo e mercado",
      ],
      note: "A consulta só é usada quando você abrir a análise.",
    },
    en: {
      eyebrow: "Free analysis",
      title: "Open your first free analysis",
      body: "Click a match from the list to see probabilities, odds, fair price, and value for the matchup.",
      bullets: [
        "Estimated probabilities",
        "Odds and fair price",
        "Gap between model and market",
      ],
      note: "A check is only used when you open the analysis.",
    },
    es: {
      eyebrow: "Análisis gratis",
      title: "Abre tu primer análisis gratis",
      body: "Haz clic en un partido de la lista para ver probabilidades, cuotas, precio justo y valor del encuentro.",
      bullets: [
        "Probabilidades estimadas",
        "Cuotas y precio justo",
        "Diferencia entre modelo y mercado",
      ],
      note: "La consulta solo se usa cuando abres el análisis.",
    },
  }[lang];
}

export default function ProductIndex({ mode = "app" }: ProductIndexProps) {
  const store = useProductStore();
  const isPublicEmbed = mode === "public_embed";
  const lang = store.state.lang as Lang;
  const vis = store.entitlements.visibility;

  const plan = store.entitlements.plan as PlanId;
  const isAnonymousTelemetryRuntime = plan === "FREE_ANON" && !store.state.auth.is_logged_in;
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

  const persistedFilters = useMemo(
    () => (isPublicEmbed ? null : readPersistedProductIndexFilters()),
    [isPublicEmbed]
  );

  const [sportKey, setSportKey] = useState<string>("");
  const league = useMemo(() => {
    const list = leagues;
    if (!list.length) return null;
    return list.find((l) => l.sport_key === sportKey) ?? list[0];
  }, [leagues, sportKey]);

  const leaguesBySportKey = useMemo(() => {
    return new Map(leagues.map((item) => [item.sport_key, item]));
  }, [leagues]);

  const [windowMode, setWindowMode] = useState<WindowMode>(() =>
    isPublicEmbed ? "UPCOMING" : sanitizeWindowMode(persistedFilters?.windowMode)
  );

  const [sortBy, setSortBy] = useState<SortBy>(() =>
    isPublicEmbed ? "DATE" : sanitizeSortBy(persistedFilters?.sortBy)
  );

  const [onlyOpportunities, setOnlyOpportunities] = useState<boolean>(
    () => (isPublicEmbed ? false : persistedFilters?.onlyOpportunities === true)
  );

  const [onlyRevealed, setOnlyRevealed] = useState<boolean>(
    () => (isPublicEmbed ? false : persistedFilters?.onlyRevealed === true)
  );

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCountryCodes, setSelectedCountryCodes] = useState<string[]>(
    () => sanitizeStringArray(persistedFilters?.selectedCountryCodes)
  );
  const [selectedLeagueSportKeys, setSelectedLeagueSportKeys] = useState<string[]>(
    () => sanitizeStringArray(persistedFilters?.selectedLeagueSportKeys)
  );
  const [selectedBookKeys, setSelectedBookKeys] = useState<string[]>(
    () => sanitizeStringArray(persistedFilters?.selectedBookKeys)
  );
  const [selectedTeams, setSelectedTeams] = useState<string[]>(
    () => sanitizeStringArray(persistedFilters?.selectedTeams)
  );

  const [hasLoadedLeaguesOnce, setHasLoadedLeaguesOnce] = useState(false);
  const [hasLoadedEventsOnce, setHasLoadedEventsOnce] = useState(false);

  const eventsRequestSeqRef = useRef(0);
  const isLoadingEventsRef = useRef(false);
  const pendingEventsReloadRef = useRef(false);
  const autoQuoteRequestRef = useRef<string>("");
  const eventsCacheRef = useRef<Record<string, ProductEventsCacheEntry>>({});

  const countryOptions = useMemo(() => buildCountryOptions(leagues, lang), [leagues, lang]);

  const leagueOptions = useMemo(
    () => buildLeagueOptions(leagues, lang, selectedCountryCodes),
    [leagues, lang, selectedCountryCodes]
  );

  const bookOptions = useMemo(() => buildBookOptions(events), [events]);
  const teamOptions = useMemo(() => buildTeamOptions(events), [events]);

  const activeLeagueSportKeys = useMemo(() => {
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
      if (kickoffMs + ACTIVE_EVENT_GRACE_MS < nowMs) continue;

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
  }, [leagues, windowMode]);

  const fetchLeagues = useMemo(() => {
    const items = activeLeagueSportKeys
      .map((key) => leaguesBySportKey.get(key))
      .filter(Boolean) as Array<
      ProductLeagueItem & { assume_season: number; artifact_filename: string | null }
    >;

    if (isPublicEmbed) {
      return items.slice(0, PUBLIC_EMBED_MAX_LEAGUES);
    }

    return items;
  }, [activeLeagueSportKeys, leaguesBySportKey, isPublicEmbed]);

  const upcomingFallbackFetchLeagues = useMemo(() => {
    const nowMs = Date.now();

    const items = leagues.filter((item) => {
      const kickoffRaw = item.next_kickoff_utc;
      if (!kickoffRaw) return false;

      const kickoffMs = new Date(kickoffRaw).getTime();
      if (!Number.isFinite(kickoffMs)) return false;
      if (kickoffMs + ACTIVE_EVENT_GRACE_MS < nowMs) return false;

      return true;
    });

    if (isPublicEmbed) {
      return items.slice(0, PUBLIC_EMBED_MAX_LEAGUES);
    }

    return items.slice(0, UPCOMING_FALLBACK_MAX_LEAGUES);
  }, [leagues, isPublicEmbed]);

  const hasActiveFilters =
    selectedCountryCodes.length > 0 ||
    selectedLeagueSportKeys.length > 0 ||
    selectedBookKeys.length > 0 ||
    selectedTeams.length > 0 ||
    onlyOpportunities ||
    onlyRevealed;

  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const creditsResetCountdown = useMemo(() => {
    return fmtCountdownToIso(store.entitlements.credits.resets_at_iso, nowTick);
  }, [store.entitlements.credits.resets_at_iso, nowTick]);

  const [selectedId, setSelectedId] = useState<string>("");

  const [quoteLoading, setQuoteLoading] = useState(false);
  const [analysisOpening, setAnalysisOpening] = useState(false);
  const [quote, setQuote] = useState<ProductOddsQuoteResponse | null>(null);
  const [quoteCacheByEventId, setQuoteCacheByEventId] = useState<Record<string, ProductOddsQuoteResponse>>({});
  const [quoteError, setQuoteError] = useState<string>("");

  const isAnalysisLoading = analysisOpening || quoteLoading;
  const isOperationalLoading = !isAnalysisLoading && (loadingEvents || leaguesLoading);

  const [isMobileAnalysisView, setIsMobileAnalysisView] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= MOBILE_ANALYSIS_BREAKPOINT;
  });

  const [mobileAnalysisOpen, setMobileAnalysisOpen] = useState(false);
  const [booksModalEventId, setBooksModalEventId] = useState<string>("");
  const hasTrackedProductIndexViewRef = useRef(false);
  const canOpenBooksModal = canOpenBooksModalForPlan(plan);

  useEffect(() => {
    if (hasTrackedProductIndexViewRef.current) return;
    hasTrackedProductIndexViewRef.current = true;

    trackProductTelemetry("product_index_viewed", {
      surface: isPublicEmbed ? "public_embed" : "app",
      actor_type: isAnonymousTelemetryRuntime ? "anonymous" : "user",
      plan_code: isAnonymousTelemetryRuntime ? "FREE_ANON" : plan,
      auth_mode: isAnonymousTelemetryRuntime ? "anonymous" : store.bootstrap.auth_mode ?? "session",
      mode,
      lang,
    });
  }, [isAnonymousTelemetryRuntime, isPublicEmbed, lang, mode, plan, store.bootstrap.auth_mode]);

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
      const cached = readStoredLeaguesCache();

      if (cached && Date.now() - cached.createdAt <= LEAGUES_CACHE_TTL_MS) {
        setLeagues(cached.leagues);
        setHasLoadedLeaguesOnce(true);
        setLeaguesLoading(false);
        return;
      }

      const data = await productListLeagues();
      const items = (data?.items ?? []).map((l) => applyLeagueOverride(l));
      const loadedAt = Date.now();

      writeStoredLeaguesCache({
        createdAt: loadedAt,
        leagues: items,
      });

      setLeagues(items);
      setSportKey((prev) => {
        if (prev && items.some((item) => item.sport_key === prev)) return prev;
        return items[0]?.sport_key ?? "";
      });
    } catch (e: any) {
      setLeaguesError(e?.message ?? "Failed to load leagues");
    } finally {
      setLeaguesLoading(false);
      setHasLoadedLeaguesOnce(true);
    }
  }, []);

  function beginEventsReloadTransition() {
    eventsRequestSeqRef.current += 1;
    setLoadingEvents(true);
    setEventsError("");
    setEvents([]);
    setSelectedId("");
    setBooksModalEventId("");
    clearQuoteUI();
  }

  function handleCountryCodesChange(next: string[]) {
    setSelectedCountryCodes(next);
    setSelectedLeagueSportKeys([]);
    setSelectedBookKeys([]);
    setSelectedTeams([]);
    setSelectedId("");
    setBooksModalEventId("");
    clearQuoteUI();
  }

  function handleLeagueSportKeysChange(next: string[]) {
    setSelectedLeagueSportKeys(next);
    setSelectedBookKeys([]);
    setSelectedTeams([]);
    setSelectedId("");
    setBooksModalEventId("");
    clearQuoteUI();
  }

  function clearAdvancedFilters() {
    setSelectedCountryCodes([]);
    setSelectedLeagueSportKeys([]);
    setSelectedBookKeys([]);
    setSelectedTeams([]);
    setOnlyOpportunities(false);
    setOnlyRevealed(false);
    setSortBy("DATE");
    setSelectedId("");
    setBooksModalEventId("");
    clearQuoteUI();
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

  function renderOnlyRevealedToggle(extraClassName = "") {
    return (
      <button
        type="button"
        className={`pi-toggle-inline ${onlyRevealed ? "is-active" : ""} ${extraClassName}`.trim()}
        onClick={() => setOnlyRevealed((prev) => !prev)}
        role="switch"
        aria-checked={onlyRevealed}
      >
        <span className="pi-toggle-inline-copy">{t(lang, "odds.onlyRevealed")}</span>

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
            // Mantido no WindowMode/sanitizeWindowMode para reativação futura.
            // Oculto temporariamente para reduzir combinações de cache e consultas.
            // { value: "3", label: t(lang, "odds.window3d") },
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
                ? "Highest model confidence"
                : lang === "es"
                ? "Mayor confianza del modelo"
                : "Maior confiança do modelo",
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
    if (!hasLoadedLeaguesOnce) return;

    const allowed = new Set(countryOptions.map((item) => item.value));
    setSelectedCountryCodes((prev) => {
      const next = prev.filter((item) => allowed.has(item));
      return sameStringArray(prev, next) ? prev : next;
    });
  }, [hasLoadedLeaguesOnce, countryOptions]);

  useEffect(() => {
    if (!hasLoadedLeaguesOnce) return;

    const allowed = new Set(leagueOptions.map((item) => item.value));
    setSelectedLeagueSportKeys((prev) => {
      const next = prev.filter((item) => allowed.has(item));
      return sameStringArray(prev, next) ? prev : next;
    });
  }, [hasLoadedLeaguesOnce, leagueOptions]);

  useEffect(() => {
    if (!hasLoadedEventsOnce) return;

    const allowed = new Set(bookOptions.map((item) => item.value));
    setSelectedBookKeys((prev) => {
      const next = prev.filter((item) => allowed.has(item));
      return sameStringArray(prev, next) ? prev : next;
    });
  }, [hasLoadedEventsOnce, bookOptions]);

  useEffect(() => {
    if (!hasLoadedEventsOnce) return;

    const allowed = new Set(teamOptions.map((item) => item.value));
    setSelectedTeams((prev) => {
      const next = prev.filter((item) => allowed.has(item));
      return sameStringArray(prev, next) ? prev : next;
    });
  }, [hasLoadedEventsOnce, teamOptions]);

  useEffect(() => {
    if (isPublicEmbed) return;

    writePersistedProductIndexFilters({
      windowMode,
      sortBy,
      onlyOpportunities,
      onlyRevealed,
      selectedCountryCodes,
      selectedLeagueSportKeys,
      selectedBookKeys,
      selectedTeams,
    });
  }, [
    isPublicEmbed,
    windowMode,
    sortBy,
    onlyOpportunities,
    onlyRevealed,
    selectedCountryCodes,
    selectedLeagueSportKeys,
    selectedBookKeys,
    selectedTeams,
  ]);

  const loadEvents = useCallback(async () => {
    if (!hasLoadedLeaguesOnce) return;

    if (isLoadingEventsRef.current) {
      pendingEventsReloadRef.current = true;
      return;
    }

    pendingEventsReloadRef.current = false;
    isLoadingEventsRef.current = true;

    const requestSeq = ++eventsRequestSeqRef.current;

    try {
      const baseFetchLeagues =
        windowMode === "UPCOMING" ? upcomingFallbackFetchLeagues : fetchLeagues;

      if (!baseFetchLeagues.length) {
        if (requestSeq !== eventsRequestSeqRef.current) return;

        setEvents([]);
        setSelectedId("");
        setQuote(null);
        setQuoteError("");
        setLastLoadedAt(Date.now());
        setLoadingEvents(false);
        setHasLoadedEventsOnce(true);
        return;
      }

      setLoadingEvents(true);
      setEventsError("");

      const includeRevealed = !isPublicEmbed && store.backendUsage.is_ready;
      const revealedKeys = includeRevealed ? store.backendUsage.revealed_fixture_keys : [];
      const cacheTtlMs = isPublicEmbed ? PUBLIC_EMBED_EVENTS_CACHE_TTL_MS : EVENTS_CACHE_TTL_MS;
      const hoursAheadAttempts =
        windowMode === "UPCOMING"
          ? [UPCOMING_WINDOW_HOURS, UPCOMING_FALLBACK_7D_HOURS, UPCOMING_FALLBACK_30D_HOURS]
          : [getFetchHoursAheadForWindowMode(windowMode)];

      let nextEvents: ProductOddsEvent[] = [];
      let loadedAt = Date.now();
      let firstAttemptError: any = null;

      for (const hoursAhead of hoursAheadAttempts) {
        const fetchLeagueKeys = baseFetchLeagues.map((item) => item.sport_key);
        const cacheKey = buildEventsCacheKey({
          productMode: mode,
          hoursAhead,
          leagueKeys: fetchLeagueKeys,
          includeRevealed,
          revealedKeys,
        });
        const cached = eventsCacheRef.current[cacheKey] ?? readStoredEventsCache(cacheKey);

        if (cached && Date.now() - cached.createdAt <= cacheTtlMs) {
          if (requestSeq !== eventsRequestSeqRef.current) return;

          nextEvents = cached.events;
          loadedAt = cached.createdAt;
        } else {
          const settled = await mapWithConcurrency(
            baseFetchLeagues,
            EVENT_FETCH_CONCURRENCY,
            async (cfg) => {
              const res = await productListOddsEvents({
                sport_key: cfg.sport_key,
                hours_ahead: hoursAhead,
                limit: UI_DEFAULTS.limit,
                assume_league_id: cfg.league_id,
                assume_season: cfg.assume_season,
                artifact_filename: cfg.artifact_filename ?? undefined,
                include_revealed: includeRevealed,
              });

              return res?.events ?? [];
            }
          );

          if (requestSeq !== eventsRequestSeqRef.current) return;

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
            firstAttemptError = firstAttemptError ?? firstError;

            if (windowMode !== "UPCOMING") {
              throw firstError;
            }

            continue;
          }

          nextEvents = Array.from(merged.values());
          loadedAt = Date.now();

          const cacheEntry: ProductEventsCacheEntry = {
            createdAt: loadedAt,
            events: nextEvents,
          };

          eventsCacheRef.current[cacheKey] = cacheEntry;
          writeStoredEventsCache(cacheKey, cacheEntry);
        }

        const hasUsableEvents = nextEvents.some((item) => hasUsableAnalysisStatus(item.match_status));
        const isLastAttempt = hoursAhead === hoursAheadAttempts[hoursAheadAttempts.length - 1];

        if (windowMode !== "UPCOMING" || hasUsableEvents || isLastAttempt) {
          break;
        }
      }

      if (!nextEvents.length && firstAttemptError) {
        throw firstAttemptError;
      }

      setEvents(nextEvents);
      setLastLoadedAt(loadedAt);
    } catch (e: any) {
      if (requestSeq !== eventsRequestSeqRef.current) return;
      setEventsError(e?.message ?? "Failed to load events");
    } finally {
      isLoadingEventsRef.current = false;

      const shouldReloadAfterCurrentRun = pendingEventsReloadRef.current;
      pendingEventsReloadRef.current = false;

      if (requestSeq !== eventsRequestSeqRef.current) return;
      setLoadingEvents(false);
      setHasLoadedEventsOnce(true);

      if (shouldReloadAfterCurrentRun) {
        window.setTimeout(() => {
          void loadEvents();
        }, 0);
      }
    }
  }, [
    fetchLeagues,
    upcomingFallbackFetchLeagues,
    windowMode,
    hasLoadedLeaguesOnce,
    isPublicEmbed,
    mode,
    store.backendUsage.is_ready,
    store.backendUsage.revealed_fixture_keys,
  ]);

  // Auto-refresh: 12h (fallback) + refresh ao voltar para a aba
  useEffect(() => {
    // fallback longo
    if (isPublicEmbed) return;
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
  }, [isPublicEmbed, loadEvents]);

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

  function buildEventTelemetryPayload(eventItem: ProductOddsEvent | null | undefined) {
    const leagueItem = eventItem?.sport_key ? leaguesBySportKey.get(eventItem.sport_key) : null;

    return {
      surface: isPublicEmbed ? "public_embed" : "app",
      actor_type: isAnonymousTelemetryRuntime ? "anonymous" : "user",
      plan_code: isAnonymousTelemetryRuntime ? "FREE_ANON" : plan,
      auth_mode: isAnonymousTelemetryRuntime ? "anonymous" : store.bootstrap.auth_mode ?? "session",
      mode,
      lang,
      event_id: eventItem?.event_id != null ? String(eventItem.event_id) : null,
      sport_key: eventItem?.sport_key ?? null,
      league_name: leagueItem ? leagueDisplayName(leagueItem, lang) : null,
      home_name: eventItem?.home_name ?? null,
      away_name: eventItem?.away_name ?? null,
      kickoff_utc: eventItem?.commence_time_utc ?? null,
      match_status: eventItem?.match_status ?? null,
      best_edge: eventItem?.edge_summary?.best_edge ?? null,
    };
  }

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

      const res = await productQuoteOdds({
        event_id: eventIdStr,
        assume_league_id: Number(quoteLeague.league_id),
        assume_season: Number(quoteLeague.assume_season),
        artifact_filename: quoteLeague.artifact_filename ?? undefined,
        tol_hours: Number(UI_DEFAULTS.tolHoursFallback),
      });
      setQuote(res);
      setQuoteCacheByEventId((prev) => ({
        ...prev,
        [eventIdStr]: res,
      }));

      if (isAnonymousTelemetryRuntime && selectedEvent) {
        trackProductTelemetry("anon_analysis_opened", {
          ...buildEventTelemetryPayload(selectedEvent),
          has_edge: Boolean(selectedEvent.edge_summary),
        });
      }
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
    const nextId = String(eventId);
    const cachedQuote = quoteCacheByEventId[nextId] ?? null;
    const eventItem = visibleEvents.find((item) => String(item.event_id) === nextId) ?? null;

    if (nextId === String(selectedId)) {
      if (isMobileAnalysisView) {
        setMobileAnalysisOpen(true);
      }

      if (
        store.isRevealed(nextId) &&
        !quote &&
        !quoteLoading &&
        !analysisOpening
      ) {
        void runQuote(nextId);
      }

      return;
    }

    setSelectedId(nextId);
    setQuote(cachedQuote);
    setQuoteError("");

    if (isAnonymousTelemetryRuntime && eventItem) {
      trackProductTelemetry("anon_match_selected", buildEventTelemetryPayload(eventItem));
    }

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
    const anonymousRemainingBefore = store.entitlements.credits.remaining_today;
    const anonymousUsedBefore = store.entitlements.credits.used_today;

    if (isAnonymousTelemetryRuntime) {
      trackProductTelemetry("anon_reveal_started", {
        ...buildEventTelemetryPayload(ev),
        remaining_before: anonymousRemainingBefore,
        used_today_before: anonymousUsedBefore,
        daily_limit: store.entitlements.credits.daily_limit,
      });
    }

    setAnalysisOpening(true);

    try {
      const isAuthBootstrapPending =
        PRODUCT_AUTH_ENABLED &&
        !store.bootstrap.is_ready;

      if (isAuthBootstrapPending) {
        setQuoteError(
          lang === "en"
            ? "Still loading your account. Please try again in a moment."
            : lang === "es"
            ? "Aún estamos cargando tu cuenta. Inténtalo de nuevo en un momento."
            : "Ainda estamos carregando sua conta. Tente novamente em instantes."
        );
        return;
      }

      const isAuthenticatedProductUser =
        store.bootstrap.is_ready &&
        store.bootstrap.user_id != null;

      if (isAuthenticatedProductUser) {
        if (store.backendUsage.is_ready && store.isRevealed(fixtureKey)) {
          await runQuote(fixtureKey);
          return;
        }

        const r = await store.revealViaBackend(fixtureKey);

      if (!r.ok) {
        if (r.reason === "NO_CREDITS") {
          if (isAnonymousTelemetryRuntime) {
            trackProductTelemetry("anon_reveal_blocked_no_credits", {
              ...buildEventTelemetryPayload(ev),
              used_today: anonymousUsedBefore,
              remaining: anonymousRemainingBefore,
              daily_limit: store.entitlements.credits.daily_limit,
            });
          }

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
        return;
      }

      if (store.isRevealed(fixtureKey)) {
        await runQuote(fixtureKey);
        return;
      }

      const r = store.tryReveal(fixtureKey);

      if (!r.ok) {
        if (r.reason === "NO_CREDITS") {
          if (isAnonymousTelemetryRuntime) {
            trackProductTelemetry("anon_reveal_blocked_no_credits", {
              ...buildEventTelemetryPayload(ev),
              used_today: anonymousUsedBefore,
              remaining: anonymousRemainingBefore,
              daily_limit: store.entitlements.credits.daily_limit,
            });
          }

          setUpgradeReason("NO_CREDITS");
          setUpgradeOpen(true);
          return;
        }

        if (r.reason !== "ALREADY_REVEALED") {
          console.error("Reveal failed:", r.reason);
          return;
        }
      }

      if (isAnonymousTelemetryRuntime && r.ok) {
        trackProductTelemetry("anon_reveal_succeeded", {
          ...buildEventTelemetryPayload(ev),
          used_credit: true,
          used_today_before: anonymousUsedBefore,
          remaining_before: anonymousRemainingBefore,
          remaining_after: Math.max(0, anonymousRemainingBefore - 1),
          daily_limit: store.entitlements.credits.daily_limit,
        });
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
    if (!hasLoadedLeaguesOnce) return;
    loadEvents();
  }, [hasLoadedLeaguesOnce, loadEvents]);

  // lista visível (filtro client-side)
  const visibleEventsState = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const { start: todayStart, end: todayEnd } = getCalendarDayBounds(now);

    const selectedBookSet = selectedBookKeys.length ? new Set(selectedBookKeys) : null;
    const selectedTeamSet = selectedTeams.length ? new Set(selectedTeams) : null;

    const selectedCountrySet = selectedCountryCodes.length ? new Set(selectedCountryCodes) : null;
    const selectedLeagueSet = selectedLeagueSportKeys.length ? new Set(selectedLeagueSportKeys) : null;

    const leagueCountryBySportKey = new Map(
      leagues.map((item) => [item.sport_key, String(item.official_country_code ?? "").trim()])
    );

    const futureFiltered = events.filter((e) => {
      const kickoffRaw = e.commence_time_utc;
      if (!kickoffRaw) return false;

      const kickoff = new Date(kickoffRaw);
      if (Number.isNaN(kickoff.getTime())) return false;
      if (kickoff.getTime() + ACTIVE_EVENT_GRACE_MS < nowMs) return false;

      if (!hasUsableAnalysisStatus(e.match_status)) return false;

      if (selectedLeagueSet && !selectedLeagueSet.has(e.sport_key)) {
        return false;
      }

      if (selectedCountrySet) {
        const countryCode = leagueCountryBySportKey.get(e.sport_key) ?? "";
        if (!selectedCountrySet.has(countryCode)) return false;
      }

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

      if (onlyOpportunities && !eventHasOpportunity(e)) {
        return false;
      }

      if (onlyRevealed && !store.isRevealed(String(e.event_id))) {
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
      list.sort((a, b) => {
        const confidenceA = getEventModelConfidenceOverall(a) ?? -Infinity;
        const confidenceB = getEventModelConfidenceOverall(b) ?? -Infinity;

        if (confidenceA !== confidenceB) return confidenceB - confidenceA;

        return new Date(a.commence_time_utc ?? "").getTime() - new Date(b.commence_time_utc ?? "").getTime();
      });
    } else {
      list.sort((a, b) => {
        const edgeA =
          typeof a.edge_summary?.best_edge === "number" && Number.isFinite(a.edge_summary.best_edge)
            ? a.edge_summary.best_edge
            : eventHasOpportunity(a)
            ? 1
            : -Infinity;

        const edgeB =
          typeof b.edge_summary?.best_edge === "number" && Number.isFinite(b.edge_summary.best_edge)
            ? b.edge_summary.best_edge
            : eventHasOpportunity(b)
            ? 1
            : -Infinity;

        const safeA = edgeA;
        const safeB = edgeB;

        if (safeA !== safeB) return safeB - safeA;

        return new Date(a.commence_time_utc ?? "").getTime() - new Date(b.commence_time_utc ?? "").getTime();
      });
    }

    return {
      items: list,
      useUpcomingFallback,
    };
  }, [
      events,
      windowMode,
      sortBy,
      selectedCountryCodes,
      selectedLeagueSportKeys,
      selectedBookKeys,
      selectedTeams,
      onlyOpportunities,
      onlyRevealed,
      leagues,
      store,
    ]);

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

  const key = selectedId ? String(selectedId) : "";
  const alreadyRevealed = key ? store.isRevealed(key) : false;
  const canReveal = key ? store.canReveal(key) : false;

  const selectedUnlockedProbs = useMemo(() => {
    if (!alreadyRevealed || !selected?.probs_1x2) return null;
    return {
      H: selected.probs_1x2.H ?? null,
      D: selected.probs_1x2.D ?? null,
      A: selected.probs_1x2.A ?? null,
    };
  }, [alreadyRevealed, selected]);

  const effectiveProbs = quote?.probs ?? selectedUnlockedProbs ?? null;

  const effectiveMatchStatus = quote?.matchup?.status ?? selected?.match_status ?? null;

  const selectedUnlockedSnapshot =
    alreadyRevealed ? (selected?.snapshot_summary ?? null) : null;

  const selectedSnapshot =
    quote?.snapshot_summary ?? selectedUnlockedSnapshot ?? null;

  const matchNarrativeContext = useMemo(() => {
    if (!selected) return null;

    return pickSnapshotNarrativeContext(
      selectedSnapshot?.narrative_context,
      lang,
      plan,
      selected.home_name,
      selected.away_name,
      effectiveProbs
    );
  }, [effectiveProbs, lang, plan, selected, selectedSnapshot]);

  const effectiveModelConfidence = selectedSnapshot?.confidence ?? null;
  const effectiveModelGuardrails = selectedSnapshot?.guardrails ?? null;
  const effectiveModelConfidenceOverall =
    typeof effectiveModelConfidence?.overall === "number" &&
    Number.isFinite(effectiveModelConfidence.overall)
      ? effectiveModelConfidence.overall
      : null;
  const effectiveModelConfidenceLevel = effectiveModelConfidence?.level ?? null;
  const modelConfidenceNotes = getModelConfidenceNotes(
    lang,
    effectiveModelConfidence,
    effectiveModelGuardrails
  );

  const effectiveEdgeSummary =
    quote?.edge_summary ??
    (alreadyRevealed ? (selected?.edge_summary ?? null) : null);

  const selectedTotals = selectedSnapshot?.totals as
    | {
        line?: number | null;
        main_line?: number | null;
        p_over?: number | null;
        p_under?: number | null;
        best_over?: number | null;
        best_under?: number | null;
        best_odds?: {
          over?: number | null;
          under?: number | null;
        } | null;
      }
    | null
    | undefined;

  const totalsLine = selectedTotals?.line ?? selectedTotals?.main_line ?? null;
  const totalsOver = selectedTotals?.p_over ?? null;
  const totalsUnder = selectedTotals?.p_under ?? null;
  const totalsBestOver =
    selectedTotals?.best_over ?? selectedTotals?.best_odds?.over ?? null;
  const totalsBestUnder =
    selectedTotals?.best_under ?? selectedTotals?.best_odds?.under ?? null;

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
    !!effectiveEdgeSummary ||
    !!matchNarrativeContext ||
    effectiveMatchStatus === "MODEL_FOUND" ||
    !!selected?.has_model;

  const selectedHasUnlockedPayload =
    !!selectedUnlockedProbs ||
    !!selectedUnlockedSnapshot ||
    !!matchNarrativeContext ||
    !!effectiveEdgeSummary;

  const analysisOpened =
    !!quote ||
    !!quoteError ||
    (alreadyRevealed && selectedHasUnlockedPayload);

  useEffect(() => {
    const eventId = String(selectedId ?? "").trim();
    if (!eventId) return;
    if (!alreadyRevealed) return;
    if (quote || quoteLoading || analysisOpening) return;

    const cachedQuote = quoteCacheByEventId[eventId] ?? null;

    if (cachedQuote) {
      setQuote(cachedQuote);
      return;
    }

    if (autoQuoteRequestRef.current === eventId) return;

    autoQuoteRequestRef.current = eventId;

    void runQuote(eventId).finally(() => {
      if (autoQuoteRequestRef.current === eventId) {
        autoQuoteRequestRef.current = "";
      }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, alreadyRevealed]);

  function renderAnalysisPane() {
    return (
      <>
        {!selected ? (
          isPublicEmbed ? (
            <div className="pi-embed-empty-analysis">
              {(() => {
                const emptyCopy = getPublicEmbedEmptyAnalysisCopy(lang);

                return (
                  <>
                    <div className="pi-embed-empty-eyebrow">{emptyCopy.eyebrow}</div>
                    <h3>{emptyCopy.title}</h3>
                    <p>{emptyCopy.body}</p>

                    <ul>
                      {emptyCopy.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>

                    <div className="pi-embed-empty-note">{emptyCopy.note}</div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="pi-muted">{t(lang, "odds.selectHint")}</div>
          )
        ) : (
          <div className="pi-detail">
            <div className="pi-detail-head">
              <div>
                <div className="pi-detail-title">
                  {selected.home_name} <span className="pi-vs">vs</span> {selected.away_name}
                </div>

                <div className="pi-detail-sub">
                  <span
                    className="pi-league"
                    title={leagueWithCountryLabel(leaguesBySportKey.get(selected.sport_key) ?? league, lang)}
                  >
                    {leagueWithCountryLabel(leaguesBySportKey.get(selected.sport_key) ?? league, lang)}
                  </span>

                  <span className="pi-subsep">•</span>

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
                    const hasOpportunityFlag = eventHasOpportunity(selected);
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

                {/* ===== Contexto narrativo do snapshot ===== */}
                {matchNarrativeContext ? (
                  <section className="pi-match-context" aria-label={getMatchContextTitle(lang)}>
                    <div className="pi-match-context-topline">
                      <div className="pi-match-context-label">{getMatchContextTitle(lang)}</div>

                      <div className="pi-match-context-chips">
                        {matchNarrativeContext.chips.map((chip) => (
                          <span className="pi-match-context-chip" key={`${chip.label}:${chip.value}`}>
                            <b>{chip.label}</b> {chip.value}
                          </span>
                        ))}
                      </div>
                    </div>

                    {renderDecisionAnalysisChip(selected, lang)}

                    {matchNarrativeContext.headline ? (
                      <div className="pi-match-context-headline">
                        {matchNarrativeContext.headline}
                      </div>
                    ) : null}

                    <div className="pi-match-context-grid">
                      {matchNarrativeContext.cards.map((card) => (
                    <div
                      className={[
                        "pi-match-context-card",
                        `pi-match-context-card--${card.tone ?? "neutral"}`,
                        card.key === "conclusion" ? "pi-match-context-card--conclusion" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={card.key}
                    >
                          <div className="pi-match-context-card-label">{card.label}</div>
                          <div className="pi-match-context-card-value">{card.value}</div>
                        </div>
                      ))}
                    </div>

                    {matchNarrativeContext.paragraphs.length ? (
                      <div className="pi-match-context-paragraphs">
                        {matchNarrativeContext.paragraphs.map((paragraph, index) => (
                          <p key={`${index}:${paragraph}`}>{paragraph}</p>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {/* ===== Narrativa legada: fallback quando não houver narrative_context ===== */}
                {!matchNarrativeContext ? (() => {
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
                        bestOver: totalsBestOver,
                        bestUnder: totalsBestUnder,
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
                })() : null}

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
                          <div
                            className={`pi-panel pi-panel-confidence pi-panel-confidence--${
                              String(effectiveModelConfidenceLevel || "unknown").toLowerCase()
                            }`}
                          >
                            <div className="pi-panel-label">
                              {lang === "en"
                                ? "Model confidence"
                                : lang === "es"
                                ? "Confianza del modelo"
                                : "Confiança do modelo"}
                            </div>

                            <div className="pi-panel-value">
                              {fmtPctNullable(effectiveModelConfidenceOverall)}
                            </div>

                            <div className="pi-muted">
                              {lang === "en" ? "Level" : lang === "es" ? "Nivel" : "Nível"}:{" "}
                              <b>{getModelConfidenceLabel(lang, effectiveModelConfidenceLevel)}</b>
                            </div>

                            {modelConfidenceNotes.length ? (
                              <div className="pi-model-confidence-notes">
                                {modelConfidenceNotes.map((note) => (
                                  <div key={note}>{note}</div>
                                ))}
                              </div>
                            ) : null}
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
                                  bestOver: totalsBestOver,
                                  bestUnder: totalsBestUnder,
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
                            const goalsPrice = goalsNarrative?.blocks.find(
                              (b) => b.type === "price" || b.type === "pricePro"
                            )?.text;

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

                                {goalsPrice ? (
                                  <div className="pi-muted" style={{ marginTop: 6 }}>
                                    {goalsPrice}
                                  </div>
                                ) : null}
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
                            const summary = effectiveEdgeSummary;

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
          onChange={handleCountryCodesChange}
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
          onChange={handleLeagueSportKeysChange}
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
      </div>
    </div>

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
                      handleCountryCodesChange(selectedCountryCodes.filter((x) => x !== value))
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
                      handleLeagueSportKeysChange(selectedLeagueSportKeys.filter((x) => x !== value))
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

          {/*
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

            {onlyRevealed ? (
              <button
                type="button"
                className="pi-filter-chip pi-filter-chip-action"
                onClick={() => setOnlyRevealed(false)}
              >
                <span>{t(lang, "odds.onlyRevealed")}</span>
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
              */}

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

    <div className="pi-topline">
      <div className="pi-title-actions">
        <div className="pi-title">{t(lang, "odds.pageTitle")}</div>

        <div className="pi-quick-toggles">
          {renderOnlyOpportunitiesToggle("pi-quick-toggle")}
          {renderOnlyRevealedToggle("pi-quick-toggle")}
        </div>
      </div>

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
          onChange={handleCountryCodesChange}
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
          onChange={handleLeagueSportKeysChange}
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
        {renderOnlyRevealedToggle()}
      </div>
    </ProductFiltersSheet>

    <div className="pi-grid">
      {/* LEFT: LISTA */}
      <section className="pi-card pi-card-list">
        {eventsError ? <div className="pi-error">{eventsError}</div> : null}

        <div className="pi-list" aria-label={t(lang, "odds.listAria")}>
          {!loadingEvents && !eventsError && visibleEvents.length === 0 ? (
            <div className="pi-empty-list">{t(lang, "product.empty_list")}</div>
          ) : null}

          {visibleEvents.map((e) => {
            const eventKey = String(e.event_id);
            const active = eventKey === String(selectedId);
            const hasOpportunityFlag = eventHasOpportunity(e);
            const isProbableOnly = e.match_status === "PROBABLE";
            const isRevealed = store.isRevealed(eventKey);
            const eventModelConfidenceOverall = getEventModelConfidenceOverall(e);

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
                  <div className="pi-row-head">
                    <div className="pi-row-title">
                      <span className="pi-team">{e.home_name}</span>
                      <span className="pi-vs">vs</span>
                      <span className="pi-team">{e.away_name}</span>
                    </div>

                    {hasOpportunityFlag || isProbableOnly || isRevealed ? (
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

                        {isRevealed ? (
                          <span className="pi-seen-badge">
                            {t(lang, "odds.alreadySeen")}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                  </div>

                  <div className="pi-row-sub">
                    <div className="pi-row-meta-inline">
                      <span
                        className="pi-league"
                        title={leagueWithCountryLabel(leaguesBySportKey.get(e.sport_key) ?? league, lang)}
                      >
                        {leagueWithCountryLabel(leaguesBySportKey.get(e.sport_key) ?? league, lang)}
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

                      {eventModelConfidenceOverall !== null ? (
                        <>
                          <span className="pi-subsep">•</span>
                          <span
                            className="pi-odds-mini"
                            title={getModelConfidenceMiniTitle(lang)}
                          >
                            Conf. {fmtPctNullable(eventModelConfidenceOverall)}
                          </span>
                        </>
                      ) : null}
                    </div>
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

    {isOperationalLoading ? (
      <div
        className={`pi-analysis-loading-overlay ${
          isPublicEmbed ? "pi-analysis-loading-overlay--embed" : ""
        }`}
        aria-live="polite"
        aria-busy="true"
      >
        <div className="pi-analysis-loading-card">
          <div className="pi-analysis-loading-spinner" aria-hidden="true" />
          <div className="pi-analysis-loading-title">
            {lang === "en"
              ? "Preparing your experience"
              : lang === "es"
              ? "Preparando tu experiencia"
              : "Preparando sua experiência"}
          </div>
          <div className="pi-analysis-loading-sub">
            {lang === "en"
              ? "We are loading matches and updating the latest information."
              : lang === "es"
              ? "Estamos cargando los partidos y actualizando la información más reciente."
              : "Estamos carregando os jogos e atualizando as informações mais recentes."}
          </div>
        </div>
      </div>
    ) : null}

    {isAnalysisLoading ? (
      <div
        className={`pi-analysis-loading-overlay ${
          isPublicEmbed ? "pi-analysis-loading-overlay--embed" : ""
        }`}
        aria-live="polite"
        aria-busy="true"
      >
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