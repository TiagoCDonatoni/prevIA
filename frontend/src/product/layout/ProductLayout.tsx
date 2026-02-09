import React from "react";
import { Outlet } from "react-router-dom";

import { LANGS, t } from "../../i18n";
import { PLAN_LABELS, type PlanId } from "../entitlements";
import { useProductStore } from "../state/productStore";

function buildCreditsLabel(remaining: number, limit: number) {
  return `Créditos: ${remaining}/${limit}`;
}

export function ProductLayout() {
  const store = useProductStore();
  const lang = store.state.lang;
  const plan = store.state.plan;

  const remaining = store.entitlements.credits.remaining_today;
  const limit = store.entitlements.credits.daily_limit;

  return (
    <div className="product-shell">
      <header className="product-header">
        <div className="product-brand">prevIA</div>

        <div className="product-header-right">
          <div className="product-pill">
            <span className="product-pill-label">{t(lang, "nav.language")}</span>
            <select
              className="product-select"
              value={lang}
              onChange={(e) => store.setLang(e.target.value as any)}
            >
              {LANGS.map((l) => (
                <option key={l.lang} value={l.lang}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="product-pill">
            <span className="product-pill-label">{t(lang, "nav.plan")}</span>
            <select
              className="product-select"
              value={plan}
              onChange={(e) => store.setPlan(e.target.value as PlanId)}
            >
              {PLAN_LABELS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* DEV-only: remover depois */}
          <button
            className="product-reset-btn"
            onClick={store.resetForTesting}
            title="Resetar créditos e análises (DEV)"
          >
            Reset
          </button>

          <div className="product-credits">{buildCreditsLabel(remaining, limit)}</div>
        </div>
      </header>

      <main className="product-main">
        <Outlet key={store.resetNonce} />
      </main>

      <footer className="product-footer">
        <span className="product-footer-muted">© {new Date().getFullYear()} prevIA</span>
      </footer>
    </div>
  );
}
