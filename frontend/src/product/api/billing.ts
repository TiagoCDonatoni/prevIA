import { API_BASE_URL } from "../../config";
import type { PlanId } from "../entitlements";

export type BillingCycle = "monthly" | "quarterly" | "annual";

export type BillingCatalogItem = {
  price_code: string;
  plan_code: Exclude<PlanId, "FREE_ANON" | "FREE">;
  billing_cycle: BillingCycle;
  currency_code: "BRL" | "USD" | "EUR" | string;
  currency_symbol: string;
  unit_amount_cents: number;
  unit_amount: number;
  price_version: string;
  provider: string;
  provider_product_id: string | null;
  provider_price_id: string | null;
  active: boolean;
  sort_order: number;
  plan_config?: Record<string, any>;
};

export type BillingCatalogResponse = {
  ok: boolean;
  currency_code?: string;
  items: BillingCatalogItem[];
};

export type BillingCheckoutSessionResponse = {
  ok: boolean;
  ui_mode?: "custom" | "hosted" | string;
  checkout_url?: string | null;
  checkout_client_secret?: string | null;
  publishable_key?: string | null;
  session_id: string;
  price_code: string;
  plan_code: string;
  billing_cycle: BillingCycle;
  currency_code?: "BRL" | "USD" | string;
  provider_product_id?: string | null;
  provider_price_id?: string | null;
};

export type BillingSubscriptionData = {
  subscription_id: number;
  plan_code: string;
  plan_price_id: number | null;
  billing_cycle: BillingCycle | null;
  currency_code: "BRL" | "USD" | "EUR" | string | null;
  currency_symbol: string | null;
  billing_status: string | null;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  provider_price_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at_utc: string | null;
  trial_start_utc: string | null;
  trial_end_utc: string | null;
  updated_at_utc: string | null;
  unit_amount_cents: number | null;
  unit_amount: number | null;
  price_version: string | null;
};

export type BillingSubscriptionActions = {
  can_checkout: boolean;
  can_change_plan: boolean;
  can_cancel_renewal: boolean;
  can_resume_renewal: boolean;
};

export type BillingSubscriptionResponse = {
  ok: boolean;
  has_subscription: boolean;
  subscription: BillingSubscriptionData | null;
  actions: BillingSubscriptionActions;
  action?: "cancel_renewal" | "resume_renewal";
  message?: string;
};

export type BillingChangeDecision = {
  decision_code:
    | "noop"
    | "upgrade_now"
    | "downgrade_period_end"
    | "cycle_upgrade_now"
    | "cycle_downgrade_period_end"
    | string;
  effective_mode: "none" | "immediate" | "period_end" | string;
  reason_code?: string | null;
};

export type BillingChangePreviewCurrent = {
  subscription_id: number;
  plan_price_id: number | null;
  plan_code: string;
  billing_cycle: BillingCycle | null;
  currency_code: string | null;
  billing_status: string | null;
  cancel_at_period_end: boolean;
  provider: string | null;
  provider_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  updated_at_utc?: string | null;
  unit_amount_cents: number | null;
  price_version?: string | null;
};

export type BillingChangePreviewTarget = {
  plan_price_id: number | null;
  plan_code: string;
  billing_cycle: BillingCycle | null;
  currency_code: string | null;
  unit_amount_cents: number | null;
  price_version?: string | null;
};

export type BillingChangePreviewData = {
  calculation_mode: "classification_only" | "stripe_invoice_preview" | string;
  full_period_delta_cents: number | null;
  amount_due_now_cents: number | null;
  charge_cents?: number | null;
  credit_cents?: number | null;
  proration_date?: number | null;
  line_items?: Array<{
    amount_cents: number;
    currency_code: string;
    description: string;
  }>;
  currency_code?: string | null;
};

export type BillingChangePolicy = {
  can_apply_now: boolean;
  can_schedule: boolean;
  requires_stripe_proration_preview: boolean;
};

export type BillingChangePreviewResponse = {
  ok: boolean;
  billing_runtime?: "sandbox" | "live" | string;
  current: BillingChangePreviewCurrent;
  target: BillingChangePreviewTarget;
  decision: BillingChangeDecision;
  preview: BillingChangePreviewData;
  policy: BillingChangePolicy;
};

export type BillingChangeApplyResponse = BillingSubscriptionResponse & {
  applied: boolean;
  pending_update: boolean;
  decision?: BillingChangeDecision;
  billing_runtime?: "sandbox" | "live" | string;
  latest_invoice_id?: string | null;
  payment_intent_id?: string | null;
  payment_intent_status?: string | null;
  pending_update_expires_at?: string | null;
  sync_result?: Record<string, any> | null;
};

export type BillingChangePreviewPayload = {
  target_plan_code: Exclude<PlanId, "FREE_ANON" | "FREE">;
  target_billing_cycle: BillingCycle;
  currency_code: "BRL" | "USD";
};

export type BillingChangeApplyPayload = BillingChangePreviewPayload & {
  preview_proration_date?: number | null;
  preview_subscription_updated_at?: string | null;
};

export type BillingCheckoutSessionSyncResponse = BillingSubscriptionResponse & {
  synced: boolean;
  checkout_session_id: string;
  checkout_session_status?: string | null;
  checkout_payment_status?: string | null;
  sync_result?: Record<string, any> | null;
};

export class BillingRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "BillingRequestError";
    this.status = status;
    this.code = code;
  }
}

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function requestBilling<TResponse, TBody extends Record<string, any> | undefined = undefined>(
  path: string,
  body?: TBody
): Promise<TResponse> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: body ? "POST" : "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await readJsonSafe<any>(res);

  if (!res.ok) {
    const message = data?.message || `billing_request_failed:${res.status}`;
    const code = data?.code;
    throw new BillingRequestError(message, res.status, code);
  }

  return data as TResponse;
}

export async function fetchBillingCatalog(
  currencyCode: "BRL" | "USD" = "BRL"
): Promise<BillingCatalogResponse> {
  const res = await fetch(
    `${API_BASE_URL}/billing/catalog?currency_code=${encodeURIComponent(currencyCode)}`,
    {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const data = await readJsonSafe<BillingCatalogResponse>(res);

  if (!res.ok) {
    throw new BillingRequestError(`billing_catalog_failed:${res.status}`, res.status);
  }

  return data ?? { ok: true, items: [] };
}

export async function createBillingCheckoutSession(payload: {
  plan_code: Exclude<PlanId, "FREE_ANON" | "FREE">;
  billing_cycle: BillingCycle;
  currency_code: "BRL" | "USD";
}): Promise<BillingCheckoutSessionResponse> {
  return requestBilling<BillingCheckoutSessionResponse, typeof payload>(
    "/billing/checkout/session",
    payload
  );
}

export async function fetchBillingCheckoutSessionStatus(
  sessionId: string
): Promise<BillingCheckoutSessionSyncResponse> {
  return requestBilling<BillingCheckoutSessionSyncResponse>(
    `/billing/checkout/session/status?session_id=${encodeURIComponent(sessionId)}`
  );
}

export async function fetchBillingSubscription(): Promise<BillingSubscriptionResponse> {
  return requestBilling<BillingSubscriptionResponse>("/billing/subscription");
}

export async function postBillingChangePreview(
  payload: BillingChangePreviewPayload
): Promise<BillingChangePreviewResponse> {
  return requestBilling<BillingChangePreviewResponse, BillingChangePreviewPayload>(
    "/billing/subscription/change-preview",
    payload
  );
}

export async function postBillingChangeApply(
  payload: BillingChangeApplyPayload
): Promise<BillingChangeApplyResponse> {
  return requestBilling<BillingChangeApplyResponse, BillingChangeApplyPayload>(
    "/billing/subscription/change-apply",
    payload
  );
}

export async function postBillingCancelRenewal(): Promise<BillingSubscriptionResponse> {
  return requestBilling<BillingSubscriptionResponse, Record<string, never>>(
    "/billing/subscription/cancel-renewal",
    {}
  );
}

export async function postBillingResumeRenewal(): Promise<BillingSubscriptionResponse> {
  return requestBilling<BillingSubscriptionResponse, Record<string, never>>(
    "/billing/subscription/resume-renewal",
    {}
  );
}