import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AuthRequestError,
  postAuthChangePassword,
  postAuthForgotPassword,
  postAuthGoogleLogin,
  postAuthLogin,
  postAuthResetPassword,
  postAuthSignup,
  type AuthMeResponse,
} from "../api/auth";
import { t, type Lang } from "../i18n";

type Mode = "login" | "signup" | "forgot" | "reset" | "changePassword";

let googleIdentityScriptPromise: Promise<void> | null = null;
let googleIdentityScriptUrl = "";
let googleIdentityInitializedClientId = "";
let googleIdentityCredentialHandler: ((credential: string) => void) | null = null;

function ensureGoogleIdentityScript(hl: string): Promise<void> {
  const scriptSrc = `https://accounts.google.com/gsi/client?hl=${encodeURIComponent(hl)}`;

  if (
    googleIdentityScriptPromise &&
    googleIdentityScriptUrl === scriptSrc &&
    window.google?.accounts?.id
  ) {
    return googleIdentityScriptPromise;
  }

  if (googleIdentityScriptPromise && googleIdentityScriptUrl === scriptSrc) {
    return googleIdentityScriptPromise;
  }

  googleIdentityScriptUrl = scriptSrc;
  googleIdentityInitializedClientId = "";

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-google-gsi="true"]'
    );

    if (existingScript?.src === scriptSrc && window.google?.accounts?.id) {
      resolve();
      return;
    }

    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = "true";

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity script"));

    document.body.appendChild(script);
  });

  return googleIdentityScriptPromise;
}

function ensureGoogleIdentityInitialized(clientId: string) {
  if (!window.google?.accounts?.id) return;
  if (googleIdentityInitializedClientId === clientId) return;

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      const credential = String(response.credential || "");
      googleIdentityCredentialHandler?.(credential);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
  });

  googleIdentityInitializedClientId = clientId;
}

function mapAuthErrorCode(langT: (k: string) => string, code?: string): string {
  if (code === "INVALID_EMAIL") return langT("auth.errorInvalidEmail");
  if (code === "WEAK_PASSWORD") return langT("auth.errorWeakPassword");
  if (code === "EMAIL_ALREADY_EXISTS") return langT("auth.errorEmailAlreadyExists");
  if (code === "INVALID_CREDENTIALS") return langT("auth.errorInvalidCredentials");
  if (code === "ACCOUNT_BLOCKED") return langT("auth.errorAccountBlocked");
  if (code === "INVALID_RESET_TOKEN") return langT("auth.errorInvalidResetToken");
  if (code === "INVALID_GOOGLE_CREDENTIAL") return langT("auth.errorInvalidGoogleCredential");
  if (code === "INVALID_CURRENT_PASSWORD") return langT("auth.errorInvalidCurrentPassword");
  if (code === "AUTH_REQUIRED") return langT("auth.errorAuthRequired");
  if (code === "PASSWORD_AUTH_NOT_AVAILABLE") return langT("auth.errorPasswordAuthNotAvailable");
  if (code === "PASSWORD_SAME_AS_CURRENT") return langT("auth.changePasswordSameAsCurrent");
  return langT("auth.genericError");
}

function getTitle(tr: (k: string) => string, mode: Mode) {
  if (mode === "signup") return tr("auth.signupTitle");
  if (mode === "forgot") return tr("auth.forgotTitle");
  if (mode === "reset") return tr("auth.resetTitle");
  if (mode === "changePassword") return tr("auth.changePasswordTitle");
  return tr("auth.loginTitle");
}

function getSubtitle(tr: (k: string) => string, mode: Mode) {
  if (mode === "signup") return tr("auth.signupBenefit");
  if (mode === "forgot") return tr("auth.forgotSubtitle");
  if (mode === "reset") return tr("auth.resetSubtitle");
  if (mode === "changePassword") return tr("auth.changePasswordSubtitle");
  return tr("auth.loginSubtitle");
}

function clearFeedback(
  setErrorText: (value: string) => void,
  setInfoText: (value: string) => void
) {
  setErrorText("");
  setInfoText("");
}

export function ProductAuthModal(props: {
  open: boolean;
  lang: Lang;
  initialMode?: Mode;
  initialResetToken?: string;
  onClose: () => void;
  onAuthSuccess: (payload: AuthMeResponse) => void | Promise<void>;
}) {
  const { open, lang } = props;
  const authEnabled =
    String(import.meta.env.VITE_PRODUCT_AUTH_ENABLED ?? "false").toLowerCase() === "true";
  const googleAuthEnabled =
    String(import.meta.env.VITE_PRODUCT_GOOGLE_AUTH_ENABLED ?? "false").toLowerCase() === "true";
  const googleClientId = String(import.meta.env.VITE_PRODUCT_GOOGLE_CLIENT_ID ?? "").trim();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleCredentialHandlerRef = useRef<(credential: string) => void>(() => {});
  const googleLoginInFlightRef = useRef(false);
  const googleInitializedRef = useRef(false);

  const [mode, setMode] = useState<Mode>(props.initialMode ?? "signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [infoText, setInfoText] = useState("");

  const tr = useMemo(() => (k: string, vars?: Record<string, any>) => t(lang, k, vars), [lang]);
  const initialMode = props.initialMode ?? "signup";
  const initialResetToken = props.initialResetToken ?? "";
  const hasInitialResetToken = initialResetToken.trim().length > 0;
  const canStepBack = mode === "forgot" || mode === "reset";
  const secondaryActionLabel =
    mode === "changePassword"
      ? tr("auth.cancel")
      : canStepBack
      ? tr("common.back")
      : tr("common.notNow");

  function resetFeedback() {
    clearFeedback(setErrorText, setInfoText);
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setPassword("");
    setCurrentPassword("");
    setConfirmPassword("");

    if (nextMode === "reset" && hasInitialResetToken) {
      setResetToken(initialResetToken);
    } else {
      setResetToken("");
    }

    resetFeedback();
  }

  function closeModal() {
    if (busy) return;
    props.onClose();
  }

  function handleSecondaryAction() {
    if (busy) return;

    if (mode === "forgot" || mode === "reset") {
      switchMode("login");
      return;
    }

    props.onClose();
  }

  useEffect(() => {
    if (!open) return;

    setMode(initialMode);
    resetFeedback();
    setPassword("");
    setCurrentPassword("");
    setConfirmPassword("");

    if (initialMode === "reset" && hasInitialResetToken) {
      setResetToken(initialResetToken);
    } else {
      setResetToken("");
    }
  }, [open, initialMode, initialResetToken, hasInitialResetToken]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, busy]);

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      if (!credential) {
        setErrorText(tr("auth.errorInvalidGoogleCredential"));
        return;
      }

      setBusy(true);
      setErrorText("");
      setInfoText("");

      try {
        const authPayload = await postAuthGoogleLogin({ credential });
        await props.onAuthSuccess(authPayload);
      } catch (err) {
        if (err instanceof AuthRequestError) {
          setErrorText(mapAuthErrorCode(tr, err.code));
        } else {
          setErrorText(tr("auth.genericError"));
        }
      } finally {
        setBusy(false);
      }
    },
    [props, tr]
  );

  useEffect(() => {
    googleCredentialHandlerRef.current = (credential: string) => {
      void handleGoogleCredential(credential);
    };
  }, [handleGoogleCredential]);

  const googleLocale =
    lang === "pt" ? "pt-BR" : lang === "es" ? "es-419" : "en";

  const googleScriptHl =
    lang === "pt" ? "pt-BR" : lang === "es" ? "es-419" : "en";

  useEffect(() => {
    if (!open || !authEnabled) return;
    if (!googleAuthEnabled || !googleClientId) return;
    if (mode !== "login" && mode !== "signup") return;
    if (!googleButtonRef.current) return;

    let cancelled = false;

    async function renderGoogleButton() {
      try {
        await ensureGoogleIdentityScript(googleScriptHl);

        if (cancelled) return;
        if (!googleButtonRef.current) return;
        if (!window.google?.accounts?.id) return;

        googleIdentityCredentialHandler = (credential: string) => {
          if (cancelled) return;
          googleCredentialHandlerRef.current(credential);
        };

        ensureGoogleIdentityInitialized(googleClientId);

        googleButtonRef.current.innerHTML = "";

        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          text: mode === "signup" ? "signup_with" : "signin_with",
          locale: googleLocale,
          shape: "rectangular",
          logo_alignment: "left",
          width: 320,
        });
      } catch (err) {
        console.error("google identity script load failed", err);
      }
    }

    void renderGoogleButton();

    return () => {
      cancelled = true;

      if (googleIdentityCredentialHandler) {
        googleIdentityCredentialHandler = null;
      }

      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = "";
      }
    };
  }, [
    open,
    authEnabled,
    googleAuthEnabled,
    googleClientId,
    mode,
    googleLocale,
    googleScriptHl,
  ]);

  if (!open || !authEnabled) return null;

  function getChangePasswordClientError(): string {
    if (mode !== "changePassword") return "";

    if (!currentPassword.trim()) return tr("auth.changePasswordCurrentRequired");
    if (!password.trim()) return tr("auth.changePasswordNewRequired");
    if (!confirmPassword.trim()) return tr("auth.changePasswordConfirmRequired");
    if (password !== confirmPassword) return tr("auth.changePasswordConfirmMismatch");
    if (currentPassword === password) return tr("auth.changePasswordSameAsCurrent");
    if (password.length < 8) return tr("auth.errorWeakPassword");

    return "";
  }

  async function submit() {
    if (mode === "signup") {
      if (!email.trim() || !password.trim() || !fullName.trim()) return;
    } else if (mode === "login") {
      if (!email.trim() || !password.trim()) return;
    } else if (mode === "forgot") {
      if (!email.trim()) return;
    } else if (mode === "reset") {
      if (!resetToken.trim() || !password.trim()) return;
    } else if (!currentPassword.trim() || !password.trim() || !confirmPassword.trim()) {
      return;
    }

    const clientError = getChangePasswordClientError();
    if (clientError) {
      setErrorText(clientError);
      setInfoText("");
      return;
    }

    setBusy(true);
    resetFeedback();

    try {
      if (mode === "signup") {
        const authPayload = await postAuthSignup({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
        });
        await props.onAuthSuccess(authPayload);
        return;
      }

      if (mode === "login") {
        const authPayload = await postAuthLogin({
          email: email.trim(),
          password,
        });
        await props.onAuthSuccess(authPayload);
        return;
      }

      if (mode === "forgot") {
        const response = await postAuthForgotPassword({
          email: email.trim(),
        });

        if (response.debug?.reset_token) {
          setResetToken(response.debug.reset_token);
          setMode("reset");
          setInfoText(tr("auth.resetDebugTokenReady"));
          return;
        }

        setInfoText(tr("auth.forgotSuccess"));
        return;
      }

      if (mode === "changePassword") {
        await postAuthChangePassword({
          current_password: currentPassword,
          new_password: password,
        });

        setCurrentPassword("");
        setPassword("");
        setConfirmPassword("");
        setInfoText(tr("auth.changePasswordSuccess"));
        return;
      }

      await postAuthResetPassword({
        token: resetToken.trim(),
        new_password: password,
      });

      setPassword("");
      setMode("login");
      setInfoText(tr("auth.resetSuccess"));
    } catch (err) {
      if (err instanceof AuthRequestError) {
        setErrorText(mapAuthErrorCode(tr, err.code));
      } else {
        setErrorText(tr("auth.genericError"));
      }
    } finally {
      setBusy(false);
    }
  }

  const actionLabel =
    mode === "signup"
      ? tr("auth.createAccountAction")
      : mode === "login"
      ? tr("auth.loginAction")
      : mode === "forgot"
      ? tr("auth.forgotAction")
      : mode === "changePassword"
      ? tr("auth.changePasswordAction")
      : tr("auth.resetAction");

  const isChangePasswordDisabled =
    mode === "changePassword" &&
    (!currentPassword.trim() ||
      !password.trim() ||
      !confirmPassword.trim() ||
      password !== confirmPassword ||
      currentPassword === password ||
      password.length < 8);

  return (
    <div
      className="um-overlay"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        closeModal();
      }}
    >
      <div
        className="um-modal product-auth-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="product-modal-head">
          <div className="product-modal-head-copy">
            <div className="product-modal-kicker">prevIA</div>
            <div className="product-modal-title">{getTitle(tr, mode)}</div>
            <div className="product-modal-subtitle">{getSubtitle(tr, mode)}</div>
          </div>

          <button
            type="button"
            className="product-modal-close"
            onClick={closeModal}
            aria-label={tr("common.close")}
            disabled={busy}
          >
            ×
          </button>
        </div>

        <div className="product-modal-body">
          {(mode === "login" || mode === "signup") && googleAuthEnabled && googleClientId ? (
            <>
              <div className="product-google-slot">
                <div ref={googleButtonRef} />
              </div>
              <div className="product-auth-divider">
                <span>{tr("auth.orContinueWithEmail")}</span>
              </div>
            </>
          ) : null}

          {mode === "reset" && !hasInitialResetToken ? (
            <label className="product-field">
              <span>{tr("auth.resetToken")}</span>
              <input
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder={tr("auth.resetTokenPlaceholder")}
              />
            </label>
          ) : null}

          {mode === "signup" ? (
            <label className="product-field">
              <span>{tr("auth.fullName")}</span>
              <input
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={tr("auth.fullNamePlaceholder")}
              />
            </label>
          ) : null}

          {mode !== "reset" && mode !== "changePassword" ? (
            <label className="product-field">
              <span>{tr("auth.email")}</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
              />
            </label>
          ) : null}

          {mode === "reset" ? (
            <label className="product-field">
              <span>{tr("auth.resetToken")}</span>
              <input
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder={tr("auth.resetTokenPlaceholder")}
              />
            </label>
          ) : null}

          {mode === "changePassword" ? (
            <label className="product-field">
              <span>{tr("auth.currentPassword")}</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
          ) : null}

          {mode !== "forgot" ? (
            <label className="product-field">
              <span>
                {mode === "reset" || mode === "changePassword"
                  ? tr("auth.newPassword")
                  : tr("auth.password")}
              </span>
              <input
                type="password"
                autoComplete={
                  mode === "signup" || mode === "reset" || mode === "changePassword"
                    ? "new-password"
                    : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
          ) : null}

          {mode === "changePassword" ? (
            <label className="product-field">
              <span>{tr("auth.confirmNewPassword")}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
          ) : null}

          {errorText ? <div className="product-auth-error">{errorText}</div> : null}
          {infoText ? <div className="product-auth-info">{infoText}</div> : null}

          <div className="product-auth-actions">
            <button
              type="button"
              className="product-secondary"
              onClick={handleSecondaryAction}
              disabled={busy}
            >
              {secondaryActionLabel}
            </button>

            <button
              type="button"
              className="product-primary"
              onClick={submit}
              disabled={
                busy ||
                (mode === "signup" && (!email.trim() || !password.trim() || !fullName.trim())) ||
                (mode === "login" && (!email.trim() || !password.trim())) ||
                (mode === "forgot" && !email.trim()) ||
                (mode === "reset" && (!resetToken.trim() || !password.trim())) ||
                isChangePasswordDisabled
              }
            >
              {busy ? tr("common.loading") : actionLabel}
            </button>
          </div>

          <div className="product-modal-footer">
            {mode === "signup" ? (
              <button
                type="button"
                className="product-link"
                onClick={() => {
                  switchMode("login");
                }}
              >
                {tr("auth.haveAccount")}
              </button>
            ) : null}

            {mode === "login" ? (
              <>
                <button
                  type="button"
                  className="product-link"
                  onClick={() => {
                    switchMode("forgot");
                  }}
                >
                  {tr("auth.forgot")}
                </button>

                <button
                  type="button"
                  className="product-link"
                  onClick={() => {
                    switchMode("signup");
                  }}
                >
                  {tr("auth.noAccount")}
                </button>
              </>
            ) : null}

            {mode === "forgot" || mode === "reset" ? (
              <button
                type="button"
                className="product-link"
                onClick={() => {
                  switchMode("login");
                }}
              >
                {tr("auth.backToLogin")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}