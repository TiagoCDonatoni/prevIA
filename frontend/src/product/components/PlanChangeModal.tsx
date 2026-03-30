import React, { useEffect, useMemo, useState } from "react";

import { PRODUCT_AUTH_ENABLED, PRODUCT_DEV_AUTO_LOGIN_ENABLED } from "../../config";

import { t, type Lang } from "../i18n";
import {
  dailyLimitForPlan,
  getHigherPlans,
  getNextPlan,
  type PlanId,
} from "../entitlements";
import { useProductStore } from "../state/productStore";

import { PLAN_CATALOG } from "../planCatalog";

type Reason = "MANUAL" | "NO_CREDITS" | "FEATURE_LOCKED";
type BillingCycle = "monthly" | "quarterly" | "annual";

const LOW_CREDITS_THRESHOLD = 5;
const BILLING_CYCLES: BillingCycle[] = ["monthly", "quarterly", "annual"];

function getRecommendedPlanId(currentPlan: PlanId): PlanId | null {
  if (currentPlan === "PRO") return null;

  if (currentPlan === "FREE" || currentPlan === "FREE_ANON") {
    const currentLimit = dailyLimitForPlan(currentPlan);
    return currentLimit <= LOW_CREDITS_THRESHOLD ? "LIGHT" : "BASIC";
  }

  return getNextPlan(currentPlan);
}

function getPlanNameKey(planId: PlanId) {
  if (planId === "FREE_ANON") return "plans.freeAnon.name";
  if (planId === "FREE") return "plans.free.name";
  if (planId === "BASIC") return "plans.basic.name";
  if (planId === "LIGHT") return "plans.light.name";
  return "plans.pro.name";
}

function getPlanDescKey(planId: PlanId) {
  if (planId === "FREE_ANON") return "plans.freeAnon.desc";
  if (planId === "FREE") return "plans.free.desc";
  if (planId === "BASIC") return "plans.basic.desc";
  if (planId === "LIGHT") return "plans.light.desc";
  return "plans.pro.desc";
}

function getPlanBadgeKey(planId: PlanId) {
  if (planId === "FREE_ANON") return "plans.freeAnon.badge";
  if (planId === "FREE") return "plans.free.badge";
  if (planId === "BASIC") return "plans.basic.badge";
  if (planId === "LIGHT") return "plans.light.badge";
  return "plans.pro.badge";
}

function getBillingCycleLabelKey(cycle: BillingCycle) {
  if (cycle === "quarterly") return "auth.billingCycleQuarterly";
  if (cycle === "annual") return "auth.billingCycleAnnual";
  return "auth.billingCycleMonthly";
}

function getBillingCyclePrice(monthlyPrice: number | null, cycle: BillingCycle): number | null {
  if (monthlyPrice == null) return null;
  if (cycle === "quarterly") return monthlyPrice * 3;
  if (cycle === "annual") return monthlyPrice * 12;
  return monthlyPrice;
}

function getBillingCyclePriceSuffixKey(cycle: BillingCycle) {
  if (cycle === "quarterly") return "plans.price.perQuarter";
  if (cycle === "annual") return "plans.price.perYear";
  return "plans.price.perMonth";
}

function getModalTitle(
  tr: (k: string, vars?: Record<string, any>) => string,
  reason: Reason
) {
  if (reason === "NO_CREDITS") return tr("credits.modalNoCreditsTitle");
  if (reason === "FEATURE_LOCKED") return tr("credits.modalFeatureTitle");
  return tr("plans.modal.manualTitle");
}

function getModalSubtitle(
  tr: (k: string, vars?: Record<string, any>) => string,
  reason: Reason,
  vars: { delta: number; total: number }
) {
  if (reason === "NO_CREDITS") return tr("credits.modalNoCreditsBody", vars);
  if (reason === "FEATURE_LOCKED") return tr("credits.modalFeatureBody", vars);
  return tr("plans.modal.manualSubtitle");
}

export function PlanChangeModal(props: {
  open: boolean;
  reason: Reason;
  onClose: () => void;
}) {
  const store = useProductStore();
  const rawLang = String(store.state.lang || "pt").toLowerCase();
  const lang = (rawLang === "ptbr" || rawLang === "pt-br" ? "pt" : rawLang) as Lang;

  const currentPlan = store.state.plan as PlanId;
  const canApplyLocalPlanChange = !PRODUCT_AUTH_ENABLED || PRODUCT_DEV_AUTO_LOGIN_ENABLED;

  const tr = useMemo(
    () => (k: string, vars?: Record<string, any>) => t(lang, k, vars),
    [lang]
  );

  const higherPlans = getHigherPlans(currentPlan);
  const currentLimit = dailyLimitForPlan(currentPlan);
  const recommendedPlan = getRecommendedPlanId(currentPlan);
  const fallbackPlan = (higherPlans[0] ?? null) as PlanId | null;

  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>("monthly");

  useEffect(() => {
    if (!props.open) return;
    setSelectedPlan((recommendedPlan ?? fallbackPlan ?? null) as PlanId | null);
    setSelectedCycle("monthly");
  }, [props.open, props.reason, currentPlan, recommendedPlan, fallbackPlan]);

  useEffect(() => {
    if (!props.open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [props.open, props]);

  if (!props.open) return null;

  const nextPlanForCopy = recommendedPlan ?? fallbackPlan ?? getNextPlan(currentPlan);
  const nextLimit = nextPlanForCopy ? dailyLimitForPlan(nextPlanForCopy) : currentLimit;
  const delta = Math.max(0, nextLimit - currentLimit);

  const title = getModalTitle(tr, props.reason);
  const subtitle = getModalSubtitle(tr, props.reason, {
    delta,
    total: nextLimit,
  });

  const showPlans = higherPlans.length > 0;

  const selectedLimit = selectedPlan ? dailyLimitForPlan(selectedPlan) : null;
  const selectedPlus =
    selectedPlan && selectedLimit != null ? Math.max(0, selectedLimit - currentLimit) : 0;

  const selectedCatalog = selectedPlan ? PLAN_CATALOG[selectedPlan] : null;
  const selectedPrice = selectedCatalog
    ? getBillingCyclePrice(selectedCatalog.priceMonthly, selectedCycle)
    : null;

  return (
    <div
      className="um-overlay"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        props.onClose();
      }}
    >
      <div
        className="um-modal product-plan-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="product-modal-head product-plan-modal-head">
          <div className="product-plan-head-layout">
            <div className="product-modal-head-copy product-plan-head-copy">
              <div className="product-modal-kicker">prevIA</div>
              <div className="product-modal-title">{title}</div>
              <div className="product-modal-subtitle">{subtitle}</div>
            </div>

            <div className="product-plan-context-card product-plan-context-card-inline">
              <div className="product-plan-context-kicker">{tr("auth.currentPlan")}</div>

              <div className="product-plan-context-top">
                <div className="product-plan-context-label">{tr(getPlanNameKey(currentPlan))}</div>
                <div className="product-plan-context-meta">
                  {currentLimit} {tr("plans.units.creditsPerDay")}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="product-modal-close"
            onClick={props.onClose}
            aria-label={tr("common.close")}
          >
            ×
          </button>
        </div>

        <div className="product-modal-body">
          {showPlans ? (
            <>
              <div className="product-plan-cycle-bar">
                <div className="product-plan-cycle-label">{tr("auth.billingRecurrence")}</div>

                <div
                  className="product-plan-cycle-options"
                  role="radiogroup"
                  aria-label={tr("auth.billingRecurrence")}
                >
                  {BILLING_CYCLES.map((cycle) => {
                    const isActive = selectedCycle === cycle;

                    return (
                      <button
                        key={cycle}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        className={`product-plan-cycle-option ${isActive ? "is-active" : ""}`}
                        onClick={() => setSelectedCycle(cycle)}
                      >
                        {tr(getBillingCycleLabelKey(cycle))}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`product-plan-grid ${higherPlans.length >= 4 ? "is-balanced" : ""}`}>
                {higherPlans.map((pid) => {
                  const limit = dailyLimitForPlan(pid);
                  const plus = Math.max(0, limit - currentLimit);
                  const isRecommended = recommendedPlan != null && pid === recommendedPlan;
                  const isSelected = selectedPlan === pid;
                  const catalog = PLAN_CATALOG[pid];
                  const cyclePrice = getBillingCyclePrice(catalog.priceMonthly, selectedCycle);

                  return (
                    <button
                      key={pid}
                      type="button"
                      className={`product-plan-card ${isRecommended ? "is-recommended" : ""} ${
                        isSelected ? "is-selected" : ""
                      }`}
                      onClick={() => setSelectedPlan(pid)}
                      aria-pressed={isSelected}
                    >
                      <div className="product-plan-card-check">{isSelected ? "✓" : ""}</div>

                      <div className="product-plan-card-top">
                        <div className="product-plan-card-badges">
                          <span className="product-plan-chip product-plan-chip-muted">
                            {tr(getPlanBadgeKey(pid))}
                          </span>

                          {isRecommended ? (
                            <span className="product-plan-chip product-plan-chip-recommended">
                              {tr("plans.badge.recommended")}
                            </span>
                          ) : null}
                        </div>

                        <div className="product-plan-card-title">{tr(getPlanNameKey(pid))}</div>
                        <div className="product-plan-card-desc">{tr(getPlanDescKey(pid))}</div>
                      </div>

                      <div className="product-plan-feature-list">
                        <div className="product-plan-feature-item">
                          <span className="product-plan-feature-dot">•</span>
                          <span>
                            <strong>{limit}</strong> {tr("plans.units.creditsPerDay")}
                          </span>
                        </div>

                        {plus > 0 ? (
                          <div className="product-plan-feature-item">
                            <span className="product-plan-feature-dot">•</span>
                            <span>{tr("plans.copy.moreCredits", { plus })}</span>
                          </div>
                        ) : null}

                        <div className="product-plan-feature-item">
                          <span className="product-plan-feature-dot">•</span>
                          <span>{tr("plans.copy.lessInterruptions")}</span>
                        </div>
                      </div>

                      <div className="product-plan-price-block">
                        <div className="product-plan-price-value">
                          {cyclePrice != null ? (
                            <>
                              {catalog.currencySymbol}
                              {cyclePrice.toFixed(2)}
                            </>
                          ) : (
                            <span className="product-plan-price-placeholder">
                              {tr("plans.price.placeholder")}
                            </span>
                          )}
                        </div>

                        <div className="product-plan-price-sub">
                          {tr(getBillingCyclePriceSuffixKey(selectedCycle))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="product-plan-empty-card">{tr("common.notNow")}</div>
          )}

          <div className="product-plan-footer">
            <div className="product-plan-actions">
              <button type="button" className="product-secondary" onClick={props.onClose}>
                {tr("common.notNow")}
              </button>

              <button
                type="button"
                className="product-primary"
                disabled={!selectedPlan || !canApplyLocalPlanChange}
                onClick={() => {
                  if (!selectedPlan) return;

                  if (canApplyLocalPlanChange) {
                    store.setPlan(selectedPlan);
                  }

                  props.onClose();
                }}
              >
                {canApplyLocalPlanChange
                  ? tr("plans.cta.upgrade")
                  : tr("plans.price.placeholder")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}