import { t, type Lang } from "../i18n";
import { PLAN_CREDITS, getNextPlan, PlanKey } from "../plan-config";
import { useProductStore } from "../state/productStore";

type Props = {
  open: boolean;
  reason: "NO_CREDITS" | "FEATURE_LOCKED";
  onClose: () => void;
};

export default function UpgradeModal({ open, reason, onClose }: Props) {
  const store = useProductStore();
  const lang = store.state.lang as Lang;
  const currentPlan = store.state.plan as PlanKey;

  if (!open) return null;

  const nextPlan = getNextPlan(currentPlan);
  const isAnon = currentPlan === "free_anon";

  const nextCredits = nextPlan ? PLAN_CREDITS[nextPlan] : null;
  const currentCredits = PLAN_CREDITS[currentPlan];

  const delta =
    nextCredits != null && currentCredits != null ? nextCredits - currentCredits : null;

  // COPY (100% i18n)
  const isFeatureLocked = reason === "FEATURE_LOCKED";

  const title = isAnon
    ? t(lang, "credits.modalAnonTitle")
    : isFeatureLocked
    ? t(lang, "credits.modalFeatureTitle")
    : t(lang, "credits.modalNoCreditsTitle");

  const body = isAnon
    ? t(lang, "credits.modalAnonBody", { delta: 2 })
    : isFeatureLocked
    ? t(lang, "credits.modalFeatureBody", {
        delta: delta ?? 0,
        total: nextCredits ?? 0,
      })
    : t(lang, "credits.modalNoCreditsBody", {
        delta: delta ?? 0,
        total: nextCredits ?? 0,
      });

  const primary = isAnon
    ? t(lang, "credits.modalAnonPrimary")
    : isFeatureLocked
    ? t(lang, "credits.modalFeaturePrimary", { delta: delta ?? 0 })
    : t(lang, "credits.modalNoCreditsPrimary", { delta: delta ?? 0 });

  const secondary = t(lang, "common.notNow");

  return (
    <div className="um-overlay">
      <div className="um-modal">
        <h2>{title}</h2>
        <p>{body}</p>

        <div className="um-actions">
          <button className="um-btn-secondary" onClick={onClose}>
            {secondary}
          </button>

          <button
            className="um-btn-primary"
            onClick={() => {
              // MVP:
              // - free_anon: no futuro -> signup/login
              // - demais: simula upgrade de plano
              if (!isAnon && nextPlan) {
                store.setPlan(nextPlan as any);
              }
              onClose();
            }}
          >
            {primary}
          </button>
        </div>
      </div>
    </div>
  );
}
