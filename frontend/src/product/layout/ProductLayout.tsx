import React, { useState } from "react";
import { Outlet } from "react-router-dom";

import { IS_DEV, PRODUCT_AUTH_ENABLED, PRODUCT_DEV_AUTO_LOGIN_ENABLED } from "../../config";
import { LANGS, t, type Lang } from "../i18n";
import { PLAN_LABELS, type PlanId } from "../entitlements";
import { useProductStore } from "../state/productStore";
import { ProductAuthModal } from "../auth/ProductAuthModal";
import { PlanChangeModal } from "../components/PlanChangeModal";
import BrandLogo from "../components/BrandLogo";

import brFlag from "../assets/br.svg";
import gbFlag from "../assets/gb.svg";
import esFlag from "../assets/es.svg";

function langLabel(l: Lang) {
  if (l === "pt") return { src: brFlag, code: "PT", name: "Português" };
  if (l === "en") return { src: gbFlag, code: "EN", name: "English" };
  return { src: esFlag, code: "ES", name: "Español" };
}

function LangDropdown({
  value,
  onChange,
}: {
  value: Lang;
  onChange: (v: Lang) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const cur = langLabel(value);

  return (
    <div className="lang-dd" onBlur={() => setOpen(false)} tabIndex={-1}>
      <button
        type="button"
        className="lang-dd-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <img
            src={cur.src}
            alt=""
            className="lang-flag-img"
            aria-hidden="true"
          />
        <span className="lang-code">{cur.code}</span>
        <span className="lang-caret" aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div className="lang-dd-menu" role="menu">
          {(["pt", "en", "es"] as Lang[]).map((l) => {
            const it = langLabel(l);
            const active = l === value;
            return (
              <button
                key={l}
                type="button"
                className={`lang-dd-item ${active ? "is-active" : ""}`}
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()} // evita blur antes do click
                onClick={() => {
                  onChange(l);
                  setOpen(false);
                }}
              >
                <img
                  src={it.src}
                  alt=""
                  className="lang-flag-img"
                  aria-hidden="true"
                />
                <span className="lang-code">{it.code}</span>
                <span className="lang-name">{it.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ProductLayout() {
  const store = useProductStore();
  const lang = store.state.lang as Lang;
  const plan = store.state.plan;
  const DEV = IS_DEV;

  const [authOpen, setAuthOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planReason, setPlanReason] = useState<"MANUAL" | "NO_CREDITS" | "FEATURE_LOCKED">("MANUAL");

  const remaining = store.backendUsage.is_ready
    ? (store.backendUsage.remaining ?? store.entitlements.credits.remaining_today)
    : store.entitlements.credits.remaining_today;

  const limit = store.backendUsage.is_ready
    ? (store.backendUsage.daily_limit ?? store.entitlements.credits.daily_limit)
    : store.entitlements.credits.daily_limit;

  return (
    <div className="product-shell">
      <header className="product-header">
        <div className="product-brand">
          <BrandLogo />
        </div>

        <div className="product-header-right">

          {DEV ? (
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
          ) : null}

          {DEV ? (
            <button
              className="product-reset-btn"
              onClick={() => {
                store.resetForTesting();
              }}
              title={t(lang, "common.devResetTitle")}
            >
              {t(lang, "common.devReset")}
            </button>
          ) : null}

          {DEV && PRODUCT_DEV_AUTO_LOGIN_ENABLED ? (
            <div className="product-pill" title="Sessão dev automática ativa">
              <span className="product-pill-label">DEV AUTH</span>
              <span>{store.state.auth.email ?? "dev@previa.local"}</span>
            </div>
          ) : null}

          <div className="product-pill product-pill-lang">
            <LangDropdown value={lang} onChange={(v) => store.setLang(v)} />
          </div>

          <div className="pl-credits-wrap">
            <div className="pl-credits">
              {t(lang, "credits.counter", { remaining, limit })}
            </div>

            {(() => {
              const plan = store.state.plan;

              // Pro: não mostra CTA
              if (plan === "PRO") return null;

              // Free anon: criar conta grátis
              if (plan === "FREE_ANON") {
                if (!PRODUCT_AUTH_ENABLED || PRODUCT_DEV_AUTO_LOGIN_ENABLED) {
                  return null;
                }

                return (
                  <button
                    className="pl-credits-cta"
                    onClick={() => {
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
                    setPlanReason("MANUAL");
                      setPlanOpen(true);
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

      <ProductAuthModal
        open={authOpen}
        lang={lang}
        initialMode="signup"
        onClose={() => setAuthOpen(false)}
        onAuthSuccess={() => {
          setAuthOpen(false);
          window.location.reload();
        }}
      />

      <PlanChangeModal
        open={planOpen}
        reason={planReason}
        onClose={() => setPlanOpen(false)}
      />

    </div>
  );
}
