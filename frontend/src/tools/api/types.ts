export const BANKROLL_MANAGER = "BANKROLL_MANAGER" as const;

export type ToolAccessLevel = "free" | "lifetime" | "unavailable";
export type BankrollResult = "pending" | "won" | "lost" | "void" | "cashout";

export type ToolCatalogItem = {
  tool_code: string;
  slug: string;
  name_i18n_key: string;
  free_enabled: boolean;
  limits: Record<string, unknown>;
};

export type ToolAccess = {
  tool_code: string;
  access: ToolAccessLevel;
  limits: Record<string, unknown>;
  available: boolean;
};

export type ToolsCatalogResponse = {
  ok: true;
  brand: "prevIA Tools" | string;
  tools: ToolCatalogItem[];
};

export type BankrollAccount = {
  account_id: number;
  name: string;
  currency_code: string;
  initial_balance_cents: number;
  status: string;
  created_at_utc: string;
  updated_at_utc: string;
};

export type BankrollEntry = {
  entry_id: number;
  account_id: number;
  placed_at_utc: string;
  event_name: string;
  bookmaker: string;
  market: string;
  selection: string;
  odds_decimal: string;
  stake_cents: number;
  result: BankrollResult;
  return_cents: number | null;
  notes: string | null;
  settled_at_utc: string | null;
  created_at_utc: string;
  updated_at_utc: string;
};

export type BankrollSummary = {
  initial_balance_cents: number;
  available_balance_cents: number;
  realized_profit_cents: number;
  total_staked_cents: number;
  settled_staked_cents: number;
  pending_staked_cents: number;
  entries_count: number;
  pending_count: number;
  won_count: number;
  lost_count: number;
  void_count: number;
  cashout_count: number;
  win_rate: number;
  roi: number;
  average_odds: number;
};

export type BankrollBootstrapResponse = {
  ok: true;
  tool: ToolAccess;
  account: BankrollAccount | null;
  summary: BankrollSummary;
  entries: BankrollEntry[];
};

export type BankrollAccountCreate = {
  name: string;
  currency_code: string;
  initial_balance_cents: number;
};

export type BankrollEntryWrite = {
  account_id?: number;
  placed_at_utc: string;
  event_name: string;
  bookmaker: string;
  market: string;
  selection: string;
  odds_decimal: string;
  stake_cents: number;
  result: BankrollResult;
  return_cents: number | null;
  notes: string | null;
};
