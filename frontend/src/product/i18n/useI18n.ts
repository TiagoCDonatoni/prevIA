import { useCallback, useEffect, useMemo, useState } from "react";

// Tipos básicos
export type Lang = "pt" | "en" | "es";

type Dict = Record<string, any>;

const STORAGE_KEY = "previa_lang_v1";

// Carrega JSONs do produto (ajuste paths se necessário)
async function loadLocale(lang: Lang): Promise<Dict> {
  const [nav, plans, credits, matchup, odds, auth, errors, common, product] =
    await Promise.all([
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

  return {
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
}

function getStoredLang(): Lang {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "pt" || v === "en" || v === "es") return v;
  return "pt";
}

function interpolate(template: string, vars?: Record<string, any>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] === undefined || vars[k] === null ? `{${k}}` : String(vars[k])
  );
}

export function useI18n() {
  const [lang, setLangState] = useState<Lang>(getStoredLang);
  const [dict, setDict] = useState<Dict | null>(null);

  useEffect(() => {
    let alive = true;
    loadLocale(lang)
      .then((d) => {
        if (!alive) return;
        setDict(d);
      })
      .catch(() => {
        // fallback simples
        if (!alive) return;
        setDict(null);
      });
    return () => {
      alive = false;
    };
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, any>) => {
      // key no formato "nav.language"
      const [ns, k] = key.split(".");
      const raw =
        dict?.[ns]?.[k] ??
        // fallback básico: retorna a chave se não achar
        key;

      if (typeof raw === "string") return interpolate(raw, vars);
      return String(raw);
    },
    [dict]
  );

  return useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
}
