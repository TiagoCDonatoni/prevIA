import type { Lang } from "../i18n";

const COOKIE_NAME = "previa_partner_referral_v1";
const TTL_DAYS = 7;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;
const TTL_MS = TTL_SECONDS * 1000;

export type PartnerReferralCookie = {
  version: 1;
  campaignSlug: string;
  lang: Lang;
  capturedAtMs: number;
  expiresAtMs: number;
  source: "public_beta_campaign_page";
};

function normalizeSlug(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeLang(raw: string): Lang {
  if (raw === "en" || raw === "es") return raw;
  return "pt";
}

function secureCookieSuffix(): string {
  if (typeof window === "undefined") return "";
  return window.location.protocol === "https:" ? "; Secure" : "";
}

function readRawCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const prefix = `${name}=`;
  const item = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!item) return null;

  return item.slice(prefix.length);
}

export function clearPartnerReferralCookie(): void {
  if (typeof document === "undefined") return;

  document.cookie = `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax${secureCookieSuffix()}`;
}

export function writePartnerReferralCookie(args: {
  campaignSlug: string;
  lang: Lang;
}): boolean {
  if (typeof document === "undefined") return false;

  const campaignSlug = normalizeSlug(args.campaignSlug);
  if (!campaignSlug) return false;

  const now = Date.now();

  const payload: PartnerReferralCookie = {
    version: 1,
    campaignSlug,
    lang: normalizeLang(args.lang),
    capturedAtMs: now,
    expiresAtMs: now + TTL_MS,
    source: "public_beta_campaign_page",
  };

  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    JSON.stringify(payload)
  )}; Max-Age=${TTL_SECONDS}; Path=/; SameSite=Lax${secureCookieSuffix()}`;

  return true;
}

export function readPartnerReferralCookie(): PartnerReferralCookie | null {
  const raw = readRawCookie(COOKIE_NAME);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<PartnerReferralCookie>;

    const campaignSlug = normalizeSlug(String(parsed.campaignSlug || ""));
    if (!campaignSlug) {
      clearPartnerReferralCookie();
      return null;
    }

    const expiresAtMs = Number(parsed.expiresAtMs || 0);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      clearPartnerReferralCookie();
      return null;
    }

    return {
      version: 1,
      campaignSlug,
      lang: normalizeLang(String(parsed.lang || "pt")),
      capturedAtMs: Number(parsed.capturedAtMs || 0),
      expiresAtMs,
      source: "public_beta_campaign_page",
    };
  } catch {
    clearPartnerReferralCookie();
    return null;
  }
}

export function getPartnerReferralRedeemPath(fallbackLang: Lang): string | null {
  const referral = readPartnerReferralCookie();
  if (!referral) return null;

  const lang = referral.lang || fallbackLang;
  return `/${lang}/beta/${referral.campaignSlug}?redeem=1`;
}