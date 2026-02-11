export type PlanKey = "free_anon" | "free_plus" | "basic" | "light" | "pro";

export const PLAN_ORDER: PlanKey[] = [
  "free_anon",
  "free_plus",
  "basic",
  "light",
  "pro",
];

export const PLAN_CREDITS: Record<PlanKey, number> = {
  free_anon: 1,
  free_plus: 3,
  basic: 10,
  light: 50,
  pro: 200,
};

export function getNextPlan(current: PlanKey): PlanKey | null {
  const idx = PLAN_ORDER.indexOf(current);
  if (idx === -1) return null;
  if (idx === PLAN_ORDER.length - 1) return null;
  return PLAN_ORDER[idx + 1];
}
