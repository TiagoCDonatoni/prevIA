import type { Lang } from "../../i18n";

const LOCALES: Record<Lang, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };

export function formatMoney(cents: number, currency: string, lang: Lang): string {
  return new Intl.NumberFormat(LOCALES[lang], {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function parseMoneyToCents(raw: string): number | null {
  let value = raw.trim().replace(/\s/g, "");
  if (!value) return null;

  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  const decimalIndex = Math.max(comma, dot);

  if (decimalIndex >= 0) {
    const integer = value.slice(0, decimalIndex).replace(/[.,]/g, "");
    const fraction = value.slice(decimalIndex + 1);
    value = `${integer}.${fraction}`;
  }

  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return null;
  const [integer, fraction = ""] = value.split(".");
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function parseDecimalOdds(raw: string): string | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) return null;
  const odds = Number(normalized);
  if (!Number.isFinite(odds) || odds <= 1 || odds > 10000) return null;
  return normalized;
}

export function formatPercent(ratio: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALES[lang], {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(ratio);
}

export function toLocalDateTimeValue(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
