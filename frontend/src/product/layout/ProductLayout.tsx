import React, { useCallback, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom"; 

import { PRODUCT_AUTH_ENABLED, PRODUCT_DEV_AUTO_LOGIN_ENABLED } from "../../config";
import { fetchAccessUsage, postAccessDevReset } from "../api/access";
import {
  clearProductPlanOverride,
  fetchAuthMe,
  normalizeBackendPlanCode,
  postAuthLogout,
  writeProductPlanOverride,
  type AuthMeResponse,
} from "../api/auth";
import { t, type Lang } from "../i18n";
import { PLAN_LABELS, type PlanId } from "../entitlements";
import {
  useProductStore,
  type InternalNarrativeView,
} from "../state/productStore";
import { ProductAuthModal } from "../auth/ProductAuthModal";
import { PlanChangeModal } from "../components/PlanChangeModal";
import BrandLogo from "../../shared/BrandLogo";

import { LanguageDropdown } from "../../shared/LanguageDropdown";

import { AccountPreferencesModal } from "../components/AccountPreferencesModal";
import { resolveAccountPreferences } from "../preferences/accountPreferences";

  type FooterSocialId = "instagram" | "x" | "tiktok";

  type FooterSocialItem = {
    id: FooterSocialId;
    label: string;
    href: string;
    enabled: boolean;
  };

  function FooterSocialIcon({ id }: { id: FooterSocialId }) {
    if (id === "instagram") {
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="product-footer-social-icon"
        >
          <rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
        </svg>
      );
    }

    if (id === "x") {
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="product-footer-social-icon"
        >
          <path
            d="M4.5 4h4.1l4.1 5.7L17.5 4H20l-6.2 7 6.7 9h-4.1l-4.5-6.2L6.6 20H4.1l6.6-7.5L4.5 4z"
            fill="currentColor"
          />
        </svg>
      );
    }

    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="product-footer-social-icon"
      >
        <path
          d="M15.8 3.7c1.2 1.2 2.7 1.9 4.4 2v3.2c-1.5-.1-3-.5-4.4-1.3v5.9c0 4-3.2 7.2-7.2 7.2S1.4 17.5 1.4 13.5s3.2-7.2 7.2-7.2c.3 0 .6 0 .9.1v3.3a4.1 4.1 0 0 0-.9-.1 3.9 3.9 0 1 0 3.9 3.9V2.1h3.3v1.6z"
          fill="currentColor"
        />
      </svg>
    );
  }

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
    social: [
    {
      id: "instagram",
      label: "Instagram",
      href: "https://instagram.com/previa_pt",
      enabled: true,
    },
    {
      id: "x",
      label: "X",
      href: "",
      enabled: false,
    },
    {
      id: "tiktok",
      label: "TikTok",
      href: "",
      enabled: false,
    },
  ] as FooterSocialItem[],
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
    social: [
      {
        id: "instagram",
        label: "Instagram",
        href: "https://instagram.com/previa_en",
        enabled: true,
      },
      {
        id: "x",
        label: "X",
        href: "",
        enabled: false,
      },
      {
        id: "tiktok",
        label: "TikTok",
        href: "",
        enabled: false,
      },
    ] as FooterSocialItem[],
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
    social: [
      {
        id: "instagram",
        label: "Instagram",
        href: "https://instagram.com/previa_en",
        enabled: true,
      },
      {
        id: "x",
        label: "X",
        href: "",
        enabled: false,
      },
      {
        id: "tiktok",
        label: "TikTok",
        href: "",
        enabled: false,
      },
    ] as FooterSocialItem[],
    madeIn: "Hecho en Brasil @prevIA {year}",
  },
} as const;

export type ProductLayoutOutletContext = {
  openAuthModal: (
    mode?: "signup" | "login" | "forgot" | "reset" | "changePassword"
  ) => void;
  logout: () => Promise<void>;
};

const INTERNAL_NARRATIVE_VIEW_OPTIONS: Array<{
  id: InternalNarrativeView;
  label: string;
}> = [
  { id: "AUTO", label: "Auto" },
  { id: "RECREATIONAL", label: "Recreativo" },
  { id: "PROFESSIONAL", label: "Profissional" },
  { id: "CREATOR", label: "Criador / Tipster" },
];

export function ProductLayout() {
  const store = useProductStore();
  const lang = store.state.lang as Lang;
  const footer = PRODUCT_FOOTER_COPY[lang];
  const plan = store.state.plan;
  const [planReason, setPlanReason] = useState<
    "MANUAL" | "NO_CREDITS" | "FEATURE_LOCKED" | "POST_SIGNUP"
  >("MANUAL");

  const internalPlanViewOptions = PLAN_LABELS.filter((item) => item.id !== "FREE_ANON");

  const navigate = useNavigate();

  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<
    "signup" | "login" | "forgot" | "reset" | "changePassword"
  >("signup");
  const [planOpen, setPlanOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

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

  const allowInternalPlanOverride = Boolean(store.accessContext?.allow_plan_override);
  const isInternalMode = Boolean(
    store.accessContext?.product_internal_access || store.accessContext?.is_internal
  );
  const canUseInternalTestingControls = Boolean(
    store.accessContext?.admin_access ||
      store.accessContext?.allow_plan_override ||
      store.accessContext?.product_internal_access ||
      store.accessContext?.is_internal
  );
  const selectedInternalPlan = normalizeBackendPlanCode(plan);
  const internalBillingRuntime = String(store.accessContext?.billing_runtime ?? "live").toUpperCase();
  const selectedInternalNarrativeView = store.internalNarrativeView;

  const isDevAutoLoginSession =
    PRODUCT_DEV_AUTO_LOGIN_ENABLED &&
    (store.bootstrap?.auth_mode === "dev_auto_login" ||
      Boolean(store.accountSnapshot?.email) ||
      Boolean(store.state.auth.email));

  const isAuthenticated =
    Boolean(store.state.auth.is_logged_in) || isDevAutoLoginSession;

  const authBootstrapPending =
    PRODUCT_AUTH_ENABLED && !store.bootstrap.is_ready;

  const isAccountMenuEligiblePlan =
    plan === "FREE" ||
    plan === "BASIC" ||
    plan === "LIGHT" ||
    plan === "PRO";

  const canSeeAccountMenu = isAuthenticated && isAccountMenuEligiblePlan;

  const canShowLogoutAction =
    isAuthenticated && PRODUCT_AUTH_ENABLED && !PRODUCT_DEV_AUTO_LOGIN_ENABLED;

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
      access_context: data.access ?? null,
    });

    if (!data.is_authenticated) {
      clearProductPlanOverride();
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

  async function handleInternalPlanChange(nextPlanRaw: string) {
    const nextPlan = normalizeBackendPlanCode(nextPlanRaw);
    const subscriptionPlan = normalizeBackendPlanCode(
      store.accountSnapshot?.subscription?.plan_code ?? store.state.plan
    );

    store.clearBackendUsage();
    store.setPlan(nextPlan);

    if (nextPlan === subscriptionPlan) {
      clearProductPlanOverride();
    } else {
      writeProductPlanOverride(nextPlan);
    }

    if (!PRODUCT_AUTH_ENABLED || !isAuthenticated) {
      return;
    }

    try {
      const data = await fetchAuthMe();
      await syncSessionFromAuthPayload(data);
    } catch (err) {
      console.error("internal plan override sync failed", err);
    }
  }

  async function handleTestingReset(onAfterReset?: () => void) {
    store.resetForTesting();
    onAfterReset?.();

    if (!PRODUCT_AUTH_ENABLED || !isAuthenticated || !canUseInternalTestingControls) {
      return;
    }

    try {
      await postAccessDevReset();

      const data = await fetchAuthMe();
      await syncSessionFromAuthPayload(data);
    } catch (err) {
      console.error("product testing reset sync failed", err);
    }
  }

  async function handleLogout() {
    try {
      store.promoteCurrentSessionToDeviceAnonShadow();
      clearProductPlanOverride();
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
        access_context: null,
      });

      setAuthOpen(false);
      setPlanOpen(false);
      setPreferencesOpen(false);
      setIsAccountMenuOpen(false);
      setIsMobileHeaderMenuOpen(false);

      navigate(`/${lang}`, { replace: true });
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

  const renderHeaderActions = (onAfterClick?: () => void) => {
    if (authBootstrapPending) {
      return null;
    }
    if (!isAuthenticated) {
      if (!PRODUCT_AUTH_ENABLED || PRODUCT_DEV_AUTO_LOGIN_ENABLED) {
        return null;
      }

      return (
        <div className="product-auth-cta-group">
          <button
            type="button"
            className="product-auth-login-btn"
            onClick={() => {
              onAfterClick?.();
              openAuthModal("login");
            }}
          >
            {t(lang, "auth.login")}
          </button>

          <button
            type="button"
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
        </div>
      );
    }

    if (isInternalMode || plan === "PRO") return null;

    return (
      <button
        type="button"
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
      {t(lang, "auth.accountSettings")}
    </Link>

    {canShowLogoutAction ? (
      <button
        type="button"
        role="menuitem"
        className="product-account-menu-item"
        onClick={() => {
          void handleLogout();
        }}
      >
        {t(lang, "auth.logout")}
      </button>
    ) : null}
  </div>
) : null;

const mobileHeaderMenuContent = (
  <>
    {allowInternalPlanOverride ? (
      <div className="product-pill">
        <span className="product-pill-label">PLAN VIEW</span>
        <select
          className="product-select"
          value={selectedInternalPlan}
          onChange={(e) => {
            void handleInternalPlanChange(e.target.value);
          }}
        >
          {internalPlanViewOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    ) : null}

    {canUseInternalTestingControls ? (
      <div className="product-pill">
        <span className="product-pill-label">NARRATIVE VIEW</span>
        <select
          className="product-select"
          value={selectedInternalNarrativeView}
          onChange={(e) => {
            store.setInternalNarrativeView(
              e.target.value as InternalNarrativeView
            );
          }}
        >
          {INTERNAL_NARRATIVE_VIEW_OPTIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    ) : null}

    {canUseInternalTestingControls ? (
      <button
        className="product-reset-btn"
        onClick={() => {
          void handleTestingReset(() => setIsMobileHeaderMenuOpen(false));
        }}
        title={t(lang, "common.devResetTitle")}
      >
        {t(lang, "common.devReset")}
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

    {renderHeaderActions(() => setIsMobileHeaderMenuOpen(false))}
  </>
);


  return (
    <div className="product-shell">

      {isInternalMode ? (
        <div className="product-internal-banner" role="status">
          <div className="product-internal-banner-text">
            <strong>INTERNAL MODE</strong>
            <span> Billing runtime: {internalBillingRuntime}</span>
          </div>

          {allowInternalPlanOverride || canUseInternalTestingControls ? (
            <div className="product-internal-banner-controls">
              {allowInternalPlanOverride ? (
                <>
                  <span className="product-pill-label">PLAN VIEW</span>
                  <select
                    className="product-select"
                    value={selectedInternalPlan}
                    onChange={(e) => {
                      void handleInternalPlanChange(e.target.value);
                    }}
                  >
                    {internalPlanViewOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}

              {canUseInternalTestingControls ? (
                <>
                  <span className="product-pill-label">NARRATIVE VIEW</span>
                  <select
                    className="product-select"
                    value={selectedInternalNarrativeView}
                    onChange={(e) => {
                      store.setInternalNarrativeView(
                        e.target.value as InternalNarrativeView
                      );
                    }}
                  >
                    {INTERNAL_NARRATIVE_VIEW_OPTIONS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}

              {canUseInternalTestingControls ? (
                <button
                  className="product-reset-btn"
                  onClick={() => {
                    void handleTestingReset();
                  }}
                  title={t(lang, "common.devResetTitle")}
                >
                  {t(lang, "common.devReset")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <header className={`product-header ${isMobileHeaderMenuOpen ? "is-mobile-menu-open" : ""}`}>
        <div className="product-header-bar">
          <Link to="/" className="product-brand product-brand-link" aria-label="Ir para a página principal">
            <BrandLogo />
          </Link>

          <div className="product-header-right product-header-right-desktop">
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
              {renderHeaderActions()}
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
                {footer.social
                  .filter((item) => item.enabled)
                  .map((item) => (
                    <a
                      key={item.id}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="product-footer-social-link"
                      aria-label={item.label}
                      title={item.label}
                    >
                      <FooterSocialIcon id={item.id} />
                      <span>{item.label}</span>
                    </a>
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

          const shouldOpenPostSignupOffer =
            authInitialMode === "signup" && Boolean(payload.is_authenticated);

          if (shouldOpenPostSignupOffer) {
            const currentPreferences = resolveAccountPreferences(store.state.preferences);

            if (!currentPreferences.completed_onboarding) {
              setPreferencesOpen(true);
              return;
            }

            setPlanReason("POST_SIGNUP");
            setPlanOpen(true);
          }
        }}
      />

      <AccountPreferencesModal
        open={preferencesOpen}
        lang={lang}
        initialBettorProfile={resolveAccountPreferences(store.state.preferences).bettor_profile}
        kicker={
          lang === "pt"
            ? "Primeiros ajustes"
            : lang === "es"
            ? "Primeros ajustes"
            : "First setup"
        }
        title={
          lang === "pt"
            ? "Como você costuma apostar?"
            : lang === "es"
            ? "¿Cómo sueles apostar?"
            : "How do you usually bet?"
        }
        subtitle={
          lang === "pt"
            ? "Isso ajuda a ajustar a forma como o produto fala com você logo no começo."
            : lang === "es"
            ? "Esto ayuda a ajustar la forma en que el producto te habla desde el inicio."
            : "This helps tailor how the product speaks to you from the start."
        }
        confirmLabel={
          lang === "pt"
            ? "Continuar"
            : lang === "es"
            ? "Continuar"
            : "Continue"
        }
        secondaryLabel={
          lang === "pt"
            ? "Agora não"
            : lang === "es"
            ? "Ahora no"
            : "Not now"
        }
        onClose={() => {
          store.applyAccountPreferencesUpdate({ completed_onboarding: true });
          setPreferencesOpen(false);
          setPlanReason("POST_SIGNUP");
          setPlanOpen(true);
        }}
        onSave={(payload) => {
          store.applyAccountPreferencesUpdate({
            ...payload,
            completed_onboarding: true,
          });
          setPreferencesOpen(false);
          setPlanReason("POST_SIGNUP");
          setPlanOpen(true);
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