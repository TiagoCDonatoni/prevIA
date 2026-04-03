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
  checkout_url: string;
  session_id: string;
  price_code: string;
  plan_code: string;
  billing_cycle: BillingCycle;
  currency_code?: "BRL" | "USD" | string;
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

export async function fetchBillingSubscription(): Promise<BillingSubscriptionResponse> {
  return requestBilling<BillingSubscriptionResponse>("/billing/subscription");
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