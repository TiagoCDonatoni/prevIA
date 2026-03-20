import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { Lang } from "../i18n";
import { warmI18n } from "../i18n";
import { postAccessReveal } from "../api/access";

import {
  buildEntitlements,
  canRevealFixture,
  consumeCreditForReveal,
  loadProductState,
  saveProductState,
  type Entitlements,
  type PlanId,
} from "../entitlements";

export type ProductPersistedState = ReturnType<typeof loadProductState>;

export type BootstrapMeta = {
  source: "local" | "backend";
  is_ready: boolean;
  auth_mode: string | null;
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

  setPlan: (plan: PlanId) => void;
  setLang: (lang: Lang) => void;
  setAuth: (opts: { is_logged_in: boolean; email?: string | null }) => void;

  applyBackendBootstrap: (payload: {
    is_authenticated: boolean;
    email: string | null;
    plan: Exclude<PlanId, "FREE_ANON">;
    auth_mode: string | null;
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

export function ProductStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProductPersistedState>(() => loadProductState());
  const [bootstrap, setBootstrap] = useState<BootstrapMeta>({
    source: "local",
    is_ready: false,
    auth_mode: null,
  });
  const [backendUsage, setBackendUsage] = useState<BackendUsageState>({
    source: "local",
    date_key: null,
    credits_used: 0,
    revealed_count: 0,
    daily_limit: null,
    remaining: null,
    revealed_fixture_keys: [],
    is_ready: false,
  });
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

  const entitlements = useMemo(() => buildEntitlements(state), [state]);

  const setPlanId = useCallback(
    (plan: PlanId) => {
      persist({
        ...state,
        plan,
      });
    },
    [persist, state]
  );

  const setLang = useCallback(
    (lang: Lang) => {
      persist({
        ...state,
        lang,
      });
    },
    [persist, state]
  );

  const setAuth = useCallback(
    (opts: { is_logged_in: boolean; email?: string | null }) => {
      persist({
        ...state,
        auth: {
          is_logged_in: opts.is_logged_in,
          email: opts.email ?? null,
        },
      });
    },
    [persist, state]
  );

  const applyBackendBootstrap = useCallback(
    (payload: {
      is_authenticated: boolean;
      email: string | null;
      plan: Exclude<PlanId, "FREE_ANON">;
      auth_mode: string | null;
    }) => {
      const next: ProductPersistedState = {
        ...state,
        plan: payload.is_authenticated ? payload.plan : "FREE_ANON",
        auth: {
          is_logged_in: payload.is_authenticated,
          email: payload.email ?? null,
        },
      };

      persist(next);

      setBootstrap({
        source: "backend",
        is_ready: true,
        auth_mode: payload.auth_mode,
      });
    },
    [persist, state]
  );

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
        revealed_fixture_keys: payload.revealed_fixture_keys,
        is_ready: true,
      });
    },
    []
  );

  const revealViaBackend = useCallback(
    async (
      fixtureKey: string
    ): Promise<{ ok: true } | { ok: false; reason: "NO_CREDITS" | "ALREADY_REVEALED" | "UNKNOWN" }> => {
      try {
        const response = await postAccessReveal(fixtureKey);

        if (!response.ok) {
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

        setBackendUsage((prev) => ({
          ...prev,
          source: "backend",
          credits_used: response.usage.credits_used,
          revealed_count: response.usage.revealed_count,
          daily_limit: response.usage.daily_limit,
          remaining: response.usage.remaining,
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
    });

    setResetNonce((n) => n + 1);
  }, []);

  const value: ProductStore = useMemo(
    () => ({
      state,
      entitlements,
      bootstrap,
      backendUsage,
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