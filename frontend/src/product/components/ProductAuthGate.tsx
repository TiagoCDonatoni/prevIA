import React from "react";
import { Link } from "react-router-dom";

import BrandLogo from "../../shared/BrandLogo";
import { t, type Lang } from "../i18n";

type CopyBlock = {
  kicker: string;
  title: string;
  body: string;
  loadingTitle: string;
  loadingBody: string;
  forgot: string;
  backToSite: string;
};

const COPY: Record<Lang, CopyBlock> = {
  pt: {
    kicker: "Acesso protegido",
    title: "Entre para acessar o app",
    body:
      "O /app continua acessível por link direto, mas agora exige autenticação antes de liberar o produto.",
    loadingTitle: "Validando sua sessão",
    loadingBody:
      "Estamos verificando se você já tem uma sessão ativa para entrar direto no app.",
    forgot: "Esqueci minha senha",
    backToSite: "Voltar ao site",
  },
  en: {
    kicker: "Protected access",
    title: "Sign in to access the app",
    body:
      "The /app remains directly accessible by URL, but it now requires authentication before opening the product.",
    loadingTitle: "Checking your session",
    loadingBody:
      "We are verifying whether you already have an active session so you can enter the app directly.",
    forgot: "Forgot password",
    backToSite: "Back to site",
  },
  es: {
    kicker: "Acceso protegido",
    title: "Inicia sesión para acceder a la app",
    body:
      "La ruta /app sigue disponible por enlace directo, pero ahora exige autenticación antes de abrir el producto.",
    loadingTitle: "Validando tu sesión",
    loadingBody:
      "Estamos verificando si ya tienes una sesión activa para entrar directamente en la app.",
    forgot: "Olvidé mi contraseña",
    backToSite: "Volver al sitio",
  },
};

export function ProductAuthGate(props: {
  lang: Lang;
  loading?: boolean;
  busy?: boolean;
  onLogin?: () => void;
  onSignup?: () => void;
  onForgot?: () => void;
}) {
  const { lang, loading = false, busy = false, onLogin, onSignup, onForgot } = props;
  const copy = COPY[lang];

  return (
    <div className="product-auth-gate">
      <div className="product-auth-gate-card">
        <Link to={`/${lang}`} className="product-auth-gate-brand" aria-label="prevIA home">
          <BrandLogo />
        </Link>

        <div className="product-auth-gate-kicker">{copy.kicker}</div>

        <h1 className="product-auth-gate-title">
          {loading ? copy.loadingTitle : copy.title}
        </h1>

        <p className="product-auth-gate-body">
          {loading ? copy.loadingBody : copy.body}
        </p>

        {loading ? (
          <div className="product-auth-gate-loading" aria-live="polite">
            <span className="product-auth-gate-spinner" aria-hidden="true" />
            <span>
              {lang === "pt"
                ? "Carregando..."
                : lang === "es"
                ? "Cargando..."
                : "Loading..."}
            </span>
          </div>
        ) : (
          <>
            <div className="product-auth-gate-actions">
              <button
                type="button"
                className="product-auth-login-btn"
                onClick={onLogin}
                disabled={busy}
              >
                {t(lang, "auth.login")}
              </button>

              <button
                type="button"
                className="pl-credits-cta"
                onClick={onSignup}
                disabled={busy}
              >
                {t(lang, "auth.signup")}
              </button>
            </div>

            <div className="product-auth-gate-secondary">
              <button
                type="button"
                className="product-auth-gate-link"
                onClick={onForgot}
                disabled={busy}
              >
                {copy.forgot}
              </button>

              <Link to={`/${lang}`} className="product-auth-gate-link">
                {copy.backToSite}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}