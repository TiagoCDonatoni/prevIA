import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { Lang } from "../i18n";
import { warmI18n } from "../i18n";
import { postAccessReveal } from "../api/access";

import {
  buildEntitlements,
  canRevealFixture,
  consumeCreditForReveal,
  loadProductState,
  normalizeLang,
  saveProductState,
  type Entitlements,
  type PlanId,
} from "../entitlements";

export type ProductPersistedState = ReturnType<typeof loadProductState>;

export type AccountSnapshot = {
  user_id: number | null;
  email: string | null;
  full_name: string | null;
  preferred_lang: string | null;
  status: string | null;
  email_verified: boolean | null;
  subscription: {
    plan_code: string | null;
    status: string | null;
    provider: string | null;
    billing_cycle: "monthly" | "quarterly" | "semiannual" | "annual" | null;
  };
};

export type BootstrapMeta = {
  source: "local" | "backend";
  is_ready: boolean;
  auth_mode: string | null;
  user_id: number | null;
  full_name: string | null;
  preferred_lang: string | null;
  user_status: string | null;
  email_verified: boolean | null;
  subscription_status: string | null;
  subscription_provider: string | null;
};

export type BackendUsageState = {
  source: "local" | "backend";
  date_key: string | null;
  credits_used: number;
  revealed_count: number;
  daily_limit: number | null;
  remaining: number | null;
  revealed_fixture_keys: string[];
  is_ready: boolean;
};

export type ProductStore = {
  state: ProductPersistedState;
  entitlements: Entitlements;
  bootstrap: BootstrapMeta;
  backendUsage: BackendUsageState;
  accountSnapshot: AccountSnapshot;

  promoteCurrentSessionToDeviceAnonShadow: () => void;
  consumeDeviceAnonShadowCredit: () => void;
  resetDeviceAnonShadow: () => void;

  setPlan: (plan: PlanId) => void;
  setLang: (lang: Lang) => void;
  setAuth: (opts: { is_logged_in: boolean; email?: string | null }) => void;

  applyBackendBootstrap: (payload: {
    is_authenticated: boolean;
    email: string | null;
    plan: Exclude<PlanId, "FREE_ANON">;
    auth_mode: string | null;
    user_id?: number | null;
    full_name?: string | null;
    preferred_lang?: string | null;
    user_status?: string | null;
    email_verified?: boolean | null;
    subscription_plan_code?: string | null;
    subscription_status?: string | null;
    subscription_provider?: string | null;
    subscription_billing_cycle?: "monthly" | "quarterly" | "semiannual" | "annual" | null;
  }) => void;

  applyBackendUsage: (payload: {
    date_key: string;
    credits_used: number;
    revealed_count: number;
    daily_limit: number;
    remaining: number;
    revealed_fixture_keys: string[];
  }) => void;

  revealViaBackend: (
    fixtureKey: string
  ) => Promise<{ ok: true } | { ok: false; reason: "NO_CREDITS" | "ALREADY_REVEALED" | "UNKNOWN" }>;

  canReveal: (fixtureKey: string) => boolean;
  isRevealed: (fixtureKey: string) => boolean;
  tryReveal: (fixtureKey: string) => { ok: true } | { ok: false; reason: "NO_CREDITS" | "ALREADY_REVEALED" };

  resetForTesting: () => void;
  resetNonce: number;
  i18nNonce: number;
};

const ProductStoreCtx = createContext<ProductStore | null>(null);

const STORAGE_DEVICE_ANON_USAGE = "previa_device_anon_usage_v1";
const FREE_ANON_DAILY_LIMIT = 3;

type DeviceAnonUsageState = {
  date_key: string | null;
  used_today: number;
};

function dateKeyUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function readDeviceAnonUsage(): DeviceAnonUsageState {
  const today = dateKeyUtc();

  try {
    const raw = localStorage.getItem(STORAGE_DEVICE_ANON_USAGE);
    if (!raw) return { date_key: today, used_today: 0 };

    const parsed = JSON.parse(raw) as DeviceAnonUsageState;
    if (!parsed?.date_key || parsed.date_key !== today) {
      return { date_key: today, used_today: 0 };
    }

    return {
      date_key: today,
      used_today: Math.max(0, Math.min(FREE_ANON_DAILY_LIMIT, Number(parsed.used_today ?? 0))),
    };
  } catch {
    return { date_key: today, used_today: 0 };
  }
}

function writeDeviceAnonUsage(next: DeviceAnonUsageState) {
  localStorage.setItem(STORAGE_DEVICE_ANON_USAGE, JSON.stringify(next));
}

function mergeDeviceAnonUsageFromBackend(
  current: DeviceAnonUsageState,
  payload: { date_key: string; credits_used: number }
): DeviceAnonUsageState {
  const today = payload.date_key || dateKeyUtc();
  const clampedBackendUsed = Math.max(
    0,
    Math.min(FREE_ANON_DAILY_LIMIT, Number(payload.credits_used ?? 0))
  );

  if (current.date_key !== today) {
    return {
      date_key: today,
      used_today: clampedBackendUsed,
    };
  }

  return {
    date_key: today,
    used_today: Math.max(current.used_today, clampedBackendUsed),
  };
}

const DEFAULT_ACCOUNT_SNAPSHOT: AccountSnapshot = {
  user_id: null,
  email: null,
  full_name: null,
  preferred_lang: null,
  status: null,
  email_verified: null,
  subscription: {
    plan_code: null,
    status: null,
    provider: null,
    billing_cycle: null,
  },
};

const DEFAULT_BACKEND_USAGE: BackendUsageState = {
  source: "local",
  date_key: null,
  credits_used: 0,
  revealed_count: 0,
  daily_limit: null,
  remaining: null,
  revealed_fixture_keys: [],
  is_ready: false,
};

export function ProductStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProductPersistedState>(() => loadProductState());
  const [bootstrap, setBootstrap] = useState<BootstrapMeta>({
    source: "local",
    is_ready: false,
    auth_mode: null,
    user_id: null,
    full_name: null,
    preferred_lang: null,
    user_status: null,
    email_verified: null,
    subscription_status: null,
    subscription_provider: null,
  });
  const [backendUsage, setBackendUsage] = useState<BackendUsageState>(DEFAULT_BACKEND_USAGE);
  const [accountSnapshot, setAccountSnapshot] = useState<AccountSnapshot>(DEFAULT_ACCOUNT_SNAPSHOT);
  const [resetNonce, setResetNonce] = useState(0);
  const [i18nNonce, setI18nNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    warmI18n(state.lang as Lang)
      .then(() => {
        if (alive) setI18nNonce((n) => n + 1);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [state.lang]);

  const persist = useCallback((next: ProductPersistedState) => {
    setState(next);
    saveProductState(next);
  }, []);

  const persistWith = useCallback(
    (updater: (prev: ProductPersistedState) => ProductPersistedState) => {
      setState((prev) => {
        const next = updater(prev);
        saveProductState(next);
        return next;
      });
    },
    []
  );

  const entitlements = useMemo(() => buildEntitlements(state), [state]);

  const setPlanId = useCallback(
    (plan: PlanId) => {
      persistWith((prev) => ({
        ...prev,
        plan,
      }));
    },
    [persistWith]
  );

  const setLang = useCallback(
    (lang: Lang) => {
      persistWith((prev) => ({
        ...prev,
        lang,
      }));
    },
    [persistWith]
  );

  const setAuth = useCallback(
    (opts: { is_logged_in: boolean; email?: string | null }) => {
      persistWith((prev) => ({
        ...prev,
        auth: {
          is_logged_in: opts.is_logged_in,
          email: opts.email ?? null,
        },
      }));
    },
    [persistWith]
  );

  const applyBackendBootstrap = useCallback(
    (payload: {
      is_authenticated: boolean;
      email: string | null;
      plan: Exclude<PlanId, "FREE_ANON">;
      auth_mode: string | null;
      user_id?: number | null;
      full_name?: string | null;
      preferred_lang?: string | null;
      user_status?: string | null;
      email_verified?: boolean | null;
      subscription_plan_code?: string | null;
      subscription_status?: string | null;
      subscription_provider?: string | null;
      subscription_billing_cycle?: "monthly" | "quarterly" | "semiannual" | "annual" | null;
    }) => {
      persistWith((prev) => {
        if (payload.is_authenticated) {
          const nextLang =
            payload.preferred_lang && String(payload.preferred_lang).trim()
              ? normalizeLang(payload.preferred_lang)
              : prev.lang;

          return {
            ...prev,
            plan: payload.plan,
            lang: nextLang,
            auth: {
              is_logged_in: true,
              email: payload.email ?? null,
            },
          };
        }

        const deviceAnon = readDeviceAnonUsage();
        const today = deviceAnon.date_key || dateKeyUtc();

        return {
          ...prev,
          plan: "FREE_ANON",
          auth: {
            is_logged_in: false,
            email: null,
          },
          credits: {
            date_key: today,
            used_today: Math.max(0, Math.min(FREE_ANON_DAILY_LIMIT, deviceAnon.used_today)),
            revealed_today: {},
          },
        };
      });

      setBackendUsage(DEFAULT_BACKEND_USAGE);

      if (payload.is_authenticated) {
        setAccountSnapshot({
          user_id: payload.user_id ?? null,
          email: payload.email ?? null,
          full_name: payload.full_name ?? null,
          preferred_lang: payload.preferred_lang ?? null,
          status: payload.user_status ?? null,
          email_verified: payload.email_verified ?? null,
          subscription: {
            plan_code: payload.subscription_plan_code ?? payload.plan ?? null,
            status: payload.subscription_status ?? null,
            provider: payload.subscription_provider ?? null,
            billing_cycle: payload.subscription_billing_cycle ?? null,
          },
        });
      } else {
        setAccountSnapshot(DEFAULT_ACCOUNT_SNAPSHOT);
      }

      setBootstrap({
        source: "backend",
        is_ready: true,
        auth_mode: payload.auth_mode,
        user_id: payload.is_authenticated ? payload.user_id ?? null : null,
        full_name: payload.is_authenticated ? payload.full_name ?? null : null,
        preferred_lang: payload.is_authenticated ? payload.preferred_lang ?? null : null,
        user_status: payload.is_authenticated ? payload.user_status ?? null : null,
        email_verified: payload.is_authenticated ? payload.email_verified ?? null : null,
        subscription_status: payload.is_authenticated ? payload.subscription_status ?? null : null,
        subscription_provider: payload.is_authenticated ? payload.subscription_provider ?? null : null,
      });
    },
    [persistWith]
  );

  const promoteCurrentSessionToDeviceAnonShadow = useCallback(() => {
    const date_key = backendUsage.date_key || dateKeyUtc();
    const current = readDeviceAnonUsage();
    const next = mergeDeviceAnonUsageFromBackend(current, {
      date_key,
      credits_used: backendUsage.credits_used,
    });

    writeDeviceAnonUsage(next);
  }, [backendUsage]);

  const consumeDeviceAnonShadowCredit = useCallback(() => {
    const current = readDeviceAnonUsage();
    const today = current.date_key || dateKeyUtc();

    const next = {
      date_key: today,
      used_today: Math.max(0, Math.min(FREE_ANON_DAILY_LIMIT, current.used_today + 1)),
    };

    writeDeviceAnonUsage(next);
  }, []);

  const resetDeviceAnonShadow = useCallback(() => {
    writeDeviceAnonUsage({
      date_key: dateKeyUtc(),
      used_today: 0,
    });
  }, []);

  const applyBackendUsage = useCallback(
    (payload: {
      date_key: string;
      credits_used: number;
      revealed_count: number;
      daily_limit: number;
      remaining: number;
      revealed_fixture_keys: string[];
    }) => {
      setBackendUsage({
        source: "backend",
        date_key: payload.date_key,
        credits_used: payload.credits_used,
        revealed_count: payload.revealed_count,
        daily_limit: payload.daily_limit,
        remaining: payload.remaining,
        revealed_fixture_keys: Array.isArray(payload.revealed_fixture_keys)
          ? payload.revealed_fixture_keys
          : [],
        is_ready: true,
      });

      const currentShadow = readDeviceAnonUsage();
      const nextShadow = mergeDeviceAnonUsageFromBackend(currentShadow, {
        date_key: payload.date_key,
        credits_used: payload.credits_used,
      });

      writeDeviceAnonUsage(nextShadow);
    },
    []
  );

  const revealViaBackend = useCallback(
    async (
      fixtureKey: string
    ): Promise<{ ok: true } | { ok: false; reason: "NO_CREDITS" | "ALREADY_REVEALED" | "UNKNOWN" }> => {
      try {
        const response = await postAccessReveal(fixtureKey);

        if (response.ok === false) {
          if (response.code === "NO_CREDITS") {
            if (response.usage) {
              setBackendUsage((prev) => ({
                ...prev,
                source: "backend",
                daily_limit: response.usage.daily_limit ?? prev.daily_limit,
                credits_used: response.usage.credits_used ?? prev.credits_used,
                revealed_count: response.usage.revealed_count ?? prev.revealed_count,
                remaining: response.usage.remaining ?? prev.remaining,
                is_ready: true,
              }));
            }
            return { ok: false, reason: "NO_CREDITS" };
          }

          return { ok: false, reason: "UNKNOWN" };
        }

        const usage = response.usage;

        setBackendUsage((prev) => ({
          ...prev,
          source: "backend",
          credits_used: usage.credits_used,
          revealed_count: usage.revealed_count,
          daily_limit: usage.daily_limit,
          remaining: usage.remaining,
          revealed_fixture_keys: prev.revealed_fixture_keys.includes(fixtureKey)
            ? prev.revealed_fixture_keys
            : [...prev.revealed_fixture_keys, fixtureKey],
          is_ready: true,
        }));

        if (response.already_revealed) {
          return { ok: false, reason: "ALREADY_REVEALED" };
        }

        return { ok: true };
      } catch (err) {
        console.error("revealViaBackend failed", err);
        return { ok: false, reason: "UNKNOWN" };
      }
    },
    []
  );

  const isRevealed = useCallback(
    (fixtureKey: string) => {
      if (backendUsage.is_ready) {
        return backendUsage.revealed_fixture_keys.includes(fixtureKey);
      }
      return !!state.credits.revealed_today?.[fixtureKey];
    },
    [backendUsage, state]
  );

  const canReveal = useCallback(
    (fixtureKey: string) => {
      if (backendUsage.is_ready) {
        const alreadyRevealed = backendUsage.revealed_fixture_keys.includes(fixtureKey);
        if (alreadyRevealed) return true;
        return (backendUsage.remaining ?? 0) > 0;
      }

      return canRevealFixture(state, fixtureKey);
    },
    [backendUsage, state]
  );

  const tryReveal = useCallback((fixtureKey: string) => {
    if (!fixtureKey) return { ok: false as const, reason: "NO_CREDITS" as const };

    let result: { ok: true } | { ok: false; reason: "NO_CREDITS" | "ALREADY_REVEALED" } = {
      ok: false,
      reason: "NO_CREDITS",
    };

    setState((prev) => {
      if (prev.credits.revealed_today?.[fixtureKey]) {
        result = { ok: false as const, reason: "ALREADY_REVEALED" as const };
        return prev;
      }

      if (!canRevealFixture(prev, fixtureKey)) {
        result = { ok: false as const, reason: "NO_CREDITS" as const };
        return prev;
      }

      const next = consumeCreditForReveal(prev, fixtureKey);

      if (next.plan === "FREE_ANON") {
        writeDeviceAnonUsage({
          date_key: next.credits.date_key,
          used_today: Math.max(0, Math.min(FREE_ANON_DAILY_LIMIT, next.credits.used_today)),
        });
      }

      result = { ok: true as const };
      saveProductState(next);
      return next;
    });

    return result;
  }, []);

  const resetForTesting = useCallback(() => {
    setState((prev) => {
      const next: ProductPersistedState = {
        ...prev,
        credits: {
          ...prev.credits,
          used_today: 0,
          revealed_today: {},
        },
      };

      saveProductState(next);
      return next;
    });

    resetDeviceAnonShadow();

    setBackendUsage({
      source: "local",
      date_key: null,
      credits_used: 0,
      revealed_count: 0,
      daily_limit: null,
      remaining: null,
      revealed_fixture_keys: [],
      is_ready: false,
    });

    setBootstrap({
      source: "local",
      is_ready: false,
      auth_mode: null,
      user_id: null,
      full_name: null,
      preferred_lang: null,
      user_status: null,
      email_verified: null,
      subscription_status: null,
      subscription_provider: null,
    });

    setAccountSnapshot(DEFAULT_ACCOUNT_SNAPSHOT);

    setResetNonce((n) => n + 1);
  }, []);

  const value: ProductStore = useMemo(
    () => ({
      state,
      entitlements,
      bootstrap,
      backendUsage,
      accountSnapshot,
      promoteCurrentSessionToDeviceAnonShadow,
      consumeDeviceAnonShadowCredit,
      resetDeviceAnonShadow,
      setPlan: setPlanId,
      setLang,
      setAuth,
      applyBackendBootstrap,
      applyBackendUsage,
      revealViaBackend,
      canReveal,
      isRevealed,
      tryReveal,
      resetForTesting,
      resetNonce,
      i18nNonce,
    }),
    [
      state,
      entitlements,
      bootstrap,
      backendUsage,
      accountSnapshot,
      promoteCurrentSessionToDeviceAnonShadow,
      consumeDeviceAnonShadowCredit,
      resetDeviceAnonShadow,
      setPlanId,
      setLang,
      setAuth,
      applyBackendBootstrap,
      applyBackendUsage,
      revealViaBackend,
      canReveal,
      isRevealed,
      tryReveal,
      resetForTesting,
      resetNonce,
      i18nNonce,
    ]
  );

  return <ProductStoreCtx.Provider value={value}>{children}</ProductStoreCtx.Provider>;
}

export function useProductStore() {
  const ctx = useContext(ProductStoreCtx);
  if (!ctx) throw new Error("useProductStore must be used within ProductStoreProvider");
  return ctx;
}