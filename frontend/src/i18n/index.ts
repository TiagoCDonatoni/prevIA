export type Lang = "pt" | "en" | "es";

// JSON dictionaries (Vite supports JSON imports)
import pt_common from "./locales/pt/common.json";
import pt_nav from "./locales/pt/nav.json";
import pt_plans from "./locales/pt/plans.json";
import pt_credits from "./locales/pt/credits.json";
import pt_matchup from "./locales/pt/matchup.json";
import pt_odds from "./locales/pt/odds.json";
import pt_errors from "./locales/pt/errors.json";
import pt_auth from "./locales/pt/auth.json";

import en_common from "./locales/en/common.json";
import en_nav from "./locales/en/nav.json";
import en_plans from "./locales/en/plans.json";
import en_credits from "./locales/en/credits.json";
import en_matchup from "./locales/en/matchup.json";
import en_odds from "./locales/en/odds.json";
import en_errors from "./locales/en/errors.json";
import en_auth from "./locales/en/auth.json";

import es_common from "./locales/es/common.json";
import es_nav from "./locales/es/nav.json";
import es_plans from "./locales/es/plans.json";
import es_credits from "./locales/es/credits.json";
import es_matchup from "./locales/es/matchup.json";
import es_odds from "./locales/es/odds.json";
import es_errors from "./locales/es/errors.json";
import es_auth from "./locales/es/auth.json";

type Dict = Record<string, any>;

const DICTS: Record<Lang, Dict> = {
  pt: {
    common: pt_common,
    nav: pt_nav,
    plans: pt_plans,
    credits: pt_credits,
    matchup: pt_matchup,
    odds: pt_odds,
    errors: pt_errors,
    auth: pt_auth,
  },
  en: {
    common: en_common,
    nav: en_nav,
    plans: en_plans,
    credits: en_credits,
    matchup: en_matchup,
    odds: en_odds,
    errors: en_errors,
    auth: en_auth,
  },
  es: {
    common: es_common,
    nav: es_nav,
    plans: es_plans,
    credits: es_credits,
    matchup: es_matchup,
    odds: es_odds,
    errors: es_errors,
    auth: es_auth,
  },
};

function getPath(obj: any, path: string): any {
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function interpolate(str: string, vars?: Record<string, any>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/**
 * Translation helper.
 *
 * - key format: "namespace.key"
 * - fallback: current lang -> "pt" -> key
 */
export function t(lang: Lang, key: string, vars?: Record<string, any>): string {
  const [ns, ...rest] = key.split(".");
  const leaf = rest.join(".");

  const cur = getPath(DICTS[lang]?.[ns], leaf);
  if (typeof cur === "string") return interpolate(cur, vars);

  const fb = getPath(DICTS.pt?.[ns], leaf);
  if (typeof fb === "string") return interpolate(fb, vars);

  return key;
}

export const LANGS: Array<{ lang: Lang; label: string }> = [
  { lang: "pt", label: "PT" },
  { lang: "en", label: "EN" },
  { lang: "es", label: "ES" },
];
