import { useCallback, useEffect, useMemo, useState } from "react";

export type Plan = "FREE_ANON" | "FREE" | "BASIC" | "LIGHT" | "PRO";

const STORAGE_PLAN = "previa_plan_v1";
const STORAGE_CREDITS = "previa_credits_v1";
const STORAGE_REVEALS = "previa_reveals_v1";

function getTodayKey() {
  // America/Sao_Paulo: para MVP local, usamos o dia local da máquina.
  // Depois vamos migrar para o backend retornar resets_at.
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

  // Reset diário automático
  useEffect(() => {
    const today = getTodayKey();
    if (credits.date !== today) {
      const next = { date: today, used: 0 };
      setCredits(next);
      writeCredits(next);
    }
  }, [credits.date]);

  const dailyLimit = dailyLimitFor(plan);
  const remaining = Math.max(0, dailyLimit - credits.used);

  const setPlan = useCallback((p: Plan) => {
    setPlanState(p);
    writePlan(p);
    // ao trocar plano, não resetamos usado — só muda limite
  }, []);

  const consumeCredit = useCallback(() => {
    // consumo real acontece no reveal; aqui é utilitário
    const next = { ...credits, used: credits.used + 1 };
    setCredits(next);
    writeCredits(next);
  }, [credits]);

  const setUsedToday = useCallback((used: number) => {
    const next = { ...credits, used };
    setCredits(next);
    writeCredits(next);
  }, [credits]);

  const creditsLabel = useMemo(() => {
    return `Créditos: ${remaining}/${dailyLimit}`;
  }, [remaining, dailyLimit]);

  const resetForTesting = useCallback(() => {
    // reset créditos
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;

    const resetCredits = {
      date: todayKey,
      used: 0,
    };

    localStorage.setItem(STORAGE_CREDITS, JSON.stringify(resetCredits));
    setCredits(resetCredits);

    // limpar análises já reveladas
    localStorage.removeItem(STORAGE_REVEALS);

    console.log("[DEV] Base resetada: créditos e análises limpos");
  }, []);


  return useMemo(
    () => ({
      plan,
      setPlan,
      dailyLimit,
      usedToday: credits.used,
      remainingToday: remaining,
      consumeCredit,
      setUsedToday,
      creditsLabel,
      resetForTesting,

    }),
    [plan, setPlan, dailyLimit, credits.used, remaining, consumeCredit, setUsedToday, creditsLabel]
  );
}
