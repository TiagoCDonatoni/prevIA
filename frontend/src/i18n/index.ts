// frontend/src/i18n/index.ts
export type Lang = "pt" | "en" | "es";

type Dict = Record<string, any>;

const CACHE: Partial<Record<Lang, Dict>> = {};
const STORAGE_KEY = "previa_lang_v1";

// IMPORTANT: agora o source-of-truth do produto está em src/product/i18n/locales
async function loadLang(lang: Lang): Promise<Dict> {
  if (CACHE[lang]) return CACHE[lang] as Dict;

  try {
    const [nav, plans, credits, matchup, odds, auth, errors, common, product] =
      await Promise.all([
        import(`../product/i18n/locales/${lang}/nav.json`),
        import(`../product/i18n/locales/${lang}/plans.json`),
        import(`../product/i18n/locales/${lang}/credits.json`),
        import(`../product/i18n/locales/${lang}/matchup.json`),
        import(`../product/i18n/locales/${lang}/odds.json`),
        import(`../product/i18n/locales/${lang}/auth.json`),
        import(`../product/i18n/locales/${lang}/errors.json`),
        import(`../product/i18n/locales/${lang}/common.json`),
        import(`../product/i18n/locales/${lang}/product.json`),
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
    // Ajuda MUITO quando algum json/path falha
    console.error("[i18n] loadLang failed:", { lang, err });
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

export function getStoredLang(): Lang {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "pt" || v === "en" || v === "es") return v;
  return "pt";
}

export function setStoredLang(next: Lang) {
  localStorage.setItem(STORAGE_KEY, next);
}

// Util: suporta apenas "ns.key" (1 nível), que é seu padrão atual
export function t(lang: Lang, key: string, vars?: Record<string, any>) {
  const [ns, k] = key.split(".");
  const dict = CACHE[lang];

  const raw = dict?.[ns]?.[k];
  if (raw == null) return key;

  if (typeof raw === "string") return interpolate(raw, vars);
  return String(raw);
}

// Opcional: garantir preload (você pode chamar no bootstrap/layout)
export async function warmI18n(lang: Lang) {
  await loadLang(lang);
}

export const LANGS: { lang: Lang; label: string }[] = [
  { lang: "pt", label: "PT" },
  { lang: "en", label: "EN" },
  { lang: "es", label: "ES" },
];
