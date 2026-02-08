import { useMemo, useState } from "react";

import { t, type Lang } from "../../i18n";

type Mode = "login" | "signup";

export function ProductAuthModal(props: {
  open: boolean;
  lang: Lang;
  initialMode?: Mode;
  onClose: () => void;
  onAuthSuccess: (payload: { email: string; mode: Mode }) => void;
}) {
  const { open, lang } = props;
  const [mode, setMode] = useState<Mode>(props.initialMode ?? "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const tr = useMemo(() => (k: string, vars?: Record<string, any>) => t(lang, k, vars), [lang]);

  if (!open) return null;

  async function submit() {
    if (!email.trim() || !password.trim()) return;
    setBusy(true);
    try {
      // MVP: local-only auth. Backend integration comes next (POST /auth/signup|login).
      await new Promise((r) => setTimeout(r, 250));
      props.onAuthSuccess({ email: email.trim(), mode });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="product-modal-overlay" role="dialog" aria-modal="true">
      <div className="product-modal">
        <div className="product-modal-header">
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

        <div className="product-modal-body">
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

          <button className="product-primary" onClick={submit} disabled={busy || !email.trim() || !password.trim()}>
            {busy ? tr("common.loading") : tr("auth.continue")}
          </button>

          <div className="product-modal-footer">
            {mode === "signup" ? (
              <button className="product-link" onClick={() => setMode("login")}>
                {tr("auth.haveAccount")}
              </button>
            ) : (
              <button className="product-link" onClick={() => setMode("signup")}>
                {tr("auth.noAccount")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
