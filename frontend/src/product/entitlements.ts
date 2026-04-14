import {
  DEFAULT_ACCOUNT_PREFERENCES,
  resolveAccountPreferences,
  type ProductAccountPreferences,
} from "./preferences/accountPreferences";

import type { Lang } from "./i18n";
import {
  PRODUCT_DEV_AUTO_LOGIN_EMAIL,
  PRODUCT_DEV_AUTO_LOGIN_ENABLED,
  PRODUCT_DEV_AUTO_LOGIN_PLAN,
} from "../config";

export type PlanId = "FREE_ANON" | "FREE" | "BASIC" | "LIGHT" | "PRO";

export function normalizePlanId(raw: string | null | undefined): PlanId {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "FREE_ANON" || v === "FREE" || v === "BASIC" || v === "LIGHT" || v === "PRO") {
    return v;
  }
  return "FREE_ANON";
}

export type Entitlements = {
  plan: PlanId;
  lang: Lang;
  credits: {
    daily_limit: number;
    used_today: number;
    remaining_today: number;
    resets_at_iso: string; // UTC boundary, computed client-side for now
  };
  visibility: {
    odds: {
      books_count: number;
      sort_mode: "partner_first" | "best_odds" | "none";
      show_partner_label: boolean;
      show_affiliate_link: boolean;
    };
    value: {
      show_value_detected: boolean;
      show_value_explained: boolean;
      show_fair_odds: boolean;
      show_edge_percent: boolean;
    };
    context: {
      show_confidence_level: boolean;
      show_similar_sample_size: boolean;
      show_form_summary: boolean;
      show_head_to_head: boolean;
    };
    model: {
      show_metrics: boolean;
    };
  };
  features: {
    chat: boolean;
  };
};


export const PLAN_ORDER: PlanId[] = ["FREE_ANON", "FREE", "BASIC", "LIGHT", "PRO"];

export function getNextPlan(plan: PlanId): PlanId | null {
  const idx = PLAN_ORDER.indexOf(plan);
  if (idx === -1 || idx === PLAN_ORDER.length - 1) return null;
  return PLAN_ORDER[idx + 1];
}

export function getHigherPlans(plan: PlanId): PlanId[] {
  const idx = PLAN_ORDER.indexOf(plan);
  if (idx === -1) return PLAN_ORDER.slice(1);
  return PLAN_ORDER.slice(idx + 1);
}

export const PLAN_LABELS: Array<{ id: PlanId; label: string }> = [
  { id: "FREE_ANON", label: "Free (anon)" },
  { id: "FREE", label: "Free+" },
  { id: "BASIC", label: "Basic" },
  { id: "LIGHT", label: "Light" },
  { id: "PRO", label: "Pro" },
];

export function dailyLimitForPlan(plan: PlanId): number {
  switch (plan) {
    case "FREE_ANON":
      return 3;
    case "FREE":
      return 5;
    case "BASIC":
      return 10;
    case "LIGHT":
      return 50;
    case "PRO":
      return 200;
  }
}

export function visibilityForPlan(plan: PlanId): Entitlements["visibility"] {
  const base: Entitlements["visibility"] = {
    odds: {
      books_count: 1,
      sort_mode: "partner_first",
      show_partner_label: true,
      show_affiliate_link: true,
    },
    value: {
      show_value_detected: true,
      show_value_explained: false,
      show_fair_odds: false,
      show_edge_percent: false,
    },
    context: {
      show_confidence_level: false,
      show_similar_sample_size: false,
      show_form_summary: false,
      show_head_to_head: false,
    },
    model: {
      show_metrics: false,
    },
  };

  if (plan === "BASIC") {
    base.odds.books_count = 2;
  }

  if (plan === "LIGHT" || plan === "PRO") {
    base.odds.books_count = 3;
    base.value.show_value_explained = true;
    base.value.show_fair_odds = true;
    base.value.show_edge_percent = true;
    base.context.show_confidence_level = true;
    base.context.show_similar_sample_size = true;
    base.context.show_form_summary = true;
  }

  if (plan === "PRO") {
    base.context.show_head_to_head = true;
    base.model.show_metrics = true;
  }

  return base;
}

export function featuresForPlan(plan: PlanId): Entitlements["features"] {
  return {
    chat: plan === "PRO",
  };
}

const LS_KEY = "previa_product_state_v1";

type PersistedState = {
  plan: PlanId;
  lang: Lang;
  auth: { is_logged_in: boolean; email?: string | null };
  credits: { date_key: string; used_today: number; revealed_today: Record<string, true> };
  preferences: ProductAccountPreferences;
};

function dateKeyUtc(now = new Date()): string {
  // UTC-0 product boundary.
  // Backend is the source of truth for authenticated users; this keeps local/free flows aligned.
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function nextResetIso(now = new Date()): string {
  // next midnight in UTC
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0
    )
  );
  return next.toISOString();
}

export function normalizeLang(raw: string | null | undefined): Lang {
  const v = String(raw ?? "").toLowerCase();

  // aceita formas completas do navegador tipo "pt-BR", "en-US", "es-419"
  if (v.startsWith("pt")) return "pt";
  if (v.startsWith("es")) return "es";
  if (v.startsWith("en")) return "en";

  // fallback mundial
  return "en";
}

function detectBrowserLang(): Lang {
  const raw = navigator.languages?.[0] ?? navigator.language ?? "en";
  return normalizeLang(raw);
}

export function loadProductState(): PersistedState {
  const raw = localStorage.getItem(LS_KEY);
  const today = dateKeyUtc();

  const fallback: PersistedState = {
    plan: "FREE_ANON",
    lang: detectBrowserLang(),
    auth: { is_logged_in: false, email: null },
    credits: { date_key: today, used_today: 0, revealed_today: {} },
    preferences: DEFAULT_ACCOUNT_PREFERENCES,
  };

  let state: PersistedState = fallback;

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PersistedState;

      if (!parsed.auth) parsed.auth = { is_logged_in: false, email: null };

      parsed.lang = normalizeLang(parsed.lang);
      parsed.plan = normalizePlanId(parsed.plan);
      parsed.preferences = resolveAccountPreferences(parsed.preferences);
      
      if (!parsed?.credits?.date_key || parsed.credits.date_key !== today) {
        parsed.credits = { date_key: today, used_today: 0, revealed_today: {} };
      }

      state = parsed;
    } catch {
      state = fallback;
    }
  }

  // DEV helper: injeta sessão local para acelerar a fase de desenvolvimento.
  // Não é source of truth final; é só scaffolding até auth backend entrar.
  if (PRODUCT_DEV_AUTO_LOGIN_ENABLED) {
    state = {
      ...state,
      plan: normalizePlanId(PRODUCT_DEV_AUTO_LOGIN_PLAN),
      auth: {
        is_logged_in: true,
        email: PRODUCT_DEV_AUTO_LOGIN_EMAIL || "dev@previa.local",
      },
      preferences: resolveAccountPreferences(state.preferences),
    };

    // se alguém habilitar dev auto-login mas deixar FREE_ANON, sobe para FREE
    if (state.plan === "FREE_ANON") {
      state.plan = "FREE";
    }
  }

  return state;
}

export function saveProductState(state: PersistedState) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

export function buildEntitlements(state: PersistedState): Entitlements {
  const limit = dailyLimitForPlan(state.plan);
  const used = Math.min(state.credits.used_today || 0, limit);

  return {
    plan: state.plan,
    lang: state.lang,
    credits: {
      daily_limit: limit,
      used_today: used,
      remaining_today: Math.max(0, limit - used),
      resets_at_iso: nextResetIso(),
    },
    visibility: visibilityForPlan(state.plan),
    features: featuresForPlan(state.plan),
  };
}

export function canRevealFixture(state: PersistedState, fixtureKey: string): boolean {
  const ent = buildEntitlements(state);
  if (state.credits.revealed_today?.[fixtureKey]) return true;
  return ent.credits.remaining_today >= 1;
}

export function consumeCreditForReveal(state: PersistedState, fixtureKey: string): PersistedState {
  if (state.credits.revealed_today?.[fixtureKey]) return state;

  const limit = dailyLimitForPlan(state.plan);
  const used = Math.min(state.credits.used_today || 0, limit);
  if (used >= limit) return state;

  return {
    ...state,
    credits: {
      ...state.credits,
      used_today: used + 1,
      revealed_today: { ...(state.credits.revealed_today || {}), [fixtureKey]: true },
    },
  };
}