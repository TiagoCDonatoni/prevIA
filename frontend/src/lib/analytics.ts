const GA_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID ?? "").trim();

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

const PUBLIC_ROUTE_REGEX = /^\/(pt|en|es)(\/|$)/;

export function isTrackablePublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTE_REGEX.test(pathname);
}

export function trackPublicPageView(pathname: string, search = ""): void {
  if (!GA_ID) return;
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  if (!isTrackablePublicRoute(pathname)) return;

  const pagePath = `${pathname}${search ?? ""}`;

  window.gtag("event", "page_view", {
    page_path: pagePath,
    page_location: window.location.href,
    page_title: document.title,
    language: document.documentElement.lang || undefined,
  });
}

type PublicAnalyticsValue = string | number | boolean | undefined | null;

export function trackPublicEvent(
  eventName: string,
  params: Record<string, PublicAnalyticsValue> = {}
): void {
  if (!GA_ID) return;
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;

  window.gtag("event", eventName, {
    ...params,
    page_path: `${window.location.pathname}${window.location.search}`,
    page_title: document.title,
    language: document.documentElement.lang || undefined,
  });
}