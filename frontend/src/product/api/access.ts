import { API_BASE_URL } from "../../config";
import { buildProductRuntimeHeaders, clearAuthMeCache } from "./auth";

export type AccessUsageResponse = {
  ok: boolean;
  user_id: number;
  plan_code: string;
  date_key: string;
  usage: {
    credits_used: number;
    revealed_count: number;
    daily_limit: number;
    remaining: number;
    revealed_fixture_keys: string[];
  };
};

export type AccessRevealResponse =
  | {
      ok: true;
      already_revealed: boolean;
      consumed_credit: boolean;
      usage: {
        credits_used: number;
        revealed_count: number;
        daily_limit: number;
        remaining: number;
      };
    }
  | {
      ok: false;
      code: "INVALID_FIXTURE_KEY" | "NO_CREDITS";
      message: string;
      usage?: {
        credits_used: number;
        revealed_count: number;
        daily_limit: number;
        remaining: number;
      };
    };

export type AccessCampaignPayload = {
  campaign_id: number;
  slug: string;
  label: string;
  kind: string;
  status: string;
  trial: {
    enabled: boolean;
    plan_code: string;
    duration_days: number | null;
  };
  limits: {
    max_redemptions: number | null;
    redeemed_count: number;
    remaining_redemptions: number | null;
    starts_at_utc: string | null;
    expires_at_utc: string | null;
  };
  offer?: {
    offer_id: number;
    discount_type: string;
    discount_percent: number | null;
    discount_amount_cents: number | null;
    currency: string | null;
    discount_duration: string;
    discount_duration_months: number | null;
    eligible_plan_codes: string[];
    eligible_billing_cycles: string[];
    offer_valid_until_utc: string | null;
    offer_valid_days_after_grant_end: number | null;
    stripe_coupon_id: string | null;
    stripe_promotion_code_id: string | null;
    max_redemptions: number | null;
    redeemed_count: number;
  } | null;
  metadata?: Record<string, any>;
};

export type AccessCampaignResponse =
  | {
      ok: true;
      campaign: AccessCampaignPayload;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export type AccessCampaignRedeemResponse =
  | {
      ok: true;
      code: "REDEEMED" | "ALREADY_REDEEMED" | "PENDING_APPROVAL" | string;
      message: string;
      grant?: {
        grant_id: number;
        grant_category: string;
        plan_code: string;
        starts_at_utc: string | null;
        ends_at_utc: string | null;
      };
      redemption?: {
        redemption_id: number;
        grant_id?: number | null;
        status: string;
      };
      discount_eligibility?: {
        eligibility_id: number;
        starts_at_utc: string | null;
        ends_at_utc: string | null;
        eligible_plan_codes: string[];
        eligible_billing_cycles: string[];
      } | null;
      auth_refresh_required?: boolean;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export class AccessRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AccessRequestError";
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

export async function fetchAccessCampaign(slug: string): Promise<AccessCampaignPayload> {
  const safeSlug = String(slug || "").trim().toLowerCase();

  const res = await fetch(
    `${API_BASE_URL}/access/campaigns/${encodeURIComponent(safeSlug)}`,
    {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...buildProductRuntimeHeaders(),
      },
    }
  );

  const data = await readJsonSafe<AccessCampaignResponse>(res);

  if (!res.ok || !data || !data.ok) {
    const message =
      data && "message" in data && data.message
        ? data.message
        : `access_campaign_failed:${res.status}`;
    const code = data && "code" in data ? data.code : undefined;
    throw new AccessRequestError(message, res.status, code);
  }

  return data.campaign;
}

export async function postAccessCampaignRedeem(
  slug: string
): Promise<AccessCampaignRedeemResponse> {
  const safeSlug = String(slug || "").trim().toLowerCase();

  const res = await fetch(
    `${API_BASE_URL}/access/campaigns/${encodeURIComponent(safeSlug)}/redeem`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...buildProductRuntimeHeaders(),
      },
    }
  );

  const data = await readJsonSafe<AccessCampaignRedeemResponse>(res);

  if (!res.ok || !data || !data.ok) {
    const message =
      data && "message" in data && data.message
        ? data.message
        : `access_campaign_redeem_failed:${res.status}`;
    const code = data && "code" in data ? data.code : undefined;
    throw new AccessRequestError(message, res.status, code);
  }

  clearAuthMeCache();

  return data;
}

export async function fetchAccessUsage(): Promise<AccessUsageResponse> {
  const res = await fetch(`${API_BASE_URL}/access/usage`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...buildProductRuntimeHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(`access_usage_failed:${res.status}`);
  }

  return (await res.json()) as AccessUsageResponse;
}

export async function postAccessDevReset(): Promise<AccessUsageResponse> {
  const res = await fetch(`${API_BASE_URL}/access/dev/reset-testing`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...buildProductRuntimeHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(`access_dev_reset_failed:${res.status}`);
  }

  return (await res.json()) as AccessUsageResponse;
}

export async function postAccessReveal(fixtureKey: string): Promise<AccessRevealResponse> {
  const res = await fetch(`${API_BASE_URL}/access/reveal`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...buildProductRuntimeHeaders(),
    },
    body: JSON.stringify({
      fixture_key: fixtureKey,
    }),
  });

  if (!res.ok) {
    throw new Error(`access_reveal_failed:${res.status}`);
  }

  return (await res.json()) as AccessRevealResponse;
}