import React, { useCallback, useState } from "react";
import { Link, Outlet } from "react-router-dom";

import { IS_DEV, PRODUCT_AUTH_ENABLED, PRODUCT_DEV_AUTO_LOGIN_ENABLED } from "../../config";
import { fetchAccessUsage } from "../api/access";
import {
  normalizeBackendPlanCode,
  postAuthLogout,
  type AuthMeResponse,
} from "../api/auth";
import { t, type Lang } from "../i18n";
import { PLAN_LABELS, type PlanId } from "../entitlements";
import { useProductStore } from "../state/productStore";
import { ProductAuthModal } from "../auth/ProductAuthModal";
import { PlanChangeModal } from "../components/PlanChangeModal";
import BrandLogo from "../../shared/BrandLogo";

import { LanguageDropdown } from "../../shared/LanguageDropdown";

 const PRODUCT_FOOTER_COPY = {
  pt: {
    body:
      "Camada aplicada do prevIA para leitura prática, contexto analítico e aprofundamento progressivo.",
    navigationTitle: "Navegação",
    socialTitle: "Redes sociais",
    links: {
      home: "Home",
      howItWorks: "Como funciona",
      glossary: "Glossário",
      about: "Sobre",
      contact: "Contato",
    },
    social: ["X · @prevIA", "Instagram · @prevIA", "TikTok · @prevIA"],
    madeIn: "Feito no Brasil @prevIA {year}",
  },
  en: {
    body:
      "Applied prevIA layer for practical reading, analytical context, and progressive depth.",
    navigationTitle: "Navigation",
    socialTitle: "Social",
    links: {
      home: "Home",
      howItWorks: "How it works",
      glossary: "Glossary",
      about: "About",
      contact: "Contact",
    },
    social: ["X · @prevIA", "Instagram · @prevIA", "TikTok · @prevIA"],
    madeIn: "Built in Brazil @prevIA {year}",
  },
  es: {
    body:
      "Capa aplicada de prevIA para lectura práctica, contexto analítico y profundidad progresiva.",
    navigationTitle: "Navegación",
    socialTitle: "Redes sociales",
    links: {
      home: "Home",
      howItWorks: "Cómo funciona",
      glossary: "Glosario",
      about: "Sobre",
      contact: "Contacto",
    },
    social: ["X · @prevIA", "Instagram · @prevIA", "TikTok · @prevIA"],
    madeIn: "Hecho en Brasil @prevIA {year}",
  },
} as const;

export type ProductLayoutOutletContext = {
  openAuthModal: (
    mode?: "signup" | "login" | "forgot" | "reset" | "changePassword"
  ) => void;
  logout: () => Promise<void>;
};

export function ProductLayout() {
  const store = useProductStore();
  const lang = store.state.lang as Lang;
  const footer = PRODUCT_FOOTER_COPY[lang];
  const plan = store.state.plan;
  const DEV = IS_DEV;

  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<
    "signup" | "login" | "forgot" | "reset" | "changePassword"
  >("signup");
  const [planOpen, setPlanOpen] = useState(false);

const [isMobileHeaderMenuOpen, setIsMobileHeaderMenuOpen] = useState(false);

const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

const desktopAccountMenuRef = React.useRef<HTMLDivElement | null>(null);
const mobileAccountMenuRef = React.useRef<HTMLDivElement | null>(null);

React.useEffect(() => {
  if (!isMobileHeaderMenuOpen) return;

  const previousOverflow = document.body.style.overflow;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setIsMobileHeaderMenuOpen(false);
    }
  };

  document.body.style.overflow = "hidden";
  window.addEventListener("keydown", onKeyDown);

  return () => {
    document.body.style.overflow = previousOverflow;
    window.removeEventListener("keydown", onKeyDown);
  };
}, [isMobileHeaderMenuOpen]);

React.useEffect(() => {
  if (!isAccountMenuOpen) return;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setIsAccountMenuOpen(false);
    }
  };

  const onMouseDown = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;

    const clickedDesktopMenu =
      desktopAccountMenuRef.current?.contains(target) ?? false;

    const clickedMobileMenu =
      mobileAccountMenuRef.current?.contains(target) ?? false;

    if (!clickedDesktopMenu && !clickedMobileMenu) {
      setIsAccountMenuOpen(false);
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("mousedown", onMouseDown);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("mousedown", onMouseDown);
  };
}, [isAccountMenuOpen]);

React.useEffect(() => {
  const onResize = () => {
    if (window.innerWidth > 760) {
      setIsMobileHeaderMenuOpen(false);
    }

    setIsAccountMenuOpen(false);
  };

  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}, []);

  const [planReason, setPlanReason] = useState<"MANUAL" | "NO_CREDITS" | "FEATURE_LOCKED">(
    "MANUAL"
  );

  const allowDevPlanOverride = DEV && PRODUCT_DEV_AUTO_LOGIN_ENABLED;

  const isDevAutoLoginSession =
    PRODUCT_DEV_AUTO_LOGIN_ENABLED &&
    (store.bootstrap?.auth_mode === "dev_auto_login" ||
      Boolean(store.accountSnapshot?.email) ||
      Boolean(store.state.auth.email));

  const isAuthenticated =
    Boolean(store.state.auth.is_logged_in) || isDevAutoLoginSession;

  // TODO: migrar esta regra para dev/staff quando existir nível oficial de usuário.
  const canSeeAccountMenu = allowDevPlanOverride;

  const accountMenuEmail =
    store.accountSnapshot?.email?.trim() ||
    store.state.auth.email?.trim() ||
    "dev@previa.local";

  const accountMenuInitial = (accountMenuEmail.charAt(0) || "D").toUpperCase();

  const accountMenuTriggerLabel =
    lang === "pt"
      ? "Abrir menu da conta"
      : lang === "es"
        ? "Abrir menú de cuenta"
        : "Open account menu";

  const remaining = store.backendUsage.is_ready
    ? store.backendUsage.remaining ?? store.entitlements.credits.remaining_today
    : store.entitlements.credits.remaining_today;

  const limit = store.backendUsage.is_ready
    ? store.backendUsage.daily_limit ?? store.entitlements.credits.daily_limit
    : store.entitlements.credits.daily_limit;

  async function syncSessionFromAuthPayload(data: AuthMeResponse) {
    store.applyBackendBootstrap({
      is_authenticated: Boolean(data.is_authenticated),
      email: data.user?.email ?? null,
      plan: normalizeBackendPlanCode(data.subscription?.plan_code),
      auth_mode: data.auth_mode ?? null,
      user_id: data.user?.user_id ?? null,
      full_name: data.user?.full_name ?? null,
      preferred_lang: data.user?.preferred_lang ?? null,
      user_status: data.user?.status ?? null,
      email_verified: data.user?.email_verified ?? null,
      subscription_plan_code: data.subscription?.plan_code ?? null,
      subscription_status: data.subscription?.status ?? null,
      subscription_provider: data.subscription?.provider ?? null,
      subscription_billing_cycle: data.subscription?.billing_cycle ?? null,
    });

    if (!data.is_authenticated) {
      return;
    }

    try {
      const usage = await fetchAccessUsage();

      store.applyBackendUsage({
        date_key: usage.date_key,
        credits_used: usage.usage.credits_used,
        revealed_count: usage.usage.revealed_count,
        daily_limit: usage.usage.daily_limit,
        remaining: usage.usage.remaining,
        revealed_fixture_keys: usage.usage.revealed_fixture_keys,
      });
    } catch (err) {
      console.error("product auth usage sync failed", err);
    }
  }

  async function handleLogout() {
    try {
      store.promoteCurrentSessionToDeviceAnonShadow();
      await postAuthLogout();

      store.applyBackendBootstrap({
        is_authenticated: false,
        email: null,
        plan: "FREE",
        auth_mode: "anonymous",
        user_id: null,
        full_name: null,
        preferred_lang: null,
        user_status: null,
        email_verified: null,
        subscription_plan_code: null,
        subscription_status: null,
        subscription_provider: null,
        subscription_billing_cycle: null,
      });

      setAuthOpen(false);
      setPlanOpen(false);
    } catch (err) {
      console.error("product logout failed", err);
    }
  }

  const openAuthModal = useCallback(
    (
      mode: "signup" | "login" | "forgot" | "reset" | "changePassword" = "signup"
    ) => {
      setAuthInitialMode(mode);
      setAuthOpen(true);
    },
    []
  );



const mobileMenuLabel =
  lang === "pt" ? "Abrir menu" : lang === "es" ? "Abrir menú" : "Open menu";

const creditsBadge = (
  <div className="pl-credits">{t(lang, "credits.counter", { remaining, limit })}</div>
);

const renderCreditsCta = (onAfterClick?: () => void) => {
  const currentPlan = store.state.plan;

  if (currentPlan === "PRO") return null;

  if (currentPlan === "FREE_ANON") {
    if (!PRODUCT_AUTH_ENABLED || PRODUCT_DEV_AUTO_LOGIN_ENABLED) {
      return null;
    }

    return (
      <button
        className="pl-credits-cta"
        onClick={() => {
          onAfterClick?.();
          openAuthModal("signup");
        }}
      >
        {(() => {
          const label = t(lang, "auth.createFreeAccount");
          return label === "auth.createFreeAccount" ? t(lang, "auth.signup") : label;
        })()}
      </button>
    );
  }

  return (
    <button
      className="pl-credits-cta"
      onClick={() => {
        onAfterClick?.();
        setPlanReason("MANUAL");
        setPlanOpen(true);
      }}
    >
      {t(lang, "credits.moreCredits")}
    </button>
  );
};

const accountMenuDropdown = isAccountMenuOpen ? (
  <div
    className="product-account-menu-dropdown"
    role="menu"
    aria-label={t(lang, "auth.account")}
  >
    <Link
      to="account"
      role="menuitem"
      className="product-account-menu-item"
      onClick={() => {
        setIsAccountMenuOpen(false);
        setIsMobileHeaderMenuOpen(false);
      }}
    >
      {t(lang, "auth.account")}
    </Link>
  </div>
) : null;

const mobileHeaderMenuContent = (
  <>
    {allowDevPlanOverride ? (
      <div className="product-pill">
        <span className="product-pill-label">DEV PLAN</span>
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
          setIsMobileHeaderMenuOpen(false);
        }}
        title={t(lang, "common.devResetTitle")}
      >
        {t(lang, "common.devReset")}
      </button>
    ) : null}

    {isAuthenticated && PRODUCT_AUTH_ENABLED && !PRODUCT_DEV_AUTO_LOGIN_ENABLED ? (
      <button
        type="button"
        className="product-reset-btn"
        onClick={() => {
          setIsMobileHeaderMenuOpen(false);
          void handleLogout();
        }}
      >
        {t(lang, "auth.logout")}
      </button>
    ) : null}

    <div className="product-pill product-pill-lang">
      <LanguageDropdown
        value={lang}
        onChange={(v) => store.setLang(v)}
        ariaLabel={t(lang, "nav.language")}
        menuAlign="right"
      />
    </div>

    {renderCreditsCta(() => setIsMobileHeaderMenuOpen(false))}
  </>
);


  return (
    <div className="product-shell">

      <header className={`product-header ${isMobileHeaderMenuOpen ? "is-mobile-menu-open" : ""}`}>
        <div className="product-header-bar">
          <Link to="/" className="product-brand product-brand-link" aria-label="Ir para a página principal">
            <BrandLogo />
          </Link>

          <div className="product-header-right product-header-right-desktop">
            {allowDevPlanOverride ? (
              <div className="product-pill">
                <span className="product-pill-label">DEV PLAN</span>
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

            {isAuthenticated && PRODUCT_AUTH_ENABLED && !PRODUCT_DEV_AUTO_LOGIN_ENABLED ? (
              <button
                type="button"
                className="product-reset-btn"
                onClick={() => {
                  void handleLogout();
                }}
              >
                {t(lang, "auth.logout")}
              </button>
            ) : null}

            <div className="product-pill product-pill-lang">
              <LanguageDropdown
                value={lang}
                onChange={(v) => store.setLang(v)}
                ariaLabel={t(lang, "nav.language")}
                menuAlign="right"
              />
            </div>

            <div className="pl-credits-wrap">
              {creditsBadge}
              {renderCreditsCta()}
            </div>

            {canSeeAccountMenu ? (
              <div className="product-account-menu" ref={desktopAccountMenuRef}>
                <button
                  type="button"
                  className="product-account-avatar-btn"
                  aria-label={accountMenuTriggerLabel}
                  aria-haspopup="menu"
                  aria-expanded={isAccountMenuOpen}
                  onClick={() => {
                    setIsAccountMenuOpen((prev) => !prev);
                  }}
                >
                  <span className="product-account-avatar">{accountMenuInitial}</span>
                </button>

                {accountMenuDropdown}
              </div>
            ) : null}
          </div>

          <div className="product-header-right product-header-right-mobile">
            {creditsBadge}

            <button
              type="button"
              className="product-mobile-menu-btn"
              aria-label={mobileMenuLabel}
              aria-expanded={isMobileHeaderMenuOpen}
              onClick={() => {
                setIsAccountMenuOpen(false);
                setIsMobileHeaderMenuOpen((prev) => !prev);
              }}
            >
              <span />
              <span />
              <span />
            </button>

            {canSeeAccountMenu ? (
              <div className="product-account-menu" ref={mobileAccountMenuRef}>
                <button
                  type="button"
                  className="product-account-avatar-btn"
                  aria-label={accountMenuTriggerLabel}
                  aria-haspopup="menu"
                  aria-expanded={isAccountMenuOpen}
                  onClick={() => {
                    setIsMobileHeaderMenuOpen(false);
                    setIsAccountMenuOpen((prev) => !prev);
                  }}
                >
                  <span className="product-account-avatar">{accountMenuInitial}</span>
                </button>

                {accountMenuDropdown}
              </div>
            ) : null}
          </div>
        </div>

        {isMobileHeaderMenuOpen ? (
          <>
            <button
              type="button"
              className="product-mobile-menu-backdrop"
              aria-label="Fechar menu"
              onClick={() => setIsMobileHeaderMenuOpen(false)}
            />

            <div className="product-mobile-menu" role="dialog" aria-modal="true">
              <div className="product-mobile-menu-body">{mobileHeaderMenuContent}</div>
            </div>
          </>
        ) : null}
      </header>


      <main className="product-main">
        <Outlet
          key={store.resetNonce}
          context={{
            openAuthModal,
            logout: handleLogout,
          } satisfies ProductLayoutOutletContext}
        />
      </main>

      <footer className="product-footer">
        <div className="product-footer-inner">
          <div className="product-footer-grid">
            <div className="product-footer-brandblock">
              <Link to="/" className="product-footer-brandlink" aria-label="prevIA home">
                <BrandLogo compact />
              </Link>

              <p className="product-footer-body">{footer.body}</p>
            </div>

            <div className="product-footer-col">
              <div className="product-footer-title">{footer.navigationTitle}</div>

              <div className="product-footer-links">
                <Link to={`/${lang}`} className="product-footer-link">
                  {footer.links.home}
                </Link>

                <Link to={`/${lang}/how-it-works`} className="product-footer-link">
                  {footer.links.howItWorks}
                </Link>

                <Link to={`/${lang}/glossary`} className="product-footer-link">
                  {footer.links.glossary}
                </Link>

                <Link to={`/${lang}/about`} className="product-footer-link">
                  {footer.links.about}
                </Link>

                <Link to={`/${lang}/contact`} className="product-footer-link">
                  {footer.links.contact}
                </Link>
              </div>
            </div>

            <div className="product-footer-col">
              <div className="product-footer-title">{footer.socialTitle}</div>

              <div className="product-footer-socials">
                {footer.social.map((item) => (
                  <span key={item} className="product-footer-social-pill">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="product-footer-bottom">
            <span className="product-footer-muted">
              {footer.madeIn.replace("{year}", String(new Date().getFullYear()))}
            </span>
          </div>
        </div>
      </footer>

      <ProductAuthModal
        open={authOpen}
        lang={lang}
        initialMode={authInitialMode}
        onClose={() => setAuthOpen(false)}
        onAuthSuccess={async (payload) => {
          await syncSessionFromAuthPayload(payload);
          setAuthOpen(false);
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