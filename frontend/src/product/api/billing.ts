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
  items: BillingCatalogItem[];
};

export type BillingCheckoutSessionResponse = {
  ok: boolean;
  checkout_url: string;
  session_id: string;
  price_code: string;
  plan_code: string;
  billing_cycle: BillingCycle;
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

export async function fetchBillingCatalog(): Promise<BillingCatalogResponse> {
  const res = await fetch(`${API_BASE_URL}/billing/catalog`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await readJsonSafe<BillingCatalogResponse>(res);

  if (!res.ok) {
    throw new BillingRequestError(`billing_catalog_failed:${res.status}`, res.status);
  }

  return data ?? { ok: true, items: [] };
}

export async function createBillingCheckoutSession(payload: {
  plan_code: Exclude<PlanId, "FREE_ANON" | "FREE">;
  billing_cycle: BillingCycle;
}): Promise<BillingCheckoutSessionResponse> {
  const res = await fetch(`${API_BASE_URL}/billing/checkout/session`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await readJsonSafe<any>(res);

  if (!res.ok) {
    const message = data?.message || `billing_checkout_failed:${res.status}`;
    const code = data?.code;
    throw new BillingRequestError(message, res.status, code);
  }

  return data as BillingCheckoutSessionResponse;
}