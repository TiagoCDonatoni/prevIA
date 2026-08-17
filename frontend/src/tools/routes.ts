import type { Lang } from "../i18n";

export const BANKROLL_SLUGS: Record<Lang, string> = {
  pt: "controle-de-banca",
  en: "bankroll-manager",
  es: "gestor-de-banca",
};

export function bankrollPath(lang: Lang): string {
  return `/${lang}/tools/${BANKROLL_SLUGS[lang]}`;
}

export function localizedToolsPath(pathname: string, nextLang: Lang): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[1] !== "tools") return null;
  if (parts.length === 2) return `/${nextLang}/tools`;
  if (Object.values(BANKROLL_SLUGS).includes(parts[2])) return bankrollPath(nextLang);
  return null;
}
