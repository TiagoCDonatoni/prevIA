import React from "react";
import type { Lang } from "../../product/i18n";
import { ProductIndexSurface } from "../../product/runtime/ProductIndexSurface";
import { ProductRuntime } from "../../product/runtime/ProductRuntime";
import { useProductStore } from "../../product/state/productStore";

const EMBED_COPY: Record<
  Lang,
  {
    guestLabel: string;
    authLabel: string;
    remainingText: (remaining: number, limit: number) => string;
    exhaustedText: (limit: number) => string;
    authenticatedText: string;
  }
> = {
  pt: {
    guestLabel: "Modo gratuito",
    authLabel: "Conta conectada",
    remainingText: (remaining, limit) =>
      `Você ainda tem ${remaining} de ${limit} consultas grátis hoje. Crie sua conta grátis e ganhe +2 consultas por dia para continuar explorando.`,
    exhaustedText: (limit) =>
      `Suas ${limit} consultas grátis de hoje terminaram. Crie sua conta grátis agora e ganhe +2 consultas por dia para continuar, ou assine um plano para desbloquear ainda mais análises.`,
    authenticatedText:
      "Sua conta está ativa. Agora você tem mais consultas por dia para continuar explorando.",
  },

  en: {
    guestLabel: "Free mode",
    authLabel: "Signed-in account",
    remainingText: (remaining, limit) =>
      `You still have ${remaining} of ${limit} free checks today. Create your free account and get +2 checks per day to keep exploring.`,
    exhaustedText: (limit) =>
      `Your ${limit} free checks for today are over. Create your free account now and get +2 checks per day to continue, or upgrade your plan to unlock even more analysis.`,
    authenticatedText:
      "Your account is active. You now have more checks per day to keep exploring.",
  },

  es: {
    guestLabel: "Modo gratuito",
    authLabel: "Cuenta conectada",
    remainingText: (remaining, limit) =>
      `Todavía tienes ${remaining} de ${limit} consultas gratis hoy. Crea tu cuenta gratis y consigue +2 consultas por día para seguir explorando.`,
    exhaustedText: (limit) =>
      `Tus ${limit} consultas gratis de hoy ya terminaron. Crea tu cuenta gratis ahora y consigue +2 consultas por día para continuar, o mejora tu plan para desbloquear todavía más análisis.`,
    authenticatedText:
      "Tu cuenta está activa. Ahora tienes más consultas por día para seguir explorando.",
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

  const kicker = isAuthenticated ? copy.authLabel : copy.guestLabel;

  const caption = isAuthenticated
    ? copy.authenticatedText
    : remaining > 0
    ? copy.remainingText(remaining, limit)
    : copy.exhaustedText(limit);

  return (
    <div className="public-product-embed-card">
      <div className="public-product-embed-toolbar">
        <div>
          <div className="public-product-embed-kicker">{kicker}</div>
          <div className="public-product-embed-caption">{caption}</div>
        </div>
      </div>

      <div className="public-product-embed-surface">
        <ProductIndexSurface lang={lang} />
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
  return (
    <section className="landing-section">
      <div className="landing-section-head compact">
        <div className="public-eyebrow">{eyebrow}</div>
        <h2 className="landing-section-title">{title}</h2>
        <p className="landing-section-body">{body}</p>
      </div>

      <ProductRuntime>
        <PublicFreeAnonEmbedInner lang={lang} />
      </ProductRuntime>
    </section>
  );
}