import { API_BASE_URL } from "../../config";
import type { PlanId } from "../entitlements";

const PRODUCT_PLAN_OVERRIDE_SESSION_KEY = "previa_product_plan_override_v1";

export function readProductPlanOverride(): Exclude<PlanId, "FREE_ANON"> | null {
  try {
    const raw = sessionStorage.getItem(PRODUCT_PLAN_OVERRIDE_SESSION_KEY);
    return raw ? normalizeBackendPlanCode(raw) : null;
  } catch {
    return null;
  }
}

export function writeProductPlanOverride(plan: Exclude<PlanId, "FREE_ANON"> | null) {
  try {
    if (!plan) {
      sessionStorage.removeItem(PRODUCT_PLAN_OVERRIDE_SESSION_KEY);
      return;
    }

    sessionStorage.setItem(
      PRODUCT_PLAN_OVERRIDE_SESSION_KEY,
      normalizeBackendPlanCode(plan)
    );
  } catch {}
}

export function clearProductPlanOverride() {
  writeProductPlanOverride(null);
}

export function buildProductRuntimeHeaders(): Record<string, string> {
  const planOverride = readProductPlanOverride();
  return planOverride ? { "X-Product-Plan-Override": planOverride } : {};
}

export type AuthAccessResponse = {
  is_internal: boolean;
  billing_runtime: "live" | "sandbox" | string;
  role_keys: string[];
  capabilities: string[];
  admin_access: boolean;
  product_internal_access: boolean;
  allow_plan_override: boolean;
  product_plan_code: Exclude<PlanId, "FREE_ANON"> | null;
  domain_rule?: {
    domain?: string | null;
    source?: string | null;
  } | null;
};

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
  access?: AuthAccessResponse;
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

export type AuthChangePasswordResponse = {
  ok: true;
  message: string;
  meta?: {
    generated_at_utc?: string;
  };
};

export type AuthGoogleLoginResponse = AuthMeResponse;
export type AuthGoogleLinkResponse = AuthMeResponse;

export type PatchAuthProfilePayload = {
  full_name: string;
  preferred_lang: "pt" | "en" | "es";
};

export type PatchAuthProfileResponse = {
  ok: true;
  user: {
    user_id: number;
    email: string;
    full_name: string | null;
    preferred_lang: "pt" | "en" | "es" | null;
    status: string | null;
    email_verified: boolean | null;
  };
};

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
      ...buildProductRuntimeHeaders(),
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
      ...buildProductRuntimeHeaders(),
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

export async function postAuthChangePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<AuthChangePasswordResponse> {
  return requestJson<AuthChangePasswordResponse, typeof payload>(
    "/auth/password/change",
    payload
  );
}

export async function postAuthGoogleLogin(payload: {
  credential: string;
}): Promise<AuthGoogleLoginResponse> {
  return requestJson<AuthGoogleLoginResponse, typeof payload>("/auth/google/login", payload);
}

export async function postAuthGoogleLink(payload: {
  credential: string;
}): Promise<AuthGoogleLinkResponse> {
  return requestJson<AuthGoogleLinkResponse, typeof payload>("/auth/google/link", payload);
}

export async function patchAuthProfile(
  payload: PatchAuthProfilePayload
): Promise<PatchAuthProfileResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/profile`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...buildProductRuntimeHeaders(),
    },
    body: JSON.stringify(payload),
  });

  const data = await readJsonSafe<PatchAuthProfileResponse | AuthErrorResponse>(res);

  if (!res.ok) {
    const message =
      (data && "message" in data && data.message) || `auth_profile_patch_failed:${res.status}`;
    const code = data && "code" in data ? data.code : undefined;
    throw new AuthRequestError(message, res.status, code);
  }

  return data as PatchAuthProfileResponse;
}