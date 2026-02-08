import React from "react";
import { Outlet } from "react-router-dom";

import { useI18n } from "../i18n/useI18n"; // ajuste se o seu hook tiver outro caminho/nome
import { useEntitlements } from "../state/useEntitlements"; // ajuste se seu estado estiver em outro lugar

export function ProductLayout() {
  const { lang, setLang, t } = useI18n();
  const { plan, setPlan, creditsLabel, resetForTesting } = useEntitlements();

  return (
    <div className="product-shell">
      <header className="product-header">
        <div className="product-brand">prevIA</div>

        <div className="product-header-right">
          <div className="product-pill">
            <span className="product-pill-label">{t("nav.language")}</span>
            <select
              className="product-select"
              value={lang}
              onChange={(e) => setLang(e.target.value as any)}
            >
              <option value="pt">PT</option>
              <option value="en">EN</option>
              <option value="es">ES</option>
            </select>
          </div>

          <div className="product-pill">
            <span className="product-pill-label">{t("nav.plan")}</span>
            <select
              className="product-select"
              value={plan}
              onChange={(e) => setPlan(e.target.value as any)}
            >
              <option value="FREE_ANON">Free</option>
              <option value="FREE">Free+</option>
              <option value="BASIC">Basic</option>
              <option value="LIGHT">Light</option>
              <option value="PRO">Pro</option>
            </select>
          </div>

          {/* BOTÃO DEV — remover depois */}
          <button
            className="product-reset-btn"
            onClick={resetForTesting}
            title="Resetar créditos e análises (DEV)"
          >
            Reset
          </button>

          <div className="product-credits">{creditsLabel}</div>
        </div>
      </header>

      <main className="product-main">
        <Outlet />
      </main>

      <footer className="product-footer">
        <span className="product-footer-muted">© {new Date().getFullYear()} prevIA</span>
      </footer>
    </div>
  );
}
