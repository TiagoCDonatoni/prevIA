import React from "react";
import type { Lang } from "../../product/i18n";
import { ProductIndexSurface } from "../../product/runtime/ProductIndexSurface";
import { ProductRuntime } from "../../product/runtime/ProductRuntime";
import { useProductStore } from "../../product/state/productStore";
import { trackProductTelemetry } from "../telemetry/productTelemetry";

const EMBED_COPY: Record<
  Lang,
  {
    guestLabel: string;
    authLabel: string;
    remainingText: (remaining: number, limit: number) => string;
    exhaustedText: (limit: number) => string;
    authenticatedText: string;
    loadingTitle: string;
    loadingBody: string;
    statusPills: string[];
  }
> = {
  pt: {
    guestLabel: "Teste gratuito ativo",
    authLabel: "Conta conectada",
    remainingText: (remaining, limit) =>
      `Você tem ${remaining} de ${limit} consultas grátis hoje. Abra uma análise agora ou crie uma conta grátis para continuar explorando com mais limite diário.`,
    exhaustedText: (limit) =>
      `Suas ${limit} consultas grátis de hoje terminaram. Crie sua conta grátis para continuar explorando ou assine um plano para desbloquear mais análises.`,
    authenticatedText:
      "Sua conta está ativa. Agora você pode continuar explorando com os limites do seu plano.",
    loadingTitle: "Preparando teste gratuito",
    loadingBody:
      "O produto será carregado quando esta seção entrar em foco para manter a landing rápida.",
    statusPills: ["Sem conta para começar", "3 consultas grátis por dia", "Sem cartão de crédito"],
  },

  en: {
    guestLabel: "Free test active",
    authLabel: "Signed-in account",
    remainingText: (remaining, limit) =>
      `You have ${remaining} of ${limit} free checks today. Open an analysis now or create a free account to keep exploring with a higher daily limit.`,
    exhaustedText: (limit) =>
      `Your ${limit} free checks for today are over. Create a free account to keep exploring or upgrade your plan to unlock more analyses.`,
    authenticatedText:
      "Your account is active. You can now keep exploring within your plan limits.",
    loadingTitle: "Preparing free test",
    loadingBody:
      "The product will load when this section comes into view to keep the landing page fast.",
    statusPills: ["No account to start", "3 free checks per day", "No credit card required"],
  },

  es: {
    guestLabel: "Prueba gratuita activa",
    authLabel: "Cuenta conectada",
    remainingText: (remaining, limit) =>
      `Tienes ${remaining} de ${limit} consultas gratis hoy. Abre un análisis ahora o crea una cuenta gratis para seguir explorando con más límite diario.`,
    exhaustedText: (limit) =>
      `Tus ${limit} consultas gratis de hoy ya terminaron. Crea una cuenta gratis para seguir explorando o mejora tu plan para desbloquear más análisis.`,
    authenticatedText:
      "Tu cuenta está activa. Ahora puedes seguir explorando con los límites de tu plan.",
    loadingTitle: "Preparando prueba gratuita",
    loadingBody:
      "El producto se cargará cuando esta sección entre en foco para mantener la landing rápida.",
    statusPills: ["Sin cuenta para empezar", "3 consultas gratis por día", "Sin tarjeta de crédito"],
  },
};

function PublicFreeAnonEmbedInner({ lang }: { lang: Lang }) {
  const store = useProductStore();
  const isAuthenticated = Boolean(store.state.auth.is_logged_in);

  const remaining = store.backendUsage.is_ready
    ? store.backendUsage.remaining ?? store.entitlements.credits.remaining_today
    : store.entitlements.credits.remaining_today;

  const limit = store.backendUsage.is_ready
    ? store.backendUsage.daily_limit ?? store.entitlements.credits.daily_limit
    : store.entitlements.credits.daily_limit;

  const copy = EMBED_COPY[lang] ?? EMBED_COPY.pt;

  React.useEffect(() => {
    trackProductTelemetry("public_free_anon_embed_loaded", {
      surface: "public_embed",
      actor_type: isAuthenticated ? "user" : "anonymous",
      plan_code: isAuthenticated ? store.entitlements.plan : "FREE_ANON",
      auth_mode: isAuthenticated ? store.bootstrap.auth_mode ?? "session" : "anonymous",
      lang,
    });
  }, [isAuthenticated, lang, store.bootstrap.auth_mode, store.entitlements.plan]);

  const kicker = isAuthenticated ? copy.authLabel : copy.guestLabel;

  const caption = isAuthenticated
    ? copy.authenticatedText
    : remaining > 0
    ? copy.remainingText(remaining, limit)
    : copy.exhaustedText(limit);

  return (
    <div className="public-product-embed-card">
      <div className="public-product-embed-toolbar">
        <div className="public-product-embed-toolbar-copy">
          <div className="public-product-embed-kicker">{kicker}</div>
          <div className="public-product-embed-caption">{caption}</div>
        </div>

        <div className="public-product-embed-toolbar-pills" aria-label={kicker}>
          {copy.statusPills.map((pill) => (
            <span key={pill} className="public-product-embed-pill">
              {pill}
            </span>
          ))}
        </div>
      </div>

      <div className="public-product-embed-surface">
        <ProductIndexSurface lang={lang} mode="public_embed" />
      </div>
    </div>
  );
}

export function PublicFreeAnonEmbed({
  lang,
  eyebrow,
  title,
  body,
}: {
  lang: Lang;
  eyebrow: string;
  title: string;
  body: string;
}) {
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const [shouldMountEmbed, setShouldMountEmbed] = React.useState(false);
  const copy = EMBED_COPY[lang] ?? EMBED_COPY.pt;

  React.useEffect(() => {
    if (shouldMountEmbed) return;

    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) return;

        trackProductTelemetry("public_free_anon_embed_viewed", {
          surface: "landing",
          actor_type: "anonymous",
          plan_code: "FREE_ANON",
          auth_mode: "anonymous",
          lang,
        });

        setShouldMountEmbed(true);
        observer.disconnect();
      },
      {
        root: null,
        rootMargin: "280px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [lang, shouldMountEmbed]);

  return (
    <section ref={sectionRef} className="landing-section">
      <div className="landing-section-head compact">
        <div className="public-eyebrow">{eyebrow}</div>
        <h2 className="landing-section-title">{title}</h2>
        <p className="landing-section-body">{body}</p>
      </div>

      {shouldMountEmbed ? (
        <ProductRuntime>
          <PublicFreeAnonEmbedInner lang={lang} />
        </ProductRuntime>
      ) : (
        <div className="public-product-embed-card">
          <div className="public-product-embed-toolbar">
            <div className="public-product-embed-toolbar-copy">
              <div className="public-product-embed-kicker">{copy.loadingTitle}</div>
              <div className="public-product-embed-caption">{copy.loadingBody}</div>
            </div>

            <div className="public-product-embed-toolbar-pills" aria-label={copy.loadingTitle}>
              {copy.statusPills.map((pill) => (
                <span key={pill} className="public-product-embed-pill">
                  {pill}
                </span>
              ))}
            </div>
          </div>

          <div className="public-product-embed-surface" />
        </div>
      )}
    </section>
  );
}