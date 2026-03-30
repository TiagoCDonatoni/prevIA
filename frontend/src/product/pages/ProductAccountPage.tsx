import React from "react";
import { Link, useOutletContext } from "react-router-dom";

import { t, type Lang } from "../i18n";
import { patchAuthProfile } from "../api/auth";
import { PLAN_CATALOG } from "../planCatalog";
import { PLAN_LABELS } from "../entitlements";
import { useProductStore } from "../state/productStore";
import type { ProductLayoutOutletContext } from "../layout/ProductLayout";

function formatMoney(lang: Lang, amount: number | null, currency: "BRL" | "USD" | "EUR") {
  if (amount == null) return null;

  try {
    return new Intl.NumberFormat(
      lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US",
      {
        style: "currency",
        currency,
      }
    ).format(amount);
  } catch {
    return `${amount}`;
  }
}

function mapPlanLabel(plan: string) {
  return PLAN_LABELS.find((item) => item.id === plan)?.label ?? plan;
}

function mapLanguageLabel(uiLang: Lang, raw: string | null | undefined) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "pt") return t(uiLang, "auth.languagePortuguese");
  if (value === "en") return t(uiLang, "auth.languageEnglish");
  if (value === "es") return t(uiLang, "auth.languageSpanish");
  return "—";
}

function mapAccountStatusLabel(uiLang: Lang, raw: string | null | undefined, isAuthenticated: boolean) {
  if (!isAuthenticated) return t(uiLang, "auth.sessionAnonymous");

  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "active") return t(uiLang, "auth.accountStateActive");
  if (value === "inactive") return t(uiLang, "auth.accountStateInactive");
  if (value === "blocked") return t(uiLang, "auth.accountStateBlocked");
  if (value === "deleted") return t(uiLang, "auth.accountStateDeleted");

  return raw || "—";
}

function mapVerificationLabel(uiLang: Lang, value: boolean | null) {
  if (value === true) return t(uiLang, "auth.emailVerifiedYes");
  if (value === false) return t(uiLang, "auth.emailVerifiedNo");
  return "—";
}

function mapSubscriptionStatusLabel(uiLang: Lang, raw: string | null | undefined) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "active") return t(uiLang, "auth.subscriptionStatusActive");
  if (value === "inactive") return t(uiLang, "auth.subscriptionStatusInactive");
  if (value === "past_due") return t(uiLang, "auth.subscriptionStatusPastDue");
  if (value === "canceled") return t(uiLang, "auth.subscriptionStatusCanceled");
  if (!value) return "—";
  return raw || "—";
}

function mapProviderLabel(uiLang: Lang, raw: string | null | undefined) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return t(uiLang, "auth.notAvailableYet");
  if (value === "manual") return t(uiLang, "auth.subscriptionProviderManual");
  return raw || "—";
}

function mapBillingCycleLabel(
  uiLang: Lang,
  raw: "monthly" | "quarterly" | "semiannual" | "annual" | null | undefined
) {
  if (raw === "monthly") return t(uiLang, "auth.billingCycleMonthly");
  if (raw === "quarterly") return t(uiLang, "auth.billingCycleQuarterly");
  if (raw === "semiannual") return t(uiLang, "auth.billingCycleSemiannual");
  if (raw === "annual") return t(uiLang, "auth.billingCycleAnnual");
  return t(uiLang, "auth.notAvailableYet");
}

function normalizeEditableLang(raw: string | null | undefined, fallback: Lang): Lang {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "pt" || value === "en" || value === "es") return value;
  return fallback;
}

export default function ProductAccountPage() {
  const store = useProductStore();
  const { openAuthModal, logout } = useOutletContext<ProductLayoutOutletContext>();

  const lang = store.state.lang as Lang;
  const isAuthenticated = Boolean(store.state.auth.is_logged_in);
  const account = store.accountSnapshot;

  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [profileName, setProfileName] = React.useState(account.full_name ?? "");
  const [profileLang, setProfileLang] = React.useState<Lang>(
    normalizeEditableLang(account.preferred_lang, lang)
  );
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const snapshotPlan = account.subscription.plan_code;
  const plan =
    snapshotPlan === "FREE_ANON" ||
    snapshotPlan === "FREE" ||
    snapshotPlan === "BASIC" ||
    snapshotPlan === "LIGHT" ||
    snapshotPlan === "PRO"
      ? snapshotPlan
      : store.state.plan;
  const planCatalog = PLAN_CATALOG[plan];

  const dailyLimit = store.backendUsage.is_ready
    ? (store.backendUsage.daily_limit ?? store.entitlements.credits.daily_limit)
    : store.entitlements.credits.daily_limit;

  const remaining = store.backendUsage.is_ready
    ? (store.backendUsage.remaining ?? store.entitlements.credits.remaining_today)
    : store.entitlements.credits.remaining_today;

  const usedToday = Math.max(0, Number(dailyLimit ?? 0) - Number(remaining ?? 0));
  const revealedToday = store.backendUsage.is_ready
    ? store.backendUsage.revealed_count
    : Object.keys(store.state.credits.revealed_today ?? {}).length;

  const monthlyPrice = formatMoney(lang, planCatalog.priceMonthly, planCatalog.currency);
  const displayName = account.full_name?.trim() || "—";
  const displayEmail = account.email ?? store.state.auth.email ?? "—";
  const displayPreferredLang = mapLanguageLabel(
    lang,
    account.preferred_lang ?? store.state.lang
  );
  const displayAccountStatus = mapAccountStatusLabel(
    lang,
    account.status,
    isAuthenticated
  );
  const displayEmailVerified = mapVerificationLabel(lang, account.email_verified);
  const displayPlanLabel = mapPlanLabel(plan);
  const displaySubscriptionStatus = mapSubscriptionStatusLabel(
    lang,
    account.subscription.status
  );
  const displaySubscriptionProvider = mapProviderLabel(
    lang,
    account.subscription.provider
  );
  const displayBillingCycle = mapBillingCycleLabel(
    lang,
    account.subscription.billing_cycle
  );

  React.useEffect(() => {
    setProfileName(account.full_name ?? "");
    setProfileLang(normalizeEditableLang(account.preferred_lang, store.state.lang as Lang));
  }, [account.full_name, account.preferred_lang, store.state.lang]);

  async function handleSaveProfile() {
    const nextName = profileName.trim();

    if (nextName.length < 2) {
      setProfileError(t(lang, "auth.profileNameValidation"));
      return;
    }

    try {
      setProfileError(null);
      setIsSavingProfile(true);

      const result = await patchAuthProfile({
        full_name: nextName,
        preferred_lang: profileLang,
      });

      store.applyProfileUpdate({
        full_name: result.user.full_name ?? nextName,
        preferred_lang: normalizeEditableLang(result.user.preferred_lang, profileLang),
      });

      setIsEditingProfile(false);
    } catch (error) {
      console.error("handleSaveProfile failed", error);
      setProfileError(t(lang, "auth.profileSaveError"));
    } finally {
      setIsSavingProfile(false);
    }
  }
  
  return (
    <section className="account-page">
      <div className="account-hero">
        <div>
          <div className="account-kicker">{t(lang, "auth.accountSettings")}</div>
          <h1 className="account-title">{t(lang, "auth.accountPageTitle")}</h1>
          <p className="account-subtitle">{t(lang, "auth.accountPageSubtitle")}</p>
        </div>

        <div className="account-hero-actions">
          <Link to="/" className="product-secondary">
            {t(lang, "auth.backToApp")}
          </Link>

          {!isAuthenticated ? (
            <>
              <button
                type="button"
                className="product-secondary"
                onClick={() => openAuthModal("login")}
              >
                {t(lang, "auth.login")}
              </button>
              <button
                type="button"
                className="product-primary"
                onClick={() => openAuthModal("signup")}
              >
                {t(lang, "auth.signup")}
              </button>
            </>
          ) : (
            <button type="button" className="product-primary" onClick={() => void logout()}>
              {t(lang, "auth.logout")}
            </button>
          )}
        </div>
      </div>

      {!isAuthenticated ? (
        <div className="account-guest-state">
          <h2>{t(lang, "auth.notAuthenticatedTitle")}</h2>
          <p>{t(lang, "auth.notAuthenticatedSubtitle")}</p>
        </div>
      ) : null}

      <div className="account-grid">
        <article className="account-card">
          <div className="account-card-head">
            <h2>{t(lang, "auth.accountSectionTitle")}</h2>
            <p>{t(lang, "auth.accountSectionSubtitle")}</p>
          </div>

          {!isEditingProfile ? (
            <>
              <dl className="account-meta">
                <div>
                  <dt>{t(lang, "auth.fullName")}</dt>
                  <dd>{displayName}</dd>
                </div>
                <div>
                  <dt>{t(lang, "auth.email")}</dt>
                  <dd>{displayEmail}</dd>
                </div>
                <div>
                  <dt>{t(lang, "auth.preferredLanguage")}</dt>
                  <dd>{displayPreferredLang}</dd>
                </div>
                <div>
                  <dt>{t(lang, "auth.accountState")}</dt>
                  <dd>{displayAccountStatus}</dd>
                </div>
              </dl>

              {isAuthenticated ? (
                <div className="account-actions-list">
                  <button
                    type="button"
                    className="product-secondary"
                    onClick={() => {
                      setProfileError(null);
                      setProfileName(account.full_name ?? "");
                      setProfileLang(normalizeEditableLang(account.preferred_lang, lang));
                      setIsEditingProfile(true);
                    }}
                  >
                    {t(lang, "auth.editProfile")}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="account-actions-list" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span>{t(lang, "auth.fullName")}</span>
                  <input
                    type="text"
                    className="product-input"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    maxLength={120}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span>{t(lang, "auth.preferredLanguage")}</span>
                  <select
                    className="product-select"
                    value={profileLang}
                    onChange={(e) => setProfileLang(e.target.value as Lang)}
                  >
                    <option value="pt">{t(lang, "auth.languagePortuguese")}</option>
                    <option value="en">{t(lang, "auth.languageEnglish")}</option>
                    <option value="es">{t(lang, "auth.languageSpanish")}</option>
                  </select>
                </label>
              </div>

              {profileError ? <div className="account-note">{profileError}</div> : null}

              <div className="account-actions-list">
                <button
                  type="button"
                  className="product-primary"
                  onClick={() => void handleSaveProfile()}
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? t(lang, "auth.saving") : t(lang, "auth.saveChanges")}
                </button>

                <button
                  type="button"
                  className="product-secondary"
                  onClick={() => {
                    setProfileError(null);
                    setProfileName(account.full_name ?? "");
                    setProfileLang(normalizeEditableLang(account.preferred_lang, lang));
                    setIsEditingProfile(false);
                  }}
                  disabled={isSavingProfile}
                >
                  {t(lang, "auth.cancel")}
                </button>
              </div>
            </>
          )}
        </article>

        <article className="account-card">
          <div className="account-card-head">
            <h2>{t(lang, "auth.securitySectionTitle")}</h2>
            <p>{t(lang, "auth.securitySectionSubtitle")}</p>
          </div>

          <dl className="account-meta">
            <div>
              <dt>{t(lang, "auth.emailVerification")}</dt>
              <dd>{displayEmailVerified}</dd>
            </div>
          </dl>

          <div className="account-actions-list">
            <button
              type="button"
              className="product-secondary"
              onClick={() => openAuthModal(isAuthenticated ? "changePassword" : "login")}
            >
              {isAuthenticated ? t(lang, "auth.changePassword") : t(lang, "auth.login")}
            </button>

            {!isAuthenticated ? (
              <button
                type="button"
                className="product-primary"
                onClick={() => openAuthModal("signup")}
              >
                {t(lang, "auth.signup")}
              </button>
            ) : null}
          </div>

          <div className="account-note">
            {isAuthenticated
              ? t(lang, "auth.securityHintAuthenticated")
              : t(lang, "auth.securityHintGuest")}
          </div>
        </article>

        <article className="account-card">
          <div className="account-card-head">
            <h2>{t(lang, "auth.planUsageSectionTitle")}</h2>
            <p>{t(lang, "auth.planUsageSectionSubtitle")}</p>
          </div>

          <dl className="account-meta">
            <div>
              <dt>{t(lang, "auth.currentPlan")}</dt>
              <dd>{displayPlanLabel}</dd>
            </div>
            <div>
              <dt>{t(lang, "auth.subscriptionStatus")}</dt>
              <dd>{displaySubscriptionStatus}</dd>
            </div>
            <div>
              <dt>{t(lang, "auth.subscriptionProvider")}</dt>
              <dd>{displaySubscriptionProvider}</dd>
            </div>
            <div>
              <dt>{t(lang, "auth.creditsUsedToday")}</dt>
              <dd>{usedToday}</dd>
            </div>
            <div>
              <dt>{t(lang, "auth.creditsRemainingToday")}</dt>
              <dd>{remaining}</dd>
            </div>
            <div>
              <dt>{t(lang, "auth.dailyLimit")}</dt>
              <dd>{dailyLimit}</dd>
            </div>
            <div>
              <dt>{t(lang, "auth.revealedCountToday")}</dt>
              <dd>{revealedToday}</dd>
            </div>
          </dl>
        </article>

        <article className="account-card">
          <div className="account-card-head">
            <h2>{t(lang, "auth.billingSectionTitle")}</h2>
            <p>{t(lang, "auth.billingSectionSubtitle")}</p>
          </div>

          <dl className="account-meta">
            <div>
              <dt>{t(lang, "auth.monthlyPrice")}</dt>
              <dd>{monthlyPrice ?? t(lang, "auth.notAvailableYet")}</dd>
            </div>
            <div>
              <dt>{t(lang, "auth.billingStatus")}</dt>
              <dd>{displaySubscriptionStatus}</dd>
            </div>
            <div>
              <dt>{t(lang, "auth.subscriptionProvider")}</dt>
              <dd>{displaySubscriptionProvider}</dd>
            </div>
            <div>
              <dt>{t(lang, "auth.billingRecurrence")}</dt>
              <dd>{displayBillingCycle}</dd>
            </div>
            <div>
              <dt>{t(lang, "auth.billingSummary")}</dt>
              <dd>{t(lang, "auth.billingPlaceholder")}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  );
}