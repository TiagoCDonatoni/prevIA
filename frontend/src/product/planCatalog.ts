import type { PlanId } from "./entitlements";

type PlanCatalogItem = {
  currency: "BRL" | "USD" | "EUR";
  currencySymbol: string;
  // null = ainda não definido (UI mostra placeholder)
  priceMonthly: number | null;
};

export const PLAN_CATALOG: Record<PlanId, PlanCatalogItem> = {
  FREE_ANON: { currency: "BRL", currencySymbol: "R$", priceMonthly: null },
  FREE:      { currency: "BRL", currencySymbol: "R$", priceMonthly: null },
  BASIC:     { currency: "BRL", currencySymbol: "R$", priceMonthly: null },
  LIGHT:     { currency: "BRL", currencySymbol: "R$", priceMonthly: null },
  PRO:       { currency: "BRL", currencySymbol: "R$", priceMonthly: null },
};
