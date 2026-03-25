import { API_BASE_URL } from "../../config";
import type { PlanId } from "../entitlements";

export type AuthMeResponse = {
  ok: boolean;
  auth_mode: "anonymous" | "dev_auto_login" | "session" | string;
  is_authenticated: boolean;
  user: null | {
    user_id: number;
    email: string;
    full_name: string | null;
    preferred_lang: string | null;
    status: string;
    email_verified: boolean;
  };
  subscription: {
    plan_code: string;
    status: string;
    provider: string | null;
    billing_cycle: "monthly" | "quarterly" | "semiannual" | "annual" | null;
  };
  entitlements: {
    credits?: {
      daily_limit?: number;
    };
    features?: {
      chat?: boolean;
    };
    visibility?: {
      odds?: {
        books_count?: number;
      };
      model?: {
        show_metrics?: boolean;
      };
      context?: {
        show_head_to_head?: boolean;
      };
    };
    limits?: {
      max_future_days?: number;
    };
  };
  usage?: {
    credits_used_today?: number;
  };
  meta?: {
    generated_at_utc?: string;
  };
};

export type AuthErrorResponse = {
  ok: false;
  code: string;
  message: string;
};

export type AuthForgotPasswordResponse = {
  ok: true;
  message: string;
  debug?: {
    reset_token?: string;
    expires_at_utc?: string;
  };
  meta?: {
    generated_at_utc?: string;
  };
};

export type AuthResetPasswordResponse = {
  ok: true;
  message: string;
  meta?: {
    generated_at_utc?: string;
  };
};

export type AuthGoogleLoginResponse = AuthMeResponse;

export class AuthRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AuthRequestError";
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

async function requestJson<TResponse, TBody extends Record<string, any> | undefined>(
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

  const data = await readJsonSafe<AuthMeResponse | AuthErrorResponse>(res);

  if (!res.ok) {
    const message =
      (data && "message" in data && data.message) || `auth_request_failed:${res.status}`;
    const code = data && "code" in data ? data.code : undefined;
    throw new AuthRequestError(message, res.status, code);
  }

  return data as TResponse;
}

async function requestAuth<TBody extends Record<string, any> | undefined>(
  path: string,
  body?: TBody
): Promise<AuthMeResponse> {
  return requestJson<AuthMeResponse, TBody>(path, body);
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  return requestAuth("/auth/me");
}

export async function postAuthSignup(payload: {
  email: string;
  password: string;
  full_name: string | null;
}): Promise<AuthMeResponse> {
  return requestAuth("/auth/signup", payload);
}

export async function postAuthLogin(payload: {
  email: string;
  password: string;
}): Promise<AuthMeResponse> {
  return requestAuth("/auth/login", payload);
}

export async function postAuthLogout(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await readJsonSafe<{ ok: boolean }>(res);

  if (!res.ok) {
    throw new AuthRequestError(`auth_logout_failed:${res.status}`, res.status);
  }

  return data ?? { ok: true };
}

export function normalizeBackendPlanCode(
  raw: string | null | undefined
): Exclude<PlanId, "FREE_ANON"> {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "FREE" || v === "BASIC" || v === "LIGHT" || v === "PRO") return v;
  return "FREE";
}

export async function postAuthForgotPassword(payload: {
  email: string;
}): Promise<AuthForgotPasswordResponse> {
  return requestJson<AuthForgotPasswordResponse, typeof payload>("/auth/password/forgot", payload);
}

export async function postAuthResetPassword(payload: {
  token: string;
  new_password: string;
}): Promise<AuthResetPasswordResponse> {
  return requestJson<AuthResetPasswordResponse, typeof payload>("/auth/password/reset", payload);
}

export async function postAuthGoogleLogin(payload: {
  credential: string;
}): Promise<AuthGoogleLoginResponse> {
  return requestJson<AuthGoogleLoginResponse, typeof payload>("/auth/google/login", payload);
}