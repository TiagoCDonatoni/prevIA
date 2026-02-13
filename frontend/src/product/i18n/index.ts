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
    const [nav, plans, credits, matchup, odds, auth, errors, common, product] = await Promise.all([
      import(`./locales/${lang}/nav.json`),
      import(`./locales/${lang}/plans.json`),
      import(`./locales/${lang}/credits.json`),
      import(`./locales/${lang}/matchup.json`),
      import(`./locales/${lang}/odds.json`),
      import(`./locales/${lang}/auth.json`),
      import(`./locales/${lang}/errors.json`),
      import(`./locales/${lang}/common.json`),
      import(`./locales/${lang}/product.json`),
    ]);

    const dict: Dict = {
      nav: nav.default ?? nav,
      plans: plans.default ?? plans,
      credits: credits.default ?? credits,
      matchup: matchup.default ?? matchup,
      odds: odds.default ?? odds,
      auth: auth.default ?? auth,
      errors: errors.default ?? errors,
      common: common.default ?? common,
      product: product.default ?? product,
    };

    CACHE[lang] = dict;
    return dict;
  } catch (err) {
    console.error("[product/i18n] loadLang failed:", { lang, err });
    CACHE[lang] = {}; // evita loop
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
