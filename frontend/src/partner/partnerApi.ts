import { API_BASE_URL } from "../config";
import { buildProductRuntimeHeaders } from "../product/api/auth";

export type PartnerConsolePartner = {
  partner_id: number;
  owner_user_id: number;
  display_name: string;
  legal_name: string | null;
  email: string | null;
  status: string;
  tier: string;
  created_at_utc: string | null;
  updated_at_utc: string | null;
};

export type PartnerConsoleContract = {
  contract_id: number;
  partner_id: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  auto_renewal_enabled: boolean;
  commission_rate: number | null;
  commission_invoice_limit: number | null;
  commission_base: string | null;
  validation_days: number | null;
  payout_minimum_amount: number | null;
  terms_version: string | null;
  commission_enabled: boolean;
  commission_only_for_new_users: boolean;
  commission_requires_paid_invoice: boolean;
  commission_excludes_refunded_payments: boolean;
  commission_excludes_disputed_payments: boolean;
  commission_requires_active_subscription: boolean;
  payout_frequency: string | null;
  payout_currency: string | null;
  payout_method: string | null;
  signed_at_utc: string | null;
  created_at_utc: string | null;
  updated_at_utc: string | null;
};

export type PartnerConsoleAttributionSummary = {
  total: number;
  active: number;
  pending: number;
  non_commissionable: number;
  cancelled: number;
  superseded: number;
};

export type PartnerConsoleCampaign = {
  link_id: number;
  partner_id: number;
  contract_id: number;
  campaign_id: number;
  status: string;
  association_type: string;
  label: string | null;
  starts_at_utc: string | null;
  ends_at_utc: string | null;
  created_at_utc: string | null;
  updated_at_utc: string | null;
  campaign_slug: string;
  campaign_label: string | null;
  campaign_kind: string | null;
  campaign_status: string | null;
  campaign_redeemed_count: number;
  campaign_max_redemptions: number | null;
  attributions_total: number;
  attributions_active: number;
  attributions_pending: number;
  attributions_non_commissionable: number;
  public_urls: {
    pt: string;
    en: string;
    es: string;
  };
};

export type PartnerConsoleAttribution = {
  attribution_id: number;
  partner_id: number;
  contract_id: number;
  partner_campaign_link_id: number;
  campaign_id: number;
  user_id: number;
  attributed_at: string | null;
  attribution_rule: string;
  attribution_source: string;
  status: string;
  source_redemption_id: number | null;
  created_at_utc: string | null;
  updated_at_utc: string | null;
  user_display_name: string | null;
  user_email_masked: string | null;
  campaign_slug: string | null;
  campaign_label: string | null;
  campaign_kind: string | null;
  source_redemption_status: string | null;
  source_redeemed_at_utc: string | null;
};

export type PartnerConsoleResponse = {
  ok: true;
  partner: PartnerConsolePartner;
  active_contract: PartnerConsoleContract | null;
  attribution_summary: PartnerConsoleAttributionSummary;
  campaigns: PartnerConsoleCampaign[];
  attributions: PartnerConsoleAttribution[];
};

export class PartnerConsoleError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "PartnerConsoleError";
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

export async function fetchPartnerConsoleMe(): Promise<PartnerConsoleResponse> {
  const res = await fetch(`${API_BASE_URL}/partner/me`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...buildProductRuntimeHeaders(),
    },
  });

  const data = await readJsonSafe<any>(res);

  if (!res.ok) {
    const detail = data?.detail;
    const message =
      detail?.message ||
      data?.message ||
      `partner_console_request_failed:${res.status}`;
    const code = detail?.code || data?.code;
    throw new PartnerConsoleError(message, res.status, code);
  }

  return data as PartnerConsoleResponse;
}