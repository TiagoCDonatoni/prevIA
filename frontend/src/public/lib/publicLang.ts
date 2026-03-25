import type { Lang } from "../../i18n";

export const PUBLIC_LANGS: Lang[] = ["pt", "en", "es"];

export function isPublicLang(value: string | undefined): value is Lang {
  return value === "pt" || value === "en" || value === "es";
}

export function coercePublicLang(value: string | undefined): Lang {
  return isPublicLang(value) ? value : "pt";
}

export function replaceUrlLang(pathname: string, nextLang: Lang): string {
  const parts = pathname.split("/").filter(Boolean);

  if (!parts.length) return `/${nextLang}`;
  parts[0] = nextLang;

  return `/${parts.join("/")}`;
}