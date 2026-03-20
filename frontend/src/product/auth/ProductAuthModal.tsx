import { useMemo, useState } from "react";

import { AuthRequestError, postAuthLogin, postAuthSignup } from "../api/auth";
import { t, type Lang } from "../i18n";

type Mode = "login" | "signup";

function mapAuthErrorCode(langT: (k: string) => string, code?: string): string {
  if (code === "INVALID_EMAIL") return langT("auth.errorInvalidEmail");
  if (code === "WEAK_PASSWORD") return langT("auth.errorWeakPassword");
  if (code === "EMAIL_ALREADY_EXISTS") return langT("auth.errorEmailAlreadyExists");
  if (code === "INVALID_CREDENTIALS") return langT("auth.errorInvalidCredentials");
  if (code === "ACCOUNT_BLOCKED") return langT("auth.errorAccountBlocked");
  return langT("auth.genericError");
}

export function ProductAuthModal(props: {
  open: boolean;
  lang: Lang;
  initialMode?: Mode;
  onClose: () => void;
  onAuthSuccess: () => void;
}) {
  const { open, lang } = props;
  const authEnabled = String(import.meta.env.VITE_PRODUCT_AUTH_ENABLED ?? "false").toLowerCase() === "true";

  const [mode, setMode] = useState<Mode>(props.initialMode ?? "signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState("");

  const tr = useMemo(() => (k: string, vars?: Record<string, any>) => t(lang, k, vars), [lang]);

  if (!open || !authEnabled) return null;

  async function submit() {
    if (!email.trim() || !password.trim()) return;
    if (mode === "signup" && !fullName.trim()) return;

    setBusy(true);
    setErrorText("");

    try {
      if (mode === "signup") {
        await postAuthSignup({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
        });
      } else {
        await postAuthLogin({
          email: email.trim(),
          password,
        });
      }

      props.onAuthSuccess();
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

  return (
    <div className="um-overlay" role="dialog" aria-modal="true">
      <div className="um-modal">
        <div className="">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {mode === "signup" ? tr("auth.signupTitle") : tr("auth.loginTitle")}
            </div>
            {mode === "signup" ? (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{tr("auth.signupBenefit")}</div>
            ) : null}
          </div>

          <button className="product-modal-close" onClick={props.onClose} aria-label={tr("common.close")}>
            ×
          </button>
        </div>

        <div className="">
          {mode === "signup" ? (
            <label className="product-field">
              <span>{tr("auth.fullName")}</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
            </label>
          ) : null}

          <label className="product-field">
            <span>{tr("auth.email")}</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
          </label>

          <label className="product-field">
            <span>{tr("auth.password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {errorText ? (
            <div style={{ fontSize: 12, color: "var(--danger, #c0392b)", marginBottom: 8 }}>
              {errorText}
            </div>
          ) : null}

          <button
            className="product-primary"
            onClick={submit}
            disabled={
              busy ||
              !email.trim() ||
              !password.trim() ||
              (mode === "signup" && !fullName.trim())
            }
          >
            {busy ? tr("common.loading") : tr("auth.continue")}
          </button>

          <div className="product-modal-footer">
            {mode === "signup" ? (
              <button
                className="product-link"
                onClick={() => {
                  setMode("login");
                  setErrorText("");
                }}
              >
                {tr("auth.haveAccount")}
              </button>
            ) : (
              <button
                className="product-link"
                onClick={() => {
                  setMode("signup");
                  setErrorText("");
                }}
              >
                {tr("auth.noAccount")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}