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