import { API_BASE_URL } from "../../config";
import { buildProductRuntimeHeaders } from "./auth";

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