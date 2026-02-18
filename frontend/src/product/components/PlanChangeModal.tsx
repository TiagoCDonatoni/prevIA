import React, { useMemo, useEffect, useState } from "react";

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

const LOW_CREDITS_THRESHOLD = 5;

function getRecommendedPlanId(currentPlan: PlanId): PlanId | null {
  // PRO não tem upgrade
  if (currentPlan === "PRO") return null;

  // Free (anon ou logado): recomenda BASIC, ou LIGHT se limite for muito baixo
  if (currentPlan === "FREE" || currentPlan === "FREE_ANON") {
    const currentLimit = dailyLimitForPlan(currentPlan);
    return currentLimit <= LOW_CREDITS_THRESHOLD ? "LIGHT" : "BASIC";
  }

  // Demais: recomenda o próximo degrau
  return getNextPlan(currentPlan);
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

  const tr = useMemo(
    () => (k: string, vars?: Record<string, any>) => t(lang, k, vars),
    [lang]
  );

  // ✅ calcule isso ANTES do early return (não é hook, pode)
  const higherPlans = getHigherPlans(currentPlan);
  const currentLimit = dailyLimitForPlan(currentPlan);
  const recommendedPlan = getRecommendedPlanId(currentPlan);

  // ✅ hooks SEMPRE antes de qualquer return condicional
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);

  useEffect(() => {
    // quando abrir ou mudar o contexto, reseta seleção
    if (!props.open) return;
    const nextSelected = (recommendedPlan ?? higherPlans[0] ?? null) as PlanId | null;
    setSelectedPlan(nextSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, currentPlan, props.reason]);

  // ✅ agora pode retornar
  if (!props.open) return null;

  // Mantém delta/nextLimit para o copy atual (NO_CREDITS/FEATURE_LOCKED)
  const nextPlanForCopy = getNextPlan(currentPlan);
  const nextLimit = nextPlanForCopy ? dailyLimitForPlan(nextPlanForCopy) : null;
  const delta = nextLimit != null ? Math.max(0, nextLimit - currentLimit) : 0;

  const title =
    props.reason === "NO_CREDITS"
      ? tr("credits.modalNoCreditsTitle")
      : props.reason === "FEATURE_LOCKED"
      ? tr("credits.modalFeatureTitle")
      : tr("plans.cta.seePlans");

  const subtitle =
    props.reason === "NO_CREDITS"
      ? tr("credits.modalNoCreditsBody", {
          delta,
          total: nextLimit ?? currentLimit,
        })
      : props.reason === "FEATURE_LOCKED"
      ? tr("credits.modalFeatureBody", {
          delta,
          total: nextLimit ?? currentLimit,
        })
      : tr("credits.counter", {
          remaining: store.entitlements.credits.remaining_today,
          limit: store.entitlements.credits.daily_limit,
        });

  const showPlans = higherPlans.length > 0;

  return (
    <div className="um-overlay" role="dialog" aria-modal="true">
      <div className="um-modal" style={{ maxWidth: 920 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <p style={{ margin: 0, color: "var(--muted)" }}>{subtitle}</p>
        </div>

        <div style={{ marginTop: 16 }}>
          {showPlans ? (
            <div className="plan-cols">
              {higherPlans.map((pid) => {
                const limit = dailyLimitForPlan(pid);
                const plus = Math.max(0, limit - currentLimit);
                const isRecommended =
                  recommendedPlan != null && pid === recommendedPlan;

                const nameKey =
                  pid === "FREE_ANON"
                    ? "plans.freeAnon.name"
                    : pid === "FREE"
                    ? "plans.free.name"
                    : pid === "BASIC"
                    ? "plans.basic.name"
                    : pid === "LIGHT"
                    ? "plans.light.name"
                    : "plans.pro.name";

                const descKey =
                  pid === "FREE_ANON"
                    ? "plans.freeAnon.desc"
                    : pid === "FREE"
                    ? "plans.free.desc"
                    : pid === "BASIC"
                    ? "plans.basic.desc"
                    : pid === "LIGHT"
                    ? "plans.light.desc"
                    : "plans.pro.desc";

                return (
                    <div
                      key={pid}
                      className={`plan-col ${isRecommended ? "is-rec" : ""} ${selectedPlan === pid ? "is-selected" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedPlan(pid)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelectedPlan(pid);
                      }}
                    >

                    <div className="plan-head">
                      <div className="plan-title">{tr(nameKey)}</div>
                      {isRecommended ? (
                        <div className="plan-badge">
                          {tr("plans.badge.recommended")}
                        </div>
                      ) : null}
                    </div>

                    <div className="plan-desc">{tr(descKey)}</div>

                    <div className="plan-features">
                      <div className="plan-feature">
                        ✓ <strong>{limit}</strong>{" "}
                        {tr("plans.units.creditsPerDay")}
                      </div>

                      {plus > 0 ? (
                        <div className="plan-feature">
                          ✓ {tr("plans.copy.moreCredits", { plus })}
                        </div>
                      ) : null}

                      <div className="plan-feature">
                        ✓ {tr("plans.copy.lessInterruptions")}
                      </div>
                    </div>

                    <div className="plan-price">
                      <div className="plan-price-value">
                        {PLAN_CATALOG[pid].priceMonthly != null ? (
                          <>
                            {PLAN_CATALOG[pid].currencySymbol}
                            {PLAN_CATALOG[pid].priceMonthly!.toFixed(2)}
                          </>
                        ) : (
                          <span className="plan-price-placeholder">
                            {tr("plans.price.placeholder")}
                          </span>
                        )}
                      </div>

                      <div className="plan-price-sub">
                        {tr("plans.price.perMonth")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 12,
              }}
            >
              {tr("common.notNow")}
            </div>
          )}
        </div>

        <div className="um-actions" style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="um-btn-secondary" onClick={props.onClose}>
            {tr("common.notNow")}
          </button>

          <button
            className="um-btn-primary"
            disabled={!selectedPlan}
            onClick={() => {
              if (!selectedPlan) return;
              store.setPlan(selectedPlan);
              props.onClose();
            }}
          >
            {tr("plans.cta.upgrade")}
          </button>
        </div>

      </div>
    </div>
  );
}
