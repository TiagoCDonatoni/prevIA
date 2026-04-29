import React from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";

import type { Lang } from "../../i18n";
import {
  AccessRequestError,
  fetchAccessCampaign,
  postAccessCampaignRedeem,
  type AccessCampaignPayload,
  type AccessCampaignRedeemResponse,
} from "../../product/api/access";
import { clearAuthMeCache, fetchAuthMe, type AuthMeResponse } from "../../product/api/auth";
import { coercePublicLang } from "../lib/publicLang";

const COPY = {
  pt: {
    loading: "Carregando campanha...",
    unavailableTitle: "Campanha indisponível",
    unavailableBody:
      "Este link pode ter expirado, sido pausado ou atingido o limite de vagas.",
    closedTitle: "Campanha encerrada",
    closedBody:
      "Esta rodada de acesso promocional não está mais disponível. Você ainda pode conhecer o prevIA e ver os planos disponíveis.",
    pausedTitle: "Campanha pausada",
    pausedBody:
      "Esta campanha está temporariamente pausada. Você ainda pode conhecer o prevIA pela página inicial.",
    fullTitle: "Vagas preenchidas",
    fullBody:
      "As vagas desta rodada foram preenchidas. Você ainda pode conhecer o prevIA e acompanhar novas oportunidades.",
    landingCta: "Conhecer o prevIA",
    kicker: "Convite beta",
    defaultHeadline: "Teste o prevIA PRO gratuitamente",
    defaultSubheadline: "Acesso por tempo limitado. Sem cartão. Sem cobrança automática.",
    spotsPrefix: "Vagas restantes",
    spotsUnlimited: "Vagas limitadas",
    planLabel: "Plano liberado",
    durationLabel: "Duração",
    days: "dias",
    expiresLabel: "Link válido até",
    offerLabel: "Oferta pós-teste",
    offerSuffix: "de desconto",
    offerDurationOnce: "na primeira cobrança",
    offerDurationRepeating: "por {months} meses",
    offerDurationForever: "para sempre",
    signup: "Criar conta e ativar acesso",
    login: "Já tenho conta",
    activate: "Ativar meu acesso beta",
    activating: "Ativando...",
    activeTitle: "Acesso beta ativado!",
    activeBody: "Seu acesso temporário já está disponível.",
    activeUntil: "Ativo até",
    discountUntil: "Desconto disponível até",
    goToApp: "Entrar no app",
    alreadyRedeemed: "Este convite já foi resgatado para sua conta.",
    authRequired: "Entre ou crie uma conta para ativar este convite.",
    planNotHigher: "Sua conta já possui acesso igual ou superior ao benefício desta campanha.",
    alreadyUsedTrial: "Este convite é válido apenas para novos testadores.",
    limitReached: "As vagas desta rodada beta foram preenchidas.",
    genericError: "Não foi possível ativar este convite agora.",
  },
  en: {
    loading: "Loading campaign...",
    unavailableTitle: "Campaign unavailable",
    unavailableBody:
      "This link may have expired, been paused, or reached its redemption limit.",
    closedTitle: "Campaign closed",
    closedBody:
      "This promotional access round is no longer available. You can still learn about prevIA and view the available plans.",
    pausedTitle: "Campaign paused",
    pausedBody:
      "This campaign is temporarily paused. You can still learn about prevIA on the homepage.",
    fullTitle: "All spots filled",
    fullBody:
      "This round is already full. You can still learn about prevIA and follow future opportunities.",
    landingCta: "Explore prevIA",
    kicker: "Beta invite",
    defaultHeadline: "Try prevIA PRO for free",
    defaultSubheadline: "Limited-time access. No card. No automatic charge.",
    spotsPrefix: "Remaining spots",
    spotsUnlimited: "Limited spots",
    planLabel: "Unlocked plan",
    durationLabel: "Duration",
    days: "days",
    expiresLabel: "Link valid until",
    offerLabel: "Post-trial offer",
    offerSuffix: "discount",
    offerDurationOnce: "on the first charge",
    offerDurationRepeating: "for {months} months",
    offerDurationForever: "forever",
    signup: "Create account and activate",
    login: "I already have an account",
    activate: "Activate my beta access",
    activating: "Activating...",
    activeTitle: "Beta access activated!",
    activeBody: "Your temporary access is now available.",
    activeUntil: "Active until",
    discountUntil: "Discount available until",
    goToApp: "Open app",
    alreadyRedeemed: "This invite has already been redeemed for your account.",
    authRequired: "Sign in or create an account to activate this invite.",
    planNotHigher: "Your account already has equal or higher access than this campaign.",
    alreadyUsedTrial: "This invite is available only for new testers.",
    limitReached: "This beta round is already full.",
    genericError: "Could not activate this invite right now.",
  },
  es: {
    loading: "Cargando campaña...",
    unavailableTitle: "Campaña no disponible",
    unavailableBody:
      "Este enlace puede haber expirado, estar pausado o haber alcanzado el límite de cupos.",
    closedTitle: "Campaña finalizada",
    closedBody:
      "Esta ronda de acceso promocional ya no está disponible. Aún puedes conocer prevIA y ver los planes disponibles.",
    pausedTitle: "Campaña pausada",
    pausedBody:
      "Esta campaña está temporalmente pausada. Aún puedes conocer prevIA desde la página inicial.",
    fullTitle: "Cupos completos",
    fullBody:
      "Los cupos de esta ronda ya fueron ocupados. Aún puedes conocer prevIA y seguir futuras oportunidades.",
    landingCta: "Conocer prevIA",
    kicker: "Invitación beta",
    defaultHeadline: "Prueba prevIA PRO gratis",
    defaultSubheadline: "Acceso por tiempo limitado. Sin tarjeta. Sin cobro automático.",
    spotsPrefix: "Cupos restantes",
    spotsUnlimited: "Cupos limitados",
    planLabel: "Plan liberado",
    durationLabel: "Duración",
    days: "días",
    expiresLabel: "Enlace válido hasta",
    offerLabel: "Oferta post-prueba",
    offerSuffix: "de descuento",
    offerDurationOnce: "en el primer cobro",
    offerDurationRepeating: "por {months} meses",
    offerDurationForever: "para siempre",
    signup: "Crear cuenta y activar acceso",
    login: "Ya tengo cuenta",
    activate: "Activar mi acceso beta",
    activating: "Activando...",
    activeTitle: "¡Acceso beta activado!",
    activeBody: "Tu acceso temporal ya está disponible.",
    activeUntil: "Activo hasta",
    discountUntil: "Descuento disponible hasta",
    goToApp: "Entrar a la app",
    alreadyRedeemed: "Esta invitación ya fue usada en tu cuenta.",
    authRequired: "Entra o crea una cuenta para activar esta invitación.",
    planNotHigher: "Tu cuenta ya tiene acceso igual o superior al beneficio de esta campaña.",
    alreadyUsedTrial: "Esta invitación es válida solo para nuevos testers.",
    limitReached: "Los cupos de esta ronda beta ya fueron ocupados.",
    genericError: "No fue posible activar esta invitación ahora.",
  },
} as const;

function formatDate(value: string | null | undefined, lang: Lang): string {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

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
}

function getCampaignHeadline(campaign: AccessCampaignPayload, lang: Lang): string {
  const metadataHeadline = String(campaign.metadata?.headline || "").trim();
  if (metadataHeadline) return metadataHeadline;

  return COPY[lang].defaultHeadline;
}

function getCampaignSubheadline(campaign: AccessCampaignPayload, lang: Lang): string {
  const metadataSubheadline = String(campaign.metadata?.subheadline || "").trim();
  if (metadataSubheadline) return metadataSubheadline;

  return COPY[lang].defaultSubheadline;
}

function formatOfferDuration(campaign: AccessCampaignPayload, lang: Lang): string {
  const offer = campaign.offer;
  const copy = COPY[lang];

  if (!offer) return "";

  if (offer.discount_duration === "once") return copy.offerDurationOnce;
  if (offer.discount_duration === "forever") return copy.offerDurationForever;

  return copy.offerDurationRepeating.replace(
    "{months}",
    String(offer.discount_duration_months ?? 1)
  );
}

function mapRedeemError(lang: Lang, err: unknown): string {
  const copy = COPY[lang];

  if (err instanceof AccessRequestError) {
    if (err.code === "AUTH_REQUIRED") return copy.authRequired;
    if (err.code === "PLAN_NOT_HIGHER") return copy.planNotHigher;
    if (err.code === "ALREADY_USED_TRIAL") return copy.alreadyUsedTrial;
    if (err.code === "CAMPAIGN_LIMIT_REACHED") return copy.limitReached;
  }

  return copy.genericError;
}

function getCampaignClosedState(
  campaign: AccessCampaignPayload,
  lang: Lang
): { title: string; body: string } | null {
  const copy = COPY[lang];
  const status = String(campaign.status || "").toLowerCase();
  const remaining = campaign.limits.remaining_redemptions;

  if (status === "closed" || status === "archived") {
    return {
      title: copy.closedTitle,
      body: copy.closedBody,
    };
  }

  if (status === "paused") {
    return {
      title: copy.pausedTitle,
      body: copy.pausedBody,
    };
  }

  if (status === "expired") {
    return {
      title: copy.closedTitle,
      body: copy.closedBody,
    };
  }

  if (remaining !== null && remaining <= 0) {
    return {
      title: copy.fullTitle,
      body: copy.fullBody,
    };
  }

  return null;
}

export function PublicBetaCampaignPage() {
  const params = useParams<{ lang: string; slug: string }>();
  const lang = coercePublicLang(params.lang);
  const slug = String(params.slug || "").trim().toLowerCase();
  const copy = COPY[lang];

  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [campaign, setCampaign] = React.useState<AccessCampaignPayload | null>(null);
  const [auth, setAuth] = React.useState<AuthMeResponse | null>(null);
  const [redeemResult, setRedeemResult] =
    React.useState<AccessCampaignRedeemResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [redeeming, setRedeeming] = React.useState(false);
  const [errorText, setErrorText] = React.useState("");

  const autoRedeemStartedRef = React.useRef(false);

  const isAuthenticated = Boolean(auth?.is_authenticated);
  const activeGrant = auth?.access?.active_grant ?? null;
  const discountEligibility = auth?.access?.discount_eligibility ?? null;
  const hasActiveCampaignGrant =
    Boolean(activeGrant?.campaign_slug) && activeGrant?.campaign_slug === slug;

  const currentPath = `${location.pathname}${location.search}`;
  const redeemFlag = searchParams.get("redeem");
  const nextAfterAuth = `${location.pathname}?redeem=1`;

  const signupUrl = `/${lang}/beta/${slug}?auth=signup&next=${encodeURIComponent(
    nextAfterAuth
  )}`;
  const loginUrl = `/${lang}/beta/${slug}?auth=login&next=${encodeURIComponent(
    nextAfterAuth
  )}`;

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErrorText("");

      try {
        const [campaignPayload, authPayload] = await Promise.all([
          fetchAccessCampaign(slug),
          fetchAuthMe(),
        ]);

        if (cancelled) return;

        setCampaign(campaignPayload);
        setAuth(authPayload);
      } catch (err) {
        console.error("beta campaign load failed", err);
        if (cancelled) return;
        setErrorText(copy.unavailableBody);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (slug) {
      void run();
    } else {
      setLoading(false);
      setErrorText(copy.unavailableBody);
    }

    return () => {
      cancelled = true;
    };
  }, [slug, copy.unavailableBody]);

  async function redeemCampaign() {
    if (!slug || redeeming) return;

    setRedeeming(true);
    setErrorText("");

    try {
      const result = await postAccessCampaignRedeem(slug);
      setRedeemResult(result);

      clearAuthMeCache();
      const refreshed = await fetchAuthMe();
      setAuth(refreshed);

      if (searchParams.get("redeem")) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("redeem");
        setSearchParams(nextParams, { replace: true });
      }
    } catch (err) {
      console.error("beta campaign redeem failed", err);
      setErrorText(mapRedeemError(lang, err));
    } finally {
      setRedeeming(false);
    }
  }

  React.useEffect(() => {
    if (loading) return;
    if (!campaign) return;
    if (redeemFlag !== "1") return;

    let cancelled = false;

    async function refreshAuthAfterPublicLogin() {
      try {
        clearAuthMeCache();
        const refreshed = await fetchAuthMe();

        if (cancelled) return;

        setAuth(refreshed);
      } catch (err) {
        console.error("beta campaign auth refresh after login failed", err);
      }
    }

    void refreshAuthAfterPublicLogin();

    return () => {
      cancelled = true;
    };
  }, [loading, campaign, redeemFlag]);

  React.useEffect(() => {
    if (autoRedeemStartedRef.current) return;
    if (loading) return;
    if (!isAuthenticated) return;
    if (!campaign) return;
    if (hasActiveCampaignGrant) return;
    if (redeemFlag !== "1") return;

    autoRedeemStartedRef.current = true;
    void redeemCampaign();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated, campaign, hasActiveCampaignGrant, redeemFlag]);

  if (loading) {
    return (
      <main className="public-beta-page">
        <section className="public-beta-card">
          <div className="public-beta-kicker">{copy.kicker}</div>
          <h1>{copy.loading}</h1>
        </section>
      </main>
    );
  }

  if (!campaign || errorText) {
    return (
      <main className="public-beta-page">
        <section className="public-beta-card public-beta-card--center">
          <div className="public-beta-kicker">{copy.kicker}</div>
          <h1>{copy.unavailableTitle}</h1>
          <p>{errorText || copy.unavailableBody}</p>
          <Link to={`/${lang}`} className="public-btn public-btn-primary">
            {copy.landingCta}
          </Link>
        </section>
      </main>
    );
  }

  const closedState = getCampaignClosedState(campaign, lang);

  if (closedState) {
    return (
      <main className="public-beta-page">
        <section className="public-beta-card public-beta-card--center public-beta-card--closed">
          <div className="public-beta-kicker">{copy.kicker}</div>
          <h1>{closedState.title}</h1>
          <p>{closedState.body}</p>

          <div className="public-beta-closed-meta">
            <span>{campaign.label}</span>
          </div>

          <Link to={`/${lang}`} className="public-btn public-btn-primary">
            {copy.landingCta}
          </Link>
        </section>
      </main>
    );
  }

  const remaining = campaign.limits.remaining_redemptions;
  const offerDuration = formatOfferDuration(campaign, lang);
  const offer = campaign.offer;
  const successGrant = redeemResult && "grant" in redeemResult ? redeemResult.grant : null;

  return (
    <main className="public-beta-page">
      <section className="public-beta-hero">
        <div className="public-beta-card">
          <div className="public-beta-kicker">{copy.kicker}</div>

          <h1>{getCampaignHeadline(campaign, lang)}</h1>

          <p className="public-beta-lead">{getCampaignSubheadline(campaign, lang)}</p>

          <div className="public-beta-summary-grid">
            <div className="public-beta-summary-item">
              <span>{copy.planLabel}</span>
              <strong>{campaign.trial.plan_code}</strong>
            </div>

            <div className="public-beta-summary-item">
              <span>{copy.durationLabel}</span>
              <strong>
                {campaign.trial.duration_days ?? "-"} {copy.days}
              </strong>
            </div>

            <div className="public-beta-summary-item">
              <span>{copy.expiresLabel}</span>
              <strong>{formatDate(campaign.limits.expires_at_utc, lang)}</strong>
            </div>

            <div className="public-beta-summary-item">
              <span>{remaining === null ? copy.spotsUnlimited : copy.spotsPrefix}</span>
              <strong>{remaining === null ? "—" : remaining}</strong>
            </div>
          </div>

          {offer?.discount_percent ? (
            <div className="public-beta-offer">
              <span>{copy.offerLabel}</span>
              <strong>
                {offer.discount_percent}% {copy.offerSuffix} {offerDuration}
              </strong>
            </div>
          ) : null}

          {hasActiveCampaignGrant || redeemResult?.ok ? (
            <div className="public-beta-success">
              <h2>{copy.activeTitle}</h2>
              <p>{copy.activeBody}</p>

              <div className="public-beta-success-meta">
                <span>
                  {copy.activeUntil}:{" "}
                  <strong>
                    {formatDate(
                      activeGrant?.ends_at_utc ?? successGrant?.ends_at_utc ?? null,
                      lang
                    )}
                  </strong>
                </span>

                {discountEligibility?.ends_at_utc ? (
                  <span>
                    {copy.discountUntil}:{" "}
                    <strong>{formatDate(discountEligibility.ends_at_utc, lang)}</strong>
                  </span>
                ) : null}
              </div>

              <Link to="/app" className="public-btn public-btn-primary public-beta-main-cta">
                {copy.goToApp}
              </Link>
            </div>
          ) : (
            <div className="public-beta-actions">
              {!isAuthenticated ? (
                <>
                  <Link to={signupUrl} className="public-btn public-btn-primary public-beta-main-cta">
                    {copy.signup}
                  </Link>

                  <Link to={loginUrl} className="public-btn public-btn-secondary">
                    {copy.login}
                  </Link>
                </>
              ) : (
                <button
                  type="button"
                  className="public-btn public-btn-primary public-beta-main-cta"
                  disabled={redeeming}
                  onClick={() => void redeemCampaign()}
                >
                  {redeeming ? copy.activating : copy.activate}
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="public-beta-side-card">
          <div className="public-beta-side-title">{campaign.label}</div>
          <p>
            {campaign.trial.plan_code} · {campaign.trial.duration_days} {copy.days}
          </p>
          <p className="public-beta-side-muted">
            {currentPath.includes("/campanha/")
              ? "Campanha promocional de acesso."
              : "Rodada beta com acesso temporário controlado."}
          </p>
        </aside>
      </section>
    </main>
  );
}