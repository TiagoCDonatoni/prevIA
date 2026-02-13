import React from "react";
import { Outlet } from "react-router-dom";

import { LANGS, t, type Lang } from "../i18n";
import { PLAN_LABELS, type PlanId } from "../entitlements";
import { useProductStore } from "../state/productStore";

export function ProductLayout() {
  const store = useProductStore();
  const lang = store.state.lang as Lang;
  const plan = store.state.plan;

  const remaining = store.entitlements.credits.remaining_today;
  const limit = store.entitlements.credits.daily_limit;

  return (
    <div className="product-shell">
      <header className="product-header">
        <div className="product-brand">{t(lang, "common.appName")}</div>

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
            onClick={() => {
              Object.keys(localStorage)
                .filter((k) => k.toLowerCase().includes("previa"))
                .forEach((k) => localStorage.removeItem(k));
              window.location.reload();
            }}
            title={t(lang, "common.devResetTitle")}
          >
            {t(lang, "common.devReset")}
          </button>

          <div className="pl-credits-wrap">
            <div className="pl-credits">
              {t(lang, "credits.counter", { remaining, limit })}
            </div>

            {(() => {
              const plan = store.state.plan;
              const isLoggedIn = !!store.state.auth?.is_logged_in;

              // Pro: não mostra CTA
              if (plan === "PRO") return null;

              // Free anon: criar conta grátis
              if (!isLoggedIn) {
                return (
                  <button
                    className="pl-credits-cta"
                    onClick={() => {
                      // você já deve ter algum state/modal de auth no layout
                      setAuthOpen(true);
                    }}
                  >
                    {t(lang, "auth.createFreeAccount")}
                  </button>
                );
              }

              // Free+ / Basic / Light: upgrade
              return (
                <button
                  className="pl-credits-cta"
                  onClick={() => {
                    setUpgradeOpen(true);
                  }}
                >
                  {t(lang, "credits.moreCredits")}
                </button>
              );
            })()}
          </div>

        </div>
      </header>

      <main className="product-main">
        <Outlet key={store.resetNonce} />
      </main>

      <footer className="product-footer">
        <span className="product-footer-muted">
          © {new Date().getFullYear()} {t(lang, "common.appName")}
        </span>
      </footer>
    </div>
  );
}
