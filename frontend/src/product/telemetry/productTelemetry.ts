import { API_BASE_URL, IS_DEV } from "../../config";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export type ProductTelemetryEventName =
  | "landing_viewed"
  | "landing_primary_cta_clicked"
  | "public_free_anon_embed_viewed"
  | "public_free_anon_embed_loaded"
  | "product_index_viewed"
  | "anon_match_selected"
  | "anon_reveal_started"
  | "anon_reveal_succeeded"
  | "anon_reveal_blocked_no_credits"
  | "anon_analysis_opened"
  | "auth_modal_opened"
  | "auth_mode_selected"
  | "auth_submit_started"
  | "auth_submit_succeeded"
  | "auth_submit_failed"
  | "auth_forgot_password_clicked"
  | "anon_promoted_to_user"
  | "post_signup_plan_offer_shown"
  | "post_signup_plan_selected"
  | "post_signup_continue_free_clicked"
  | "post_signup_checkout_started"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_failed"
  | (string & {});

export type ProductTelemetryPayload = Record<string, unknown> & {
  surface?: "landing" | "auth" | "app" | "account" | "admin" | "public_embed" | "unknown" | string;
  actor_type?: "anonymous" | "user" | "admin" | "system" | string;
  plan_code?: string;
  auth_mode?: string;
  route?: string;
  lang?: string;
  source?: string;
};

const ANONYMOUS_ID_STORAGE_KEY = "previa_telemetry_anonymous_id_v1";
const SESSION_ID_STORAGE_KEY = "previa_telemetry_session_id_v1";
const UTM_STORAGE_KEY = "previa_telemetry_utm_v1";

function makeClientId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

  return `${prefix}_${random}`;
}

function getOrCreateStorageValue(storage: Storage, key: string, prefix: string) {
  try {
    const existing = storage.getItem(key);
    if (existing && existing.trim()) return existing;

    const next = makeClientId(prefix);
    storage.setItem(key, next);
    return next;
  } catch {
    return makeClientId(prefix);
  }
}

export function getTelemetryAnonymousId() {
  if (typeof window === "undefined") return null;
  return getOrCreateStorageValue(window.localStorage, ANONYMOUS_ID_STORAGE_KEY, "anon");
}

export function getTelemetrySessionId() {
  if (typeof window === "undefined") return null;
  return getOrCreateStorageValue(window.sessionStorage, SESSION_ID_STORAGE_KEY, "sess");
}

function sanitizeUtmValue(raw: string | null) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return value.slice(0, 180);
}

function readAndPersistUtm(): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const params = new URLSearchParams(window.location.search);
    const current: Record<string, string> = {};

    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"]) {
      const value = sanitizeUtmValue(params.get(key));
      if (value) current[key] = value;
    }

    if (Object.keys(current).length > 0) {
      window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(current));
      return current;
    }

    const stored = window.sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function inferActorType(eventName: string, payload: ProductTelemetryPayload) {
  if (payload.actor_type) return String(payload.actor_type);

  const planCode = String(payload.plan_code ?? "").toUpperCase();
  if (
    planCode === "FREE_ANON" ||
    eventName.startsWith("anon_") ||
    eventName.startsWith("public_free_anon")
  ) {
    return "anonymous";
  }

  return "user";
}

function inferSurface(payload: ProductTelemetryPayload) {
  if (payload.surface) return String(payload.surface);
  if (typeof window === "undefined") return "unknown";

  const path = window.location.pathname;
  if (path.includes("/admin")) return "admin";
  if (path.includes("/app/account")) return "account";
  if (path.includes("/app")) return "app";
  return "landing";
}

function inferLang(payload: ProductTelemetryPayload) {
  if (payload.lang) return String(payload.lang);
  if (typeof document !== "undefined") {
    const htmlLang = document.documentElement.lang;
    if (htmlLang) return htmlLang;
  }
  return "pt";
}

function inferRoute(payload: ProductTelemetryPayload) {
  if (payload.route) return String(payload.route);
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`.slice(0, 240);
}

function sendTelemetryToBackend(detail: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  const body = JSON.stringify(detail);

  void fetch(`${API_BASE_URL}/telemetry/events`, {
    method: "POST",
    credentials: "include",
    keepalive: body.length < 16_000,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body,
  }).catch((error) => {
    if (IS_DEV) {
      console.warn("[product-telemetry] backend persist failed", error);
    }
  });
}

export function trackProductTelemetry(
  eventName: ProductTelemetryEventName,
  payload: ProductTelemetryPayload = {}
) {
  const normalizedEventName = String(eventName || "").trim().toLowerCase();
  if (!normalizedEventName) return;

  const occurredAtIso = new Date().toISOString();
  const anonymousId = getTelemetryAnonymousId();
  const sessionId = getTelemetrySessionId();
  const utm = readAndPersistUtm();

  const detail = {
    client_event_id: makeClientId("evt"),
    event_name: normalizedEventName,
    surface: inferSurface(payload),
    actor_type: inferActorType(normalizedEventName, payload),
    anonymous_id: anonymousId,
    session_id: sessionId,
    plan_code: payload.plan_code ? String(payload.plan_code) : undefined,
    auth_mode: payload.auth_mode ? String(payload.auth_mode) : undefined,
    route: inferRoute(payload),
    lang: inferLang(payload),
    source: payload.source ? String(payload.source) : undefined,
    utm,
    payload,
    occurred_at_iso: occurredAtIso,
    emitted_at_iso: occurredAtIso,
  };

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("previa:product-telemetry", {
        detail,
      })
    );

    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push(detail);
    }
  }

  sendTelemetryToBackend(detail);

  if (IS_DEV) {
    console.info("[product-telemetry]", detail);
  }
}