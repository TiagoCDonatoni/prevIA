// frontend/src/product/i18n/index.ts

export type Lang = "pt" | "en" | "es";
type Dict = Record<string, any>;

const CACHE: Partial<Record<Lang, Dict>> = {};
const STORAGE_KEY = "previa_lang_v1";

export const LANGS: { lang: Lang; label: string }[] = [
  { lang: "pt", label: "PT" },
  { lang: "en", label: "EN" },
  { lang: "es", label: "ES" },
];

async function loadLang(lang: Lang): Promise<Dict> {
  if (CACHE[lang]) return CACHE[lang] as Dict;

  try {
    const loaders = {
      pt: async () => {
        const [nav, plans, credits, matchup, odds, auth, errors, common, product, narrative] = await Promise.all([
          import("./locales/pt/nav.json"),
          import("./locales/pt/plans.json"),
          import("./locales/pt/credits.json"),
          import("./locales/pt/matchup.json"),
          import("./locales/pt/odds.json"),
          import("./locales/pt/auth.json"),
          import("./locales/pt/errors.json"),
          import("./locales/pt/common.json"),
          import("./locales/pt/product.json"),
          import("./locales/pt/narrative.json"),

        ]);
        return { nav, plans, credits, matchup, odds, auth, errors, common, product, narrative };
      },
      en: async () => {
        const [nav, plans, credits, matchup, odds, auth, errors, common, product, narrative ] = await Promise.all([
          import("./locales/en/nav.json"),
          import("./locales/en/plans.json"),
          import("./locales/en/credits.json"),
          import("./locales/en/matchup.json"),
          import("./locales/en/odds.json"),
          import("./locales/en/auth.json"),
          import("./locales/en/errors.json"),
          import("./locales/en/common.json"),
          import("./locales/en/product.json"),
          import("./locales/en/narrative.json"),
        ]);
        return { nav, plans, credits, matchup, odds, auth, errors, common, product, narrative  };
      },
      es: async () => {
        const [nav, plans, credits, matchup, odds, auth, errors, common, product, narrative ] = await Promise.all([
          import("./locales/es/nav.json"),
          import("./locales/es/plans.json"),
          import("./locales/es/credits.json"),
          import("./locales/es/matchup.json"),
          import("./locales/es/odds.json"),
          import("./locales/es/auth.json"),
          import("./locales/es/errors.json"),
          import("./locales/es/common.json"),
          import("./locales/es/product.json"),
          import("./locales/es/narrative.json"),
        ]);
        return { nav, plans, credits, matchup, odds, auth, errors, common, product, narrative  };
      },
    } satisfies Record<Lang, () => Promise<any>>;

    const mod = await loaders[lang]();

    const dict: Dict = {
      nav: mod.nav.default ?? mod.nav,
      plans: mod.plans.default ?? mod.plans,
      credits: mod.credits.default ?? mod.credits,
      matchup: mod.matchup.default ?? mod.matchup,
      odds: mod.odds.default ?? mod.odds,
      auth: mod.auth.default ?? mod.auth,
      errors: mod.errors.default ?? mod.errors,
      common: mod.common.default ?? mod.common,
      product: mod.product.default ?? mod.product,
      narrative: mod.narrative.default ?? mod.narrative,

    };

    CACHE[lang] = dict;
    return dict;
  } catch (err) {
    console.error("[product/i18n] loadLang failed:", { lang, err });
    CACHE[lang] = {};
    return {};
  }
}

function interpolate(template: string, vars?: Record<string, any>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] === undefined || vars[k] === null ? `{${k}}` : String(vars[k])
  );
}

function getDeep(obj: any, path: string[]) {
  let cur = obj;
  for (const p of path) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function getStoredLang(): Lang {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "pt" || v === "en" || v === "es") return v;
  return "pt";
}

export function detectBrowserLang(): Lang {
  const raw = (navigator.languages?.[0] ?? navigator.language ?? "en").toLowerCase();

  if (raw.startsWith("pt")) return "pt";
  if (raw.startsWith("es")) return "es";
  return "en";
}

export function setStoredLang(next: Lang) {
  localStorage.setItem(STORAGE_KEY, next);
}

export async function warmI18n(lang: Lang) {
  await loadLang(lang);
}

export function t(lang: Lang, key: string, vars?: Record<string, any>) {
  const dict = CACHE[lang];
  if (!dict) return key; // ainda não carregou

  const parts = key.split(".");
  const ns = parts[0];
  const path = parts.slice(1);

  const raw = getDeep(dict?.[ns], path);
  if (raw == null) return key;

  if (typeof raw === "string") return interpolate(raw, vars);
  return String(raw);
}
