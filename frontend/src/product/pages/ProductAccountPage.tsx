import React from "react";
import { Link, useOutletContext } from "react-router-dom";

import { AccountPreferencesModal } from "../components/AccountPreferencesModal";
import {
  mapBettorProfileLabel,
  mapNarrativeStyleLabel,
  resolveAccountPreferences,
} from "../preferences/accountPreferences";

import { fetchAccessUsage } from "../api/access";
import {
  clearProductPlanOverride,
  fetchAuthMe,
  normalizeBackendPlanCode,
  patchAuthAccountPreferences,
  patchAuthProfile,
  readProductPlanOverride,
} from "../api/auth";
import {
  BillingRequestError,
  fetchBillingCheckoutSessionStatus,
  fetchBillingSubscription,
  postBillingCancelRenewal,
  postBillingChangeApply,
  postBillingChangeCancel,
  postBillingChangePreview,
  postBillingChangeSchedule,
  postBillingResumeRenewal,
  type BillingChangeDecision,
  type BillingChangePreviewResponse,
  type BillingCycle,
  type BillingSubscriptionResponse,
} from "../api/billing";
import { t, type Lang } from "../i18n";
import { PLAN_CATALOG } from "../planCatalog";
import { PLAN_LABELS, type PlanId } from "../entitlements";
import { useProductStore } from "../state/productStore";
import type { ProductLayoutOutletContext } from "../layout/ProductLayout";
import { PRODUCT_AUTH_ENABLED } from "../../config";

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
  if (value === "trialing") return t(uiLang, "auth.subscriptionStatusTrialing");
  if (value === "paused") return t(uiLang, "auth.subscriptionStatusPaused");
  if (value === "incomplete") return t(uiLang, "auth.subscriptionStatusIncomplete");
  if (value === "expired") return t(uiLang, "auth.subscriptionStatusExpired");
  if (value === "unpaid") return t(uiLang, "auth.subscriptionStatusUnpaid");
  if (!value) return "—";
  return raw || "—";
}

function mapProviderLabel(uiLang: Lang, raw: string | null | undefined) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return t(uiLang, "auth.notAvailableYet");
  if (value === "manual") return t(uiLang, "auth.subscriptionProviderManual");
  if (value === "stripe") return "prevIA Billing";
  return raw || "—";
}

function formatDateTime(lang: Lang, raw: string | null | undefined) {
  if (!raw) return null;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  try {
    return new Intl.DateTimeFormat(
      lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    ).format(date);
  } catch {
    return raw;
  }
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

const BILLING_CHANGE_PLAN_OPTIONS: Array<Exclude<PlanId, "FREE" | "FREE_ANON">> = [
  "BASIC",
  "LIGHT",
  "PRO",
];

const BILLING_CHANGE_CYCLE_OPTIONS: BillingCycle[] = ["monthly", "quarterly", "annual"];

function getBillingChangeReasonMessage(uiLang: Lang, reasonCode?: string | null) {
  if (reasonCode === "subscription_change_same_target") {
    return uiLang === "pt"
      ? "Você já está neste plano e ciclo."
      : uiLang === "es"
      ? "Ya estás en este plan y ciclo."
      : "You are already on this plan and cycle.";
  }

  if (reasonCode === "subscription_change_blocked_cancel_at_period_end") {
    return uiLang === "pt"
      ? "Reative a renovação antes de mudar o plano."
      : uiLang === "es"
      ? "Reactiva la renovación antes de cambiar el plan."
      : "Resume renewal before changing the plan.";
  }

  if (reasonCode === "subscription_change_blocked_status") {
    return uiLang === "pt"
      ? "O status atual da cobrança não permite mudar o plano agora."
      : uiLang === "es"
      ? "El estado actual de facturación no permite cambiar el plan ahora."
      : "The current billing status does not allow a plan change right now.";
  }

  if (reasonCode === "subscription_change_blocked_currency_mismatch") {
    return uiLang === "pt"
      ? "Essa troca de moeda não está disponível neste fluxo."
      : uiLang === "es"
      ? "Este cambio de moneda no está disponible en este flujo."
      : "This currency change is not supported in this flow.";
  }

  if (reasonCode === "subscription_change_requires_period_end_schedule") {
    return uiLang === "pt"
      ? "Essa mudança precisa ser agendada para a próxima renovação."
      : uiLang === "es"
      ? "Este cambio debe programarse para la próxima renovación."
      : "This change must be scheduled for the next renewal.";
  }

  return null;
}

function getBillingChangeDecisionMessage(uiLang: Lang, decision?: BillingChangeDecision | null) {
  const code = String(decision?.decision_code || "").trim().toLowerCase();

  if (code === "upgrade_now" || code === "cycle_upgrade_now") {
    return uiLang === "pt"
      ? "A mudança será aplicada imediatamente."
      : uiLang === "es"
      ? "El cambio se aplicará inmediatamente."
      : "The change will be applied immediately.";
  }

  if (code === "downgrade_period_end" || code === "cycle_downgrade_period_end") {
    return uiLang === "pt"
      ? "Essa mudança deve entrar na próxima renovação."
      : uiLang === "es"
      ? "Este cambio debe entrar en la próxima renovación."
      : "This change should take effect on the next renewal.";
  }

  return null;
}

export default function ProductAccountPage() {
  const store = useProductStore();
  const { openAuthModal, logout } = useOutletContext<ProductLayoutOutletContext>();

  const lang = store.state.lang as Lang;
  const isAuthenticated = Boolean(store.state.auth.is_logged_in);
  const account = store.accountSnapshot;
  const googleAuthEnabled =
    String(import.meta.env.VITE_PRODUCT_GOOGLE_AUTH_ENABLED ?? "false").toLowerCase() === "true";
  const googleClientId = String(import.meta.env.VITE_PRODUCT_GOOGLE_CLIENT_ID ?? "").trim();
  const canOfferGoogleLink =
    isAuthenticated && googleAuthEnabled && Boolean(googleClientId);

  const [isFinalizingCheckout, setIsFinalizingCheckout] = React.useState(false);
  const [checkoutFinalizeSlow, setCheckoutFinalizeSlow] = React.useState(false);
  const [checkoutFinalizeError, setCheckoutFinalizeError] = React.useState<string | null>(null);

  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [profileName, setProfileName] = React.useState(account.full_name ?? "");
  const [profileLang, setProfileLang] = React.useState<Lang>(
    normalizeEditableLang(account.preferred_lang, lang)
  );
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [billingState, setBillingState] = React.useState<BillingSubscriptionResponse | null>(null);
  const [billingError, setBillingError] = React.useState<string | null>(null);
  const [billingActionMessage, setBillingActionMessage] = React.useState<string | null>(null);
  const [isBillingLoading, setIsBillingLoading] = React.useState(false);
  const [isBillingActionLoading, setIsBillingActionLoading] = React.useState(false);
  const [billingChangePlan, setBillingChangePlan] =
    React.useState<Exclude<PlanId, "FREE" | "FREE_ANON">>("BASIC");
  const [billingChangeCycle, setBillingChangeCycle] = React.useState<BillingCycle>("monthly");
  const [billingChangePreview, setBillingChangePreview] =
    React.useState<BillingChangePreviewResponse | null>(null);
  const [billingChangeError, setBillingChangeError] = React.useState<string | null>(null);
  const [billingChangeResultMessage, setBillingChangeResultMessage] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isBillingChangePreviewLoading, setIsBillingChangePreviewLoading] = React.useState(false);
  const [isBillingChangeApplyLoading, setIsBillingChangeApplyLoading] = React.useState(false);
  const [isBillingChangeScheduleLoading, setIsBillingChangeScheduleLoading] = React.useState(false);
  const [isBillingChangeCancelLoading, setIsBillingChangeCancelLoading] = React.useState(false);
  const [preferencesOpen, setPreferencesOpen] = React.useState(false);
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
  const planUsageSubscription = billingState?.subscription ?? null;

  const displayPlanLabel = mapPlanLabel(planUsageSubscription?.plan_code ?? plan);
  const displaySubscriptionStatus = mapSubscriptionStatusLabel(
    lang,
    planUsageSubscription?.billing_status ?? account.subscription.status
  );
  const displaySubscriptionProvider = mapProviderLabel(
    lang,
    planUsageSubscription?.provider ?? account.subscription.provider
  );

  const accountPreferences = React.useMemo(
    () => resolveAccountPreferences(store.state.preferences),
    [store.state.preferences]
  );

  const displayBettorProfile = mapBettorProfileLabel(lang, accountPreferences.bettor_profile);
  const displayNarrativeStyle = mapNarrativeStyleLabel(lang, accountPreferences.narrative_style);

  const preferencesSectionTitle =
    lang === "pt"
      ? "Perfil e preferências"
      : lang === "es"
      ? "Perfil y preferencias"
      : "Profile and preferences";

  const preferencesSectionSubtitle =
    lang === "pt"
      ? "Esse modal já nasce genérico para, no futuro, guardar outras informações da conta também."
      : lang === "es"
      ? "Este modal ya nace genérico para, en el futuro, guardar también otras informaciones de la cuenta."
      : "This modal is intentionally generic so it can later hold other account information too.";

  const preferencesProfileLabel =
    lang === "pt"
      ? "Tipo de apostador"
      : lang === "es"
      ? "Tipo de apostador"
      : "Bettor profile";

  const preferencesStyleLabel =
    lang === "pt"
      ? "Estilo atual da análise"
      : lang === "es"
      ? "Estilo actual del análisis"
      : "Current analysis style";

  const preferencesHint =
    lang === "pt"
      ? "Se nada tiver sido escolhido ainda, o estilo padrão continua sendo Leve."
      : lang === "es"
      ? "Si aún no se ha elegido nada, el estilo por defecto sigue siendo Ligero."
      : "If nothing has been chosen yet, the default style remains Light.";

  const preferencesButtonLabel =
    lang === "pt"
      ? "Alterar preferências"
      : lang === "es"
      ? "Cambiar preferencias"
      : "Change preferences";

  const billingSubscription = billingState?.subscription ?? null;
  const billingActions = billingState?.actions ?? {
    can_checkout: true,
    can_change_plan: true,
    can_cancel_renewal: false,
    can_resume_renewal: false,
    can_cancel_scheduled_change: false,
  };

  const scheduledBillingChange = billingState?.scheduled_change ?? null;

  const displayBillingPlanLabel = mapPlanLabel(billingSubscription?.plan_code ?? plan);
  const displayBillingStatus = mapSubscriptionStatusLabel(
    lang,
    billingSubscription?.billing_status ?? account.subscription.status
  );
  const displayBillingProviderLabel = mapProviderLabel(
    lang,
    billingSubscription?.provider ?? account.subscription.provider
  );
  const displayBillingCycleLabel = mapBillingCycleLabel(
    lang,
    (billingSubscription?.billing_cycle as
      | "monthly"
      | "quarterly"
      | "semiannual"
      | "annual"
      | null
      | undefined) ?? account.subscription.billing_cycle
  );

  const billingAmountLabel = formatMoney(
    lang,
    billingSubscription?.unit_amount ?? planCatalog.priceMonthly,
    ((billingSubscription?.currency_code as "BRL" | "USD" | "EUR" | null) ??
      planCatalog.currency) as "BRL" | "USD" | "EUR"
  );

  const canUseSelfServicePlanChange =
    Boolean(billingSubscription) &&
    String(billingSubscription?.provider || "")
      .trim()
      .toLowerCase() === "stripe" &&
    Boolean(billingSubscription?.provider_subscription_id);

  const effectiveBillingCurrency: "BRL" | "USD" =
    String(billingSubscription?.currency_code || "BRL").toUpperCase() === "USD" ? "USD" : "BRL";

  const billingChangeDecisionMessage = getBillingChangeDecisionMessage(
    lang,
    billingChangePreview?.decision
  );

  const scheduledBillingChangeEffectiveAt = formatDateTime(
    lang,
    scheduledBillingChange?.effective_at_utc
  );

  const scheduledBillingChangeDescription =
    scheduledBillingChange != null
      ? `${mapPlanLabel(scheduledBillingChange.target_plan_code)} • ${mapBillingCycleLabel(
          lang,
          scheduledBillingChange.target_billing_cycle as
            | "monthly"
            | "quarterly"
            | "semiannual"
            | "annual"
            | null
            | undefined
        )}`
      : null;

  const billingChangeAmountDueLabel = formatMoney(
    lang,
    billingChangePreview?.preview?.amount_due_now_cents != null
      ? billingChangePreview.preview.amount_due_now_cents / 100
      : null,
    ((billingChangePreview?.preview?.currency_code as "BRL" | "USD" | "EUR" | null) ??
      effectiveBillingCurrency) as "BRL" | "USD" | "EUR"
  );

  const billingChangeFullDeltaLabel = formatMoney(
    lang,
    billingChangePreview?.preview?.full_period_delta_cents != null
      ? billingChangePreview.preview.full_period_delta_cents / 100
      : null,
    effectiveBillingCurrency as "BRL" | "USD" | "EUR"
  );

  const billingCurrentPeriodEnd = formatDateTime(lang, billingSubscription?.current_period_end);
  const billingTrialEnd = formatDateTime(lang, billingSubscription?.trial_end_utc);
  const billingLastSync = formatDateTime(lang, billingSubscription?.updated_at_utc);

  function clearStoredCheckoutSessionId() {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem("billing_last_checkout_session_id");
  }

  const syncAccountFromBackend = React.useCallback(async () => {
    const authData = await fetchAuthMe();

    store.applyBackendBootstrap({
      is_authenticated: Boolean(authData.is_authenticated),
      email: authData.user?.email ?? null,
      plan: normalizeBackendPlanCode(authData.subscription?.plan_code),
      auth_mode: authData.auth_mode ?? null,
      user_id: authData.user?.user_id ?? null,
      full_name: authData.user?.full_name ?? null,
      preferred_lang: authData.user?.preferred_lang ?? null,
      user_status: authData.user?.status ?? null,
      email_verified: authData.user?.email_verified ?? null,
      subscription_plan_code: authData.subscription?.plan_code ?? null,
      subscription_status: authData.subscription?.status ?? null,
      subscription_provider: authData.subscription?.provider ?? null,
      subscription_billing_cycle: authData.subscription?.billing_cycle ?? null,
      access_context: authData.access ?? null,
      account_preferences: authData.account_preferences ?? null,
    });

    if (!authData.is_authenticated) {
      clearProductPlanOverride();
      return authData;
    }

    const usage = await fetchAccessUsage();

    store.applyBackendUsage({
      date_key: usage.date_key,
      credits_used: usage.usage.credits_used,
      revealed_count: usage.usage.revealed_count,
      daily_limit: usage.usage.daily_limit,
      remaining: usage.usage.remaining,
      revealed_fixture_keys: usage.usage.revealed_fixture_keys,
    });

    return authData;
  }, [store]);

  const loadBilling = React.useCallback(async () => {
    if (!isAuthenticated) {
      setBillingState(null);
      setBillingError(null);
      return;
    }

    try {
      setIsBillingLoading(true);
      setBillingError(null);
      const result = await fetchBillingSubscription();
      setBillingState(result);
    } catch (error) {
      console.error("loadBilling failed", error);
      setBillingError(t(lang, "auth.billingLoadError"));
    } finally {
      setIsBillingLoading(false);
    }
  }, [isAuthenticated, lang]);

  React.useEffect(() => {
    if (!billingSubscription) {
      setBillingChangePreview(null);
      setBillingChangeError(null);
      return;
    }

    const currentPlanCode = String(billingSubscription.plan_code || "").trim().toUpperCase();
    const nextPlan: Exclude<PlanId, "FREE" | "FREE_ANON"> =
      currentPlanCode === "BASIC"
        ? "LIGHT"
        : currentPlanCode === "LIGHT"
        ? "PRO"
        : "PRO";

    const currentCycle =
      billingSubscription.billing_cycle === "monthly" ||
      billingSubscription.billing_cycle === "quarterly" ||
      billingSubscription.billing_cycle === "annual"
        ? billingSubscription.billing_cycle
        : "monthly";

    setBillingChangePlan(nextPlan);
    setBillingChangeCycle(currentCycle);
    setBillingChangePreview(null);
    setBillingChangeError(null);
  }, [
    billingSubscription?.subscription_id,
    billingSubscription?.plan_code,
    billingSubscription?.billing_cycle,
  ]);

  function isStripeSubscriptionMaterialized(
    authData: {
      subscription?: {
        provider?: string | null;
        plan_code?: string | null;
        status?: string | null;
      } | null;
    } | null | undefined,
    billingData: BillingSubscriptionResponse | null | undefined
  ) {
    const effectiveProvider = String(
      billingData?.subscription?.provider ?? authData?.subscription?.provider ?? ""
    )
      .trim()
      .toLowerCase();

    const effectivePlanCode = String(
      billingData?.subscription?.plan_code ?? authData?.subscription?.plan_code ?? "FREE"
    )
      .trim()
      .toUpperCase();

    const effectiveStatus = String(
      billingData?.subscription?.billing_status ?? authData?.subscription?.status ?? ""
    )
      .trim()
      .toLowerCase();

    return (
      effectiveProvider === "stripe" &&
      effectivePlanCode !== "FREE" &&
      ["active", "trialing", "past_due"].includes(effectiveStatus)
    );
  }

  function isCheckoutUiResolved(
    authData: {
      subscription?: {
        plan_code?: string | null;
      } | null;
    } | null | undefined,
    billingData: BillingSubscriptionResponse | null | undefined
  ) {
    const effectivePlanCode = normalizeBackendPlanCode(
      billingData?.subscription?.plan_code ?? authData?.subscription?.plan_code
    );

    return effectivePlanCode !== "FREE";
  }

  const finalizeMaterializedCheckoutState = React.useCallback(
    async (
      authData: Awaited<ReturnType<typeof fetchAuthMe>>,
      billingData: BillingSubscriptionResponse | null | undefined
    ) => {
      const effectivePlanCode = normalizeBackendPlanCode(
        billingData?.subscription?.plan_code ?? authData.subscription?.plan_code
      );

      clearStoredCheckoutSessionId();

      const storedOverride = readProductPlanOverride();

      if (!storedOverride || effectivePlanCode === "FREE" || storedOverride === effectivePlanCode) {
        return authData;
      }

      clearProductPlanOverride();
      return await syncAccountFromBackend();
    },
    [syncAccountFromBackend]
  );

  const handleRefreshAfterCheckout = React.useCallback(async () => {
    setCheckoutFinalizeError(null);

    try {
      const authData = await syncAccountFromBackend();
      const billingData = await fetchBillingSubscription();

      setBillingState(billingData);

      const shouldCloseOverlay =
        isStripeSubscriptionMaterialized(authData, billingData) ||
        isCheckoutUiResolved(authData, billingData);

      if (shouldCloseOverlay) {
        await finalizeMaterializedCheckoutState(authData, billingData);
        setCheckoutFinalizeError(null);
        setCheckoutFinalizeSlow(false);
        setIsFinalizingCheckout(false);
        return true;
      }

      setCheckoutFinalizeSlow(true);
      return false;
    } catch (error) {
      console.error("checkout finalization refresh failed", error);
      setCheckoutFinalizeError(t(lang, "auth.billingCheckoutFinalizingSlow"));
      return false;
    }
  }, [
    finalizeMaterializedCheckoutState,
    isCheckoutUiResolved,
    isStripeSubscriptionMaterialized,
    lang,
    syncAccountFromBackend,
  ]);

  React.useEffect(() => {
    setProfileName(account.full_name ?? "");
    setProfileLang(normalizeEditableLang(account.preferred_lang, store.state.lang as Lang));
  }, [account.full_name, account.preferred_lang, store.state.lang]);

  React.useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("billing") !== "updated") return;

    const rawCheckoutSessionId = url.searchParams.get("session_id");
    const storedCheckoutSessionId = window.sessionStorage.getItem(
      "billing_last_checkout_session_id"
    );

    const checkoutSessionId =
      rawCheckoutSessionId &&
      !rawCheckoutSessionId.includes("{") &&
      !rawCheckoutSessionId.includes("CHECKOUT_SESSION_ID")
        ? rawCheckoutSessionId
        : storedCheckoutSessionId;

    let cancelled = false;
    let slowTimerId: number | null = null;

    setIsFinalizingCheckout(true);
    setCheckoutFinalizeSlow(false);
    setCheckoutFinalizeError(null);

    async function syncCheckoutReturn() {
      setBillingActionMessage(t(lang, "auth.billingCheckoutSuccess"));
      setBillingError(null);
      setIsBillingLoading(true);

      slowTimerId = window.setTimeout(() => {
        if (!cancelled) {
          setCheckoutFinalizeSlow(true);
        }
      }, 8000);

      try {
        if (checkoutSessionId) {
          try {
            const checkoutSync = await fetchBillingCheckoutSessionStatus(checkoutSessionId);

            if (cancelled) return;

            setBillingState(checkoutSync);

            if (
              isStripeSubscriptionMaterialized(null, checkoutSync) ||
              isCheckoutUiResolved(null, checkoutSync)
            ) {
              const authData = await syncAccountFromBackend();

              if (cancelled) return;

              await finalizeMaterializedCheckoutState(authData, checkoutSync);

              if (cancelled) return;

              setCheckoutFinalizeError(null);
              setCheckoutFinalizeSlow(false);
              setIsFinalizingCheckout(false);
              return;
            }
          } catch (error) {
            console.error("checkout session immediate sync failed", error);
          }
        }

        for (let attempt = 0; attempt < 6; attempt += 1) {
          const authData = await syncAccountFromBackend();
          const billingData = await fetchBillingSubscription();

          if (cancelled) return;

          setBillingState(billingData);

          if (
            isStripeSubscriptionMaterialized(authData, billingData) ||
            isCheckoutUiResolved(authData, billingData)
          ) {
            await finalizeMaterializedCheckoutState(authData, billingData);

            if (cancelled) return;

            setCheckoutFinalizeError(null);
            setCheckoutFinalizeSlow(false);
            setIsFinalizingCheckout(false);
            break;
          }

          if (attempt < 5) {
            await new Promise((resolve) => window.setTimeout(resolve, 1500));
          }
        }
      } catch (error) {
        console.error("checkout return billing sync failed", error);
        setBillingError(t(lang, "auth.billingLoadError"));
        setCheckoutFinalizeError(t(lang, "auth.billingCheckoutFinalizingSlow"));
      } finally {
        if (slowTimerId != null) {
          window.clearTimeout(slowTimerId);
        }

        if (!cancelled) {
          setIsBillingLoading(false);
          setIsFinalizingCheckout(false);
        }
      }
    }

    url.searchParams.delete("billing");
    url.searchParams.delete("session_id");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);

    void syncCheckoutReturn();

    return () => {
      cancelled = true;
      if (slowTimerId != null) {
        window.clearTimeout(slowTimerId);
      }
    };
  }, [
    finalizeMaterializedCheckoutState,
    isCheckoutUiResolved,
    isStripeSubscriptionMaterialized,
    lang,
    syncAccountFromBackend,
  ]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("debugPrefsModal") !== "1") return;

    setPreferencesOpen(true);

    url.searchParams.delete("debugPrefsModal");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  async function handleBillingAction(action: "cancel" | "resume") {
    try {
      setIsBillingActionLoading(true);
      setBillingError(null);
      setBillingActionMessage(null);

      const result =
        action === "cancel"
          ? await postBillingCancelRenewal()
          : await postBillingResumeRenewal();

      setBillingState(result);
      setBillingActionMessage(
        action === "cancel"
          ? t(lang, "auth.billingActionSuccessCancel")
          : t(lang, "auth.billingActionSuccessResume")
      );
    } catch (error) {
      console.error("handleBillingAction failed", error);
      setBillingError(t(lang, "auth.billingActionError"));
    } finally {
      setIsBillingActionLoading(false);
    }
  }

  async function handleBillingChangePreview() {
    if (!billingSubscription) return;

    try {
      setIsBillingChangePreviewLoading(true);
      setBillingChangeError(null);
      setBillingActionMessage(null);
      setBillingChangeResultMessage(null);

      const result = await postBillingChangePreview({
        target_plan_code: billingChangePlan,
        target_billing_cycle: billingChangeCycle,
        currency_code: effectiveBillingCurrency,
      });

      setBillingChangePreview(result);
    } catch (error) {
      console.error("handleBillingChangePreview failed", error);

      if (error instanceof BillingRequestError) {
        const friendly = getBillingChangeReasonMessage(lang, error.code || error.message);
        setBillingChangeError(
          friendly ??
            (lang === "pt"
              ? "Não foi possível gerar o preview da mudança."
              : lang === "es"
              ? "No se pudo generar la vista previa del cambio."
              : "Could not generate the change preview.")
        );
      } else {
        setBillingChangeError(
          lang === "pt"
            ? "Não foi possível gerar o preview da mudança."
            : lang === "es"
            ? "No se pudo generar la vista previa del cambio."
            : "Could not generate the change preview."
        );
      }
    } finally {
      setIsBillingChangePreviewLoading(false);
    }
  }

  async function handleBillingChangeApply() {
    if (!billingChangePreview?.policy?.can_apply_now) return;

    try {
      setIsBillingChangeApplyLoading(true);
      setBillingChangeError(null);
      setBillingActionMessage(null);
      setBillingChangeResultMessage(null);

      const confirmedTargetPlanLabel = mapPlanLabel(billingChangePlan);
      const confirmedTargetCycleLabel = mapBillingCycleLabel(lang, billingChangeCycle);
      const confirmedAmountDueLabel = billingChangeAmountDueLabel;

      const result = await postBillingChangeApply({
        target_plan_code: billingChangePlan,
        target_billing_cycle: billingChangeCycle,
        currency_code: effectiveBillingCurrency,
        preview_proration_date: billingChangePreview.preview.proration_date ?? null,
        preview_subscription_updated_at: billingChangePreview.current.updated_at_utc ?? null,
      });

      setBillingState(result);
      setBillingChangePreview(null);

      if (result.applied) {
        await syncAccountFromBackend();

        setBillingChangeResultMessage({
          type: "success",
          message:
            lang === "pt"
              ? `Plano alterado com sucesso. Seu novo plano é ${confirmedTargetPlanLabel} (${confirmedTargetCycleLabel}). A cobrança foi aprovada pelo Stripe.`
              : lang === "es"
              ? `Plan cambiado con éxito. Tu nuevo plan es ${confirmedTargetPlanLabel} (${confirmedTargetCycleLabel}). El cobro fue aprobado por Stripe.`
              : `Plan changed successfully. Your new plan is ${confirmedTargetPlanLabel} (${confirmedTargetCycleLabel}). The payment was approved by Stripe.`,
        });

        return;
      }

      if (result.pending_update) {
        setBillingActionMessage(
          lang === "pt"
            ? "A cobrança ficou pendente. Assim que o pagamento for concluído, a mudança será aplicada."
            : lang === "es"
            ? "El cobro quedó pendiente. Cuando se complete el pago, el cambio será aplicado."
            : "The payment is pending. Once it completes, the change will be applied."
        );
        return;
      }

      setBillingActionMessage(
        lang === "pt"
          ? "A solicitação foi processada."
          : lang === "es"
          ? "La solicitud fue procesada."
          : "The request was processed."
      );
      } catch (error) {
        console.error("handleBillingChangeApply failed", error);

        setBillingChangeResultMessage({
          type: "error",
          message:
            lang === "pt"
              ? "Não foi possível concluir a mudança de plano. Nenhuma alteração foi aplicada."
              : lang === "es"
              ? "No se pudo completar el cambio de plan. No se aplicó ningún cambio."
              : "Could not complete the plan change. No change was applied.",
        });

        if (error instanceof BillingRequestError) {
        const friendly = getBillingChangeReasonMessage(lang, error.code || error.message);
        setBillingChangeError(
          friendly ??
            (lang === "pt"
              ? "Não foi possível aplicar a mudança agora."
              : lang === "es"
              ? "No se pudo aplicar el cambio ahora."
              : "Could not apply the change right now.")
        );
      } else {
        setBillingChangeError(
          lang === "pt"
            ? "Não foi possível aplicar a mudança agora."
            : lang === "es"
            ? "No se pudo aplicar el cambio ahora."
            : "Could not apply the change right now."
        );
      }
    } finally {
      setIsBillingChangeApplyLoading(false);
    }
  }

  async function handleBillingChangeSchedule() {
    if (!billingChangePreview?.policy?.can_schedule) return;

    try {
      setIsBillingChangeScheduleLoading(true);
      setBillingChangeError(null);
      setBillingActionMessage(null);

      const result = await postBillingChangeSchedule({
        target_plan_code: billingChangePlan,
        target_billing_cycle: billingChangeCycle,
        currency_code: effectiveBillingCurrency,
        preview_subscription_updated_at: billingChangePreview.current.updated_at_utc ?? null,
      });

      setBillingState(result);
      setBillingChangePreview(null);

      await syncAccountFromBackend();

      setBillingActionMessage(
        lang === "pt"
          ? "Mudança agendada para a próxima renovação."
          : lang === "es"
          ? "Cambio programado para la próxima renovación."
          : "Change scheduled for the next renewal."
      );
    } catch (error) {
      console.error("handleBillingChangeSchedule failed", error);

      if (error instanceof BillingRequestError) {
        const friendly = getBillingChangeReasonMessage(lang, error.code || error.message);
        setBillingChangeError(
          friendly ??
            (lang === "pt"
              ? "Não foi possível agendar a mudança."
              : lang === "es"
              ? "No se pudo programar el cambio."
              : "Could not schedule the change.")
        );
      } else {
        setBillingChangeError(
          lang === "pt"
            ? "Não foi possível agendar a mudança."
            : lang === "es"
            ? "No se pudo programar el cambio."
            : "Could not schedule the change."
        );
      }
    } finally {
      setIsBillingChangeScheduleLoading(false);
    }
  }

  async function handleBillingChangeCancel() {
    if (!billingActions.can_cancel_scheduled_change) return;

    try {
      setIsBillingChangeCancelLoading(true);
      setBillingChangeError(null);
      setBillingActionMessage(null);

      const result = await postBillingChangeCancel();

      setBillingState(result);
      setBillingChangePreview(null);

      await syncAccountFromBackend();

      setBillingActionMessage(
        lang === "pt"
          ? "Mudança agendada cancelada."
          : lang === "es"
          ? "Cambio programado cancelado."
          : "Scheduled change cancelled."
      );
      } catch (error) {
        console.error("handleBillingChangeCancel failed", error);
        setBillingChangeError(
        lang === "pt"
          ? "Não foi possível cancelar a mudança agendada."
          : lang === "es"
          ? "No se pudo cancelar el cambio programado."
          : "Could not cancel the scheduled change."
      );
    } finally {
      setIsBillingChangeCancelLoading(false);
    }
  }

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
    <>
      <section className="account-page">
      {isFinalizingCheckout ? (
        <div className="account-finalizing-overlay" role="status" aria-live="polite">
          <div className="account-finalizing-card">
            <div className="account-finalizing-spinner" aria-hidden="true" />

            <h2>{t(lang, "auth.billingCheckoutFinalizingTitle")}</h2>

            <p>
              {checkoutFinalizeSlow
                ? t(lang, "auth.billingCheckoutFinalizingSlow")
                : t(lang, "auth.billingCheckoutFinalizingBody")}
            </p>

            <div className="account-actions-list">
              <button
                type="button"
                className="product-secondary"
                onClick={() => {
                  setCheckoutFinalizeError(null);
                  setCheckoutFinalizeSlow(false);
                  setIsFinalizingCheckout(false);
                }}
              >
                {t(lang, "auth.accountSettings")}
              </button>

              {checkoutFinalizeSlow ? (
                <button
                  type="button"
                  className="product-primary"
                  onClick={() => void handleRefreshAfterCheckout()}
                >
                  {t(lang, "auth.billingCheckoutRefreshNow")}
                </button>
              ) : null}
            </div>

            {checkoutFinalizeError ? (
              <div className="account-note">{checkoutFinalizeError}</div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="account-hero">
        <div>
          <div className="account-kicker">{t(lang, "auth.accountSettings")}</div>
          <h1 className="account-title">{t(lang, "auth.accountPageTitle")}</h1>
          <p className="account-subtitle">{t(lang, "auth.accountPageSubtitle")}</p>
        </div>

        <div className="account-hero-actions">
          <Link to="/app" className="product-secondary">
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

        {isAuthenticated ? (
          <article className="account-card">
            <div className="account-card-head">
              <h2>{preferencesSectionTitle}</h2>
              <p>{preferencesSectionSubtitle}</p>
            </div>

            <dl className="account-meta">
              <div>
                <dt>{preferencesProfileLabel}</dt>
                <dd>{displayBettorProfile}</dd>
              </div>

              <div>
                <dt>{preferencesStyleLabel}</dt>
                <dd>{displayNarrativeStyle}</dd>
              </div>
            </dl>

            <div className="account-note">{preferencesHint}</div>

            <div className="account-actions-list">
              <button
                type="button"
                className="product-secondary"
                onClick={() => setPreferencesOpen(true)}
              >
                {preferencesButtonLabel}
              </button>
            </div>
          </article>
        ) : null}   

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

            {canOfferGoogleLink ? (
              <button
                type="button"
                className="product-secondary"
                onClick={() => openAuthModal("linkGoogle")}
              >
                {t(lang, "auth.linkGoogle")}
              </button>
            ) : null}

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

          {billingActionMessage ? (
            <div className="account-note" style={{ marginBottom: 12, whiteSpace: "pre-line" }}>
              {billingActionMessage}
            </div>
          ) : null}

          {billingError ? (
            <div className="account-note" style={{ marginBottom: 12, color: "#b42318" }}>
              {billingError}
            </div>
          ) : null}

          <dl className="account-meta">
            <div>
              <dt>{t(lang, "auth.currentPlan")}</dt>
              <dd>{displayBillingPlanLabel}</dd>
            </div>

            <div>
              <dt>{t(lang, "auth.monthlyPrice")}</dt>
              <dd>
                {isBillingLoading
                  ? t(lang, "auth.billingLoading")
                  : billingAmountLabel ?? t(lang, "auth.notAvailableYet")}
              </dd>
            </div>

            <div>
              <dt>{t(lang, "auth.billingStatus")}</dt>
              <dd>{displayBillingStatus}</dd>
            </div>

            <div>
              <dt>{t(lang, "auth.subscriptionProvider")}</dt>
              <dd>{displayBillingProviderLabel}</dd>
            </div>

            <div>
              <dt>{t(lang, "auth.billingRecurrence")}</dt>
              <dd>{displayBillingCycleLabel}</dd>
            </div>

            <div>
              <dt>{t(lang, "auth.billingAutoRenew")}</dt>
              <dd>
                {billingSubscription
                  ? billingSubscription.cancel_at_period_end
                    ? t(lang, "auth.billingAutoRenewOff")
                    : t(lang, "auth.billingAutoRenewOn")
                  : t(lang, "auth.notAvailableYet")}
              </dd>
            </div>

            <div>
              <dt>
                {billingSubscription?.trial_end_utc
                  ? t(lang, "auth.billingTrialEnds")
                  : t(lang, "auth.billingCurrentPeriodEnd")}
              </dt>
              <dd>
                {(billingSubscription?.trial_end_utc ? billingTrialEnd : billingCurrentPeriodEnd) ??
                  t(lang, "auth.notAvailableYet")}
              </dd>
            </div>

            <div>
              <dt>{t(lang, "auth.billingLastSync")}</dt>
              <dd>{billingLastSync ?? t(lang, "auth.notAvailableYet")}</dd>
            </div>
          </dl>

          {billingState && !billingState.has_subscription ? (
            <div className="account-note" style={{ marginTop: 16 }}>
              {t(lang, "auth.billingNoPaidSubscription")}
            </div>
          ) : null}

          {canUseSelfServicePlanChange ? (
            <div className="account-note" style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {lang === "pt"
                  ? "Mudança de plano"
                  : lang === "es"
                  ? "Cambio de plan"
                  : "Plan change"}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                <label style={{ display: "grid", gap: 6 }}>
                  <span>
                    {lang === "pt" ? "Plano alvo" : lang === "es" ? "Plan objetivo" : "Target plan"}
                  </span>
                  <select
                    className="account-billing-select"
                    value={billingChangePlan}
                    onChange={(event) => {
                      setBillingChangePlan(
                        event.target.value as Exclude<PlanId, "FREE" | "FREE_ANON">
                      );
                      setBillingChangePreview(null);
                      setBillingChangeError(null);
                      setBillingChangeResultMessage(null);
                    }}
                  >
                    {BILLING_CHANGE_PLAN_OPTIONS.map((planId) => (
                      <option key={planId} value={planId}>
                        {mapPlanLabel(planId)}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span>
                    {lang === "pt" ? "Recorrência" : lang === "es" ? "Recurrencia" : "Billing cycle"}
                  </span>
                  <select
                    className="account-billing-select"
                    value={billingChangeCycle}
                    onChange={(event) => {
                      setBillingChangeCycle(event.target.value as BillingCycle);
                      setBillingChangePreview(null);
                      setBillingChangeError(null);
                      setBillingChangeResultMessage(null);
                    }}
                  >
                    {BILLING_CHANGE_CYCLE_OPTIONS.map((cycle) => (
                      <option key={cycle} value={cycle}>
                        {mapBillingCycleLabel(lang, cycle)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {billingChangeError ? (
                <div style={{ marginTop: 12, color: "#b42318" }}>{billingChangeError}</div>
              ) : null}

              {billingChangePreview ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 14,
                    borderRadius: 14,
                    background: "#f8fbff",
                    border: "1px solid #dbe5ff",
                    display: "grid",
                    gap: 8,
                    color: "#24324a",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    {billingChangePreview?.policy?.can_apply_now
                      ? lang === "pt"
                        ? `Confirmar mudança para ${mapPlanLabel(billingChangePlan)} (${mapBillingCycleLabel(
                            lang,
                            billingChangeCycle
                          )})`
                        : lang === "es"
                        ? `Confirmar cambio a ${mapPlanLabel(billingChangePlan)} (${mapBillingCycleLabel(
                            lang,
                            billingChangeCycle
                          )})`
                        : `Confirm change to ${mapPlanLabel(billingChangePlan)} (${mapBillingCycleLabel(
                            lang,
                            billingChangeCycle
                          )})`
                      : lang === "pt"
                      ? `Agendar mudança para ${mapPlanLabel(billingChangePlan)} (${mapBillingCycleLabel(
                          lang,
                          billingChangeCycle
                        )})`
                      : lang === "es"
                      ? `Programar cambio a ${mapPlanLabel(billingChangePlan)} (${mapBillingCycleLabel(
                          lang,
                          billingChangeCycle
                        )})`
                      : `Schedule change to ${mapPlanLabel(billingChangePlan)} (${mapBillingCycleLabel(
                          lang,
                          billingChangeCycle
                        )})`}
                  </div>

                  <div>
                    {billingChangePreview?.policy?.can_apply_now
                      ? lang === "pt"
                        ? "A mudança será aplicada imediatamente."
                        : lang === "es"
                        ? "El cambio se aplicará inmediatamente."
                        : "The change will be applied immediately."
                      : lang === "pt"
                      ? "A mudança será aplicada na próxima renovação."
                      : lang === "es"
                      ? "El cambio se aplicará en la próxima renovación."
                      : "The change will take effect on the next renewal."}
                  </div>

                  {billingChangePreview?.policy?.can_apply_now ? (
                    <div>
                      {lang === "pt"
                        ? "O valor final já considera automaticamente o crédito proporcional do seu plano atual."
                        : lang === "es"
                        ? "El valor final ya considera automáticamente el crédito proporcional de tu plan actual."
                        : "The final amount already includes the proportional credit from your current plan."}
                    </div>
                  ) : null}

                  {billingChangeAmountDueLabel && billingChangePreview?.policy?.can_apply_now ? (
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>
                      {lang === "pt"
                        ? `Você paga agora: ${billingChangeAmountDueLabel}`
                        : lang === "es"
                        ? `Pagas ahora: ${billingChangeAmountDueLabel}`
                        : `You pay now: ${billingChangeAmountDueLabel}`}
                    </div>
                  ) : null}

                  {billingChangeAmountDueLabel && !billingChangePreview?.policy?.can_apply_now ? (
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>
                      {lang === "pt"
                        ? "Sem cobrança imediata."
                        : lang === "es"
                        ? "Sin cobro inmediato."
                        : "No immediate charge."}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  className="product-secondary"
                  disabled={isBillingChangePreviewLoading || isBillingChangeApplyLoading}
                  onClick={() => void handleBillingChangePreview()}
                >
                  {isBillingChangePreviewLoading
                    ? lang === "pt"
                      ? "Gerando preview..."
                      : lang === "es"
                      ? "Generando vista previa..."
                      : "Generating preview..."
                    : lang === "pt"
                    ? "Ver preview"
                    : lang === "es"
                    ? "Ver vista previa"
                    : "View preview"}
                </button>

                {billingChangePreview?.policy?.can_schedule &&
                !billingChangePreview?.policy?.can_apply_now ? (
                  <button
                    type="button"
                    className="product-primary"
                    disabled={
                      isBillingChangeScheduleLoading ||
                      isBillingChangePreviewLoading ||
                      isBillingChangeApplyLoading
                    }
                    onClick={() => void handleBillingChangeSchedule()}
                  >
                    {isBillingChangeScheduleLoading
                      ? lang === "pt"
                        ? "Agendando..."
                        : lang === "es"
                        ? "Programando..."
                        : "Scheduling..."
                      : lang === "pt"
                      ? "Agendar para o próximo ciclo"
                      : lang === "es"
                      ? "Programar para el próximo ciclo"
                      : "Schedule for next cycle"}
                  </button>
                ) : null}

                {billingChangePreview?.policy?.can_apply_now ? (
                  <button
                    type="button"
                    className="product-primary"
                    disabled={isBillingChangeApplyLoading || isBillingChangePreviewLoading}
                    onClick={() => void handleBillingChangeApply()}
                  >
                    {isBillingChangeApplyLoading
                      ? lang === "pt"
                        ? "Aplicando..."
                        : lang === "es"
                        ? "Aplicando..."
                        : "Applying..."
                      : lang === "pt"
                      ? "Aplicar agora"
                      : lang === "es"
                      ? "Aplicar ahora"
                      : "Apply now"}
                  </button>
                ) : null}

                {billingChangeResultMessage ? (
                  <div
                    style={{
                      width: "100%",
                      marginTop: 12,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border:
                        billingChangeResultMessage.type === "success"
                          ? "1px solid #bbf7d0"
                          : "1px solid #fecaca",
                      background:
                        billingChangeResultMessage.type === "success"
                          ? "#f0fdf4"
                          : "#fef2f2",
                      color:
                        billingChangeResultMessage.type === "success"
                          ? "#166534"
                          : "#991b1b",
                      fontSize: 13,
                      fontWeight: 700,
                      lineHeight: 1.45,
                    }}
                  >
                    {billingChangeResultMessage.message}
                  </div>
                ) : null}


              </div>
            </div>
          ) : null}

          {scheduledBillingChange ? (
            <div className="account-note" style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {lang === "pt"
                  ? "Mudança agendada"
                  : lang === "es"
                  ? "Cambio programado"
                  : "Scheduled change"}
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div>
                  {lang === "pt"
                    ? `Novo plano: ${scheduledBillingChangeDescription ?? "—"}`
                    : lang === "es"
                    ? `Nuevo plan: ${scheduledBillingChangeDescription ?? "—"}`
                    : `New plan: ${scheduledBillingChangeDescription ?? "—"}`}
                </div>

                <div>
                  {lang === "pt"
                    ? `Data efetiva: ${scheduledBillingChangeEffectiveAt ?? "—"}`
                    : lang === "es"
                    ? `Fecha efectiva: ${scheduledBillingChangeEffectiveAt ?? "—"}`
                    : `Effective date: ${scheduledBillingChangeEffectiveAt ?? "—"}`}
                </div>
              </div>

              {billingActions.can_cancel_scheduled_change ? (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="product-secondary"
                    disabled={isBillingChangeCancelLoading}
                    onClick={() => void handleBillingChangeCancel()}
                  >
                    {isBillingChangeCancelLoading
                      ? lang === "pt"
                        ? "Cancelando..."
                        : lang === "es"
                        ? "Cancelando..."
                        : "Cancelling..."
                      : lang === "pt"
                      ? "Cancelar mudança agendada"
                      : lang === "es"
                      ? "Cancelar cambio programado"
                      : "Cancel scheduled change"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 16,
            }}
          >
            {billingActions.can_cancel_renewal ? (
              <button
                type="button"
                className="product-secondary"
                disabled={isBillingActionLoading}
                onClick={() => void handleBillingAction("cancel")}
              >
                {isBillingActionLoading
                  ? t(lang, "auth.billingActionProcessing")
                  : t(lang, "auth.billingCancelRenewal")}
              </button>
            ) : null}

            {billingActions.can_resume_renewal ? (
              <button
                type="button"
                className="product-primary"
                disabled={isBillingActionLoading}
                onClick={() => void handleBillingAction("resume")}
              >
                {isBillingActionLoading
                  ? t(lang, "auth.billingActionProcessing")
                  : t(lang, "auth.billingResumeRenewal")}
              </button>
            ) : null}

            <button
              type="button"
              className="product-secondary"
              disabled={isBillingLoading}
              onClick={() => void loadBilling()}
            >
              {t(lang, "auth.billingRefresh")}
            </button>
          </div>
        </article>
      </div>
    </section>

    <AccountPreferencesModal
      open={preferencesOpen}
      lang={lang}
      initialBettorProfile={accountPreferences.bettor_profile}
      kicker={
        lang === "pt"
          ? "Preferências"
          : lang === "es"
          ? "Preferencias"
          : "Preferences"
      }
      title={
        lang === "pt"
          ? "Ajuste seu perfil"
          : lang === "es"
          ? "Ajusta tu perfil"
          : "Adjust your profile"
      }
      subtitle={
        lang === "pt"
          ? "Você pode mudar isso a qualquer momento. Isso ajuda a ajustar o jeito como as análises são explicadas."
          : lang === "es"
          ? "Puedes cambiar esto cuando quieras. Esto ayuda a ajustar la forma en que se explican los análisis."
          : "You can change this anytime. It helps tailor how the analysis is explained."
      }
      confirmLabel={
        lang === "pt"
          ? "Salvar perfil"
          : lang === "es"
          ? "Guardar perfil"
          : "Save profile"
      }
      secondaryLabel={
        lang === "pt"
          ? "Fechar"
          : lang === "es"
          ? "Cerrar"
          : "Close"
      }
      onClose={() => setPreferencesOpen(false)}
      onSave={async (payload) => {
        const nextPayload = {
          ...payload,
          completed_onboarding: true,
        };

        try {
          if (PRODUCT_AUTH_ENABLED && isAuthenticated) {
            const result = await patchAuthAccountPreferences(nextPayload);
            store.applyAccountPreferencesUpdate(result.account_preferences);
          } else {
            store.applyAccountPreferencesUpdate(nextPayload);
          }
        } catch (error) {
          console.error("account preferences save failed", error);
          store.applyAccountPreferencesUpdate(nextPayload);
        }

        setPreferencesOpen(false);
      }}
    />
  </>
);
}