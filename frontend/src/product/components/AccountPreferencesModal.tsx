import React from "react";

import type { Lang } from "../i18n";
import {
  getBettorProfileCards,
  narrativeStyleFromBettorProfile,
  type BettorProfileId,
  type ProductAccountPreferences,
} from "../preferences/accountPreferences";

type Props = {
  open: boolean;
  lang: Lang;
  initialBettorProfile?: BettorProfileId | null;
  kicker?: string;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  secondaryLabel?: string;
  onClose: () => void;
  onSave: (payload: ProductAccountPreferences) => void | Promise<void>;
};

function textByLang(lang: Lang, pt: string, en: string, es: string) {
  if (lang === "en") return en;
  if (lang === "es") return es;
  return pt;
}

export function AccountPreferencesModal({
  open,
  lang,
  initialBettorProfile = null,
  kicker,
  title,
  subtitle,
  confirmLabel,
  secondaryLabel,
  onClose,
  onSave,
}: Props) {
  const [selected, setSelected] = React.useState<BettorProfileId | null>(initialBettorProfile);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSelected(initialBettorProfile);
    setBusy(false);
  }, [open, initialBettorProfile]);

  const cards = React.useMemo(() => getBettorProfileCards(lang), [lang]);

  if (!open) return null;

  const modalKicker =
    kicker ??
    textByLang(lang, "Preferências da conta", "Account preferences", "Preferencias de la cuenta");

  const modalTitle =
    title ??
    textByLang(
      lang,
      "Como você costuma apostar?",
      "How do you usually bet?",
      "¿Cómo sueles apostar?"
    );

  const modalSubtitle =
    subtitle ??
    textByLang(
      lang,
      "Isso ajuda a ajustar a forma como explicamos as análises para você.",
      "This helps tailor how we explain the analysis to you.",
      "Esto ayuda a ajustar la forma en que te explicamos los análisis."
    );

  const primaryLabel =
    confirmLabel ?? textByLang(lang, "Salvar e continuar", "Save and continue", "Guardar y continuar");

  const closeLabel =
    secondaryLabel ?? textByLang(lang, "Agora não", "Not now", "Ahora no");

  const selectedLabel = textByLang(lang, "Selecionado", "Selected", "Seleccionado");
  const closeAriaLabel = textByLang(lang, "Fechar", "Close", "Cerrar");

  async function handleSave() {
    if (!selected || busy) return;

    setBusy(true);

    try {
      await onSave({
        bettor_profile: selected,
        narrative_style: narrativeStyleFromBettorProfile(selected),
        completed_onboarding: true,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="um-overlay account-preferences-overlay"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="um-modal account-preferences-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="product-modal-head">
          <div className="product-modal-head-copy">
            <div className="product-modal-kicker">{modalKicker}</div>
            <div className="product-modal-title">{modalTitle}</div>
            <div className="product-modal-subtitle">{modalSubtitle}</div>
          </div>

          <button
            type="button"
            className="product-modal-close"
            onClick={onClose}
            aria-label={closeAriaLabel}
            disabled={busy}
          >
            ×
          </button>
        </div>

        <div className="product-modal-body account-preferences-body">
          <div className="account-preferences-grid">
            {cards.map((card) => {
              const isSelected = selected === card.id;

              return (
                <button
                  key={card.id}
                  type="button"
                  className={`account-preferences-card ${isSelected ? "is-selected" : ""}`}
                  onClick={() => setSelected(card.id)}
                  aria-pressed={isSelected}
                >
                  <div className="account-preferences-card-visual" aria-hidden="true" />

                  <div className="account-preferences-card-title-row">
                    <div className="account-preferences-card-title">{card.title}</div>
                    {isSelected ? (
                      <span className="account-preferences-card-tag">{selectedLabel}</span>
                    ) : null}
                  </div>

                  <div className="account-preferences-card-description">{card.description}</div>

                  <ul className="account-preferences-card-list">
                    {card.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          <div className="account-preferences-actions">
            <button
              type="button"
              className="product-secondary"
              onClick={onClose}
              disabled={busy}
            >
              {closeLabel}
            </button>

            <button
              type="button"
              className="product-primary"
              onClick={() => void handleSave()}
              disabled={busy || !selected}
            >
              {busy
                ? textByLang(lang, "Salvando...", "Saving...", "Guardando...")
                : primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}