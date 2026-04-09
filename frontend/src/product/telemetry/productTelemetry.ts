declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export type ProductTelemetryEventName =
  | "post_signup_plan_offer_shown"
  | "post_signup_plan_selected"
  | "post_signup_continue_free_clicked"
  | "post_signup_checkout_started";

export type ProductTelemetryPayload = Record<string, unknown>;

export function trackProductTelemetry(
  eventName: ProductTelemetryEventName,
  payload: ProductTelemetryPayload = {}
) {
  const detail = {
    event_name: eventName,
    payload,
    emitted_at_iso: new Date().toISOString(),
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

  if (import.meta.env.DEV) {
    console.info("[product-telemetry]", detail);
  }
}