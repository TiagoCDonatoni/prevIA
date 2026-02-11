import { PLAN_CREDITS, getNextPlan, PlanKey } from "../plan-config";
import { useProductStore } from "../state/productStore";

type Props = {
  open: boolean;
  reason: "NO_CREDITS" | "FEATURE_LOCKED";
  onClose: () => void;
};

export default function UpgradeModal({ open, reason, onClose }: Props) {
  const store = useProductStore();
  const lang = store.state.lang;
  const currentPlan = store.state.plan as PlanKey;

  if (!open) return null;

  const nextPlan = getNextPlan(currentPlan);
  const isAnon = currentPlan === "free_anon";

  const nextCredits = nextPlan ? PLAN_CREDITS[nextPlan] : null;
  const currentCredits = PLAN_CREDITS[currentPlan];

  const delta =
    nextCredits != null && currentCredits != null ? nextCredits - currentCredits : null;

  const text = getText(lang, isAnon, reason, delta, nextCredits);

  return (
    <div className="um-overlay">
      <div className="um-modal">
        <h2>{text.title}</h2>
        <p>{text.body}</p>

        {text.extra ? <p className="um-extra">{text.extra}</p> : null}

        <div className="um-actions">
          <button className="um-btn-secondary" onClick={onClose}>
            {text.secondary}
          </button>

          <button
            className="um-btn-primary"
            onClick={() => {
              // MVP: free_anon -> não faz upgrade direto; aqui no futuro deve ir para signup/login
              if (!isAnon && nextPlan) {
                store.setPlan(nextPlan as any);
              }
              onClose();
            }}
          >
            {text.primary}
          </button>
        </div>
      </div>
    </div>
  );
}

function getText(
  lang: string,
  isAnon: boolean,
  reason: "NO_CREDITS" | "FEATURE_LOCKED",
  delta: number | null,
  totalNext: number | null
) {
  const map = {
    pt: {
      anon: {
        title: "Crie sua conta gratuita",
        body: "Crie sua conta para desbloquear mais análises hoje.",
        extra: "",
        primary: "Criar conta grátis",
        secondary: "Agora não",
      },
      upgrade_no_credits: {
        title: "Seus créditos acabaram",
        body:
          delta != null && totalNext != null
            ? `Obtenha +${delta} créditos agora mesmo. Faça upgrade para liberar ${totalNext} créditos no total.`
            : "Obtenha mais créditos agora mesmo. Faça upgrade da sua conta.",
        extra: "",
        primary:
          delta != null ? `Obter +${delta} créditos agora` : "Fazer upgrade",
        secondary: "Agora não",
      },

      upgrade_feature_locked: {
        title: "Disponível em um plano superior",
        body:
          delta != null && totalNext != null
            ? `Desbloqueie esta função agora. Faça upgrade e ganhe +${delta} créditos (${totalNext} no total).`
            : "Desbloqueie esta função fazendo upgrade do seu plano.",
        extra: "",
        primary:
          delta != null ? `Fazer upgrade (+${delta} créditos)` : "Fazer upgrade",
        secondary: "Agora não",
      },

    },
    en: {
      anon: {
        title: "Create your free account",
        body: "Create your account to unlock more analyses today.",
        extra: "",
        primary: "Create free account",
        secondary: "Not now",
      },
      upgrade_no_credits: {
        title: "You’ve used all your credits",
        body:
          delta != null && totalNext != null
            ? `With the next plan you would get +${delta} credits (${totalNext} total).`
            : "Upgrade to get more credits.",
        extra: "",
        primary:
          delta != null ? `Get +${delta} credits now` : "Upgrade plan",
        secondary: "Not now",
      },
      upgrade_feature_locked: {
        title: "Available on a higher plan",
        body:
          delta != null && totalNext != null
            ? `Unlock this feature with +${delta} credits (${totalNext} total) on the next plan.`
            : "Upgrade to unlock this feature.",
        extra: "",
        primary:
          delta != null ? `Upgrade (+${delta} credits)` : "Upgrade plan",
        secondary: "Not now",
      },
    },
    es: {
      anon: {
        title: "Crea tu cuenta gratuita",
        body: "Crea tu cuenta para desbloquear más análisis hoy.",
        extra: "",
        primary: "Crear cuenta gratis",
        secondary: "Ahora no",
      },
      upgrade_no_credits: {
        title: "Se te acabaron los créditos",
        body:
          delta != null && totalNext != null
            ? `Con el próximo plan obtendrías +${delta} créditos (${totalNext} en total).`
            : "Mejora tu plan para obtener más créditos.",
        extra: "",
        primary:
          delta != null ? `Obtener +${delta} créditos ahora` : "Mejorar plan",
        secondary: "Ahora no",
      },
      upgrade_feature_locked: {
        title: "Disponible en un plan superior",
        body:
          delta != null && totalNext != null
            ? `Desbloquea esta función con +${delta} créditos (${totalNext} en total) en el próximo plan.`
            : "Mejora tu plan para desbloquear esta función.",
        extra: "",
        primary:
          delta != null ? `Mejorar (+${delta} créditos)` : "Mejorar plan",
        secondary: "Ahora no",
      },
    },
  };

  const l = (map as any)[lang] || map.pt;

  if (isAnon) return l.anon;

  if (reason === "FEATURE_LOCKED") return l.upgrade_feature_locked;

  return l.upgrade_no_credits;
}
