import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from "react";

import type { Lang } from "../i18n";
import { warmI18n } from "../i18n";

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

export type ProductStore = {
  state: ProductPersistedState;
  entitlements: Entitlements;

  setPlan: (plan: PlanId) => void;
  setLang: (lang: Lang) => void;
  setAuth: (opts: { is_logged_in: boolean; email?: string | null }) => void;

  // Credits / reveal
  canReveal: (fixtureKey: string) => boolean;
  isRevealed: (fixtureKey: string) => boolean;
  tryReveal: (fixtureKey: string) => { ok: true } | { ok: false; reason: "NO_CREDITS" | "ALREADY_REVEALED" };

  // Dev-only helper
  resetForTesting: () => void;
  resetNonce: number;
  i18nNonce: number;

};

const ProductStoreCtx = createContext<ProductStore | null>(null);

export function ProductStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProductPersistedState>(() => loadProductState());
  const [resetNonce, setResetNonce] = useState(0);
  const [i18nNonce, setI18nNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    warmI18n(state.lang as Lang)
      .then(() => {
        if (alive) setI18nNonce((n) => n + 1); // força re-render após carregar o dict
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [state.lang]);

  // Persist helper that always writes localStorage
  const persist = useCallback((next: ProductPersistedState) => {
    setState(next);
    saveProductState(next);
  }, []);

  const entitlements = useMemo(() => buildEntitlements(state), [state]);

  const setPlan = useCallback(
    (plan: PlanId) => {
      persist({ ...state, plan });
    },
    [persist, state]
  );

  const setLang = useCallback(
    (lang: Lang) => {
      persist({ ...state, lang });
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

  const isRevealed = useCallback(
    (fixtureKey: string) => {
      return !!state.credits.revealed_today?.[fixtureKey];
    },
    [state]
  );

  const canReveal = useCallback(
    (fixtureKey: string) => {
      return canRevealFixture(state, fixtureKey);
    },
    [state]
  );

  /**
   * tryReveal MUST be deterministic and race-safe.
   * Use current state snapshot (functional update) to avoid stale closures.
   */
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

    return result as any;
  }, []);

  /**
   * DEV Reset: keep plan/lang/auth, but reset ONLY the reveal/credit usage fields,
   * without pulling a fresh loadProductState() (which can introduce date/shape drift).
   *
   * This makes Reset predictable and avoids UI "silent bug" states.
   */
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

    // Triggers DEV remount keys (Option B) and any reset listeners
    setResetNonce((n) => n + 1);
  }, []);

  const value: ProductStore = useMemo(
    () => ({
      state,
      entitlements,
      setPlan,
      setLang,
      setAuth,
      canReveal,
      isRevealed,
      tryReveal,
      resetForTesting,
      resetNonce,
      // 🔹 apenas para re-render quando i18n carrega
      i18nNonce,
    }),
    [
      state,
      entitlements,
      setPlan,
      setLang,
      setAuth,
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
