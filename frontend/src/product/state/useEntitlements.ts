import { useCallback, useEffect, useMemo, useState } from "react";

export type Plan = "FREE_ANON" | "FREE" | "BASIC" | "LIGHT" | "PRO";

export const STORAGE_PLAN = "previa_plan_v1";
export const STORAGE_CREDITS = "previa_credits_v1";
export const STORAGE_REVEALS = "previa_reveals_v1";

// Evento interno (mesma aba) para sincronizar múltiplas instâncias do hook
const ENTITLEMENTS_EVENT = "previa_entitlements_changed";

function getTodayKey() {
  // MVP local: dia do relógio da máquina.
  // Depois: backend deve fornecer resets_at com timezone correto.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function dailyLimitFor(plan: Plan) {
  switch (plan) {
    case "FREE_ANON":
      return 3;
    case "FREE":
      return 5;
    case "BASIC":
      return 10;
    case "LIGHT":
      return 50;
    case "PRO":
      return 200;
    default:
      return 3;
  }
}

type CreditsState = {
  date: string;
  used: number;
};

function readCredits(): CreditsState {
  try {
    const raw = localStorage.getItem(STORAGE_CREDITS);
    if (!raw) return { date: getTodayKey(), used: 0 };

    const parsed = JSON.parse(raw) as CreditsState;
    if (!parsed?.date) return { date: getTodayKey(), used: 0 };

    // reset automático se mudou o dia
    if (parsed.date !== getTodayKey()) return { date: getTodayKey(), used: 0 };

    return { date: parsed.date, used: Number(parsed.used ?? 0) };
  } catch {
    return { date: getTodayKey(), used: 0 };
  }
}

function writeCredits(s: CreditsState) {
  localStorage.setItem(STORAGE_CREDITS, JSON.stringify(s));
}

function readPlan(): Plan {
  const v = localStorage.getItem(STORAGE_PLAN);
  if (v === "FREE_ANON" || v === "FREE" || v === "BASIC" || v === "LIGHT" || v === "PRO") return v;
  return "FREE_ANON";
}

function writePlan(p: Plan) {
  localStorage.setItem(STORAGE_PLAN, p);
}

export function useEntitlements() {
  const [plan, setPlanState] = useState<Plan>(readPlan);
  const [credits, setCredits] = useState<CreditsState>(readCredits);
  const [resetNonce, setResetNonce] = useState(0);

  const syncFromStorage = useCallback(() => {
    setPlanState(readPlan());
    setCredits(readCredits());
  }, []);

  useEffect(() => {
    // se nunca setou plano, inicializa explicitamente como FREE_ANON
    const stored = localStorage.getItem(STORAGE_PLAN);
    if (!stored) {
      localStorage.setItem(STORAGE_PLAN, "FREE_ANON");
      setPlanState("FREE_ANON");
      window.dispatchEvent(new Event(ENTITLEMENTS_EVENT));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincronização entre múltiplas instâncias (mesma aba + outras abas)
  useEffect(() => {
    const onSync = () => syncFromStorage();

    window.addEventListener(ENTITLEMENTS_EVENT, onSync);
    window.addEventListener("storage", onSync);

    return () => {
      window.removeEventListener(ENTITLEMENTS_EVENT, onSync);
      window.removeEventListener("storage", onSync);
    };
  }, [syncFromStorage]);

  // Reset diário automático (defensivo)
  useEffect(() => {
    const today = getTodayKey();
    if (credits.date !== today) {
      const next = { date: today, used: 0 };
      writeCredits(next);
      setCredits(next);

      window.dispatchEvent(new Event(ENTITLEMENTS_EVENT));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits.date]);

  const dailyLimit = dailyLimitFor(plan);
  const remaining = Math.max(0, dailyLimit - credits.used);

  const setPlan = useCallback((p: Plan) => {
    writePlan(p);
    setPlanState(p);

    window.dispatchEvent(new Event(ENTITLEMENTS_EVENT));
  }, []);

  /**
   * Consumo ATÔMICO e confiável:
   * - lê plano e créditos do storage (source of truth)
   * - valida limite real
   * - grava e sincroniza
   */
  const tryConsume = useCallback((cost: number = 1) => {
    const planNow = readPlan();
    const limit = dailyLimitFor(planNow);
    const current = readCredits();

    console.log("[CREDITS]", {
      planNow,
      limit,
      used: current.used,
      cost,
      willBe: current.used + cost,
    });

    if (current.used + cost > limit) {
      console.warn("[CREDITS] blocked: over limit");
      return false;
    }

    const next = { date: getTodayKey(), used: current.used + cost };
    writeCredits(next);
    setCredits(next);

    // corrige state local se estiver stale
    setPlanState(planNow);

    window.dispatchEvent(new Event(ENTITLEMENTS_EVENT));
    return true;
  }, []);

  const setUsedToday = useCallback((used: number) => {
    const current = readCredits();
    const next = { ...current, used: Number(used ?? 0) };
    writeCredits(next);
    setCredits(next);

    window.dispatchEvent(new Event(ENTITLEMENTS_EVENT));
  }, []);

  const creditsLabel = useMemo(() => {
    return `Créditos: ${remaining}/${dailyLimit}`;
  }, [remaining, dailyLimit]);

  const resetForTesting = useCallback(() => {
    const resetCredits = { date: getTodayKey(), used: 0 };
    writeCredits(resetCredits);
    setCredits(resetCredits);

    localStorage.removeItem(STORAGE_REVEALS);

    setResetNonce((n) => n + 1);

    window.dispatchEvent(new Event(ENTITLEMENTS_EVENT));

    console.log("[DEV] Base resetada: créditos e análises limpos");
  }, []);

  return useMemo(
    () => ({
      plan,
      setPlan,
      dailyLimit,
      usedToday: credits.used,
      remainingToday: remaining,
      setUsedToday,
      creditsLabel,

      tryConsume,

      // DEV
      resetForTesting,
      resetNonce,
    }),
    [
      plan,
      setPlan,
      dailyLimit,
      credits.used,
      remaining,
      setUsedToday,
      creditsLabel,
      tryConsume,
      resetForTesting,
      resetNonce,
    ]
  );
}
