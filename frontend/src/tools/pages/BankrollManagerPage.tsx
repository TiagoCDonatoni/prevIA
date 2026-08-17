import React from "react";
import { useParams } from "react-router-dom";

import type { Lang } from "../../i18n";
import { ProductAuthModal, type AuthSuccessMeta } from "../../product/auth/ProductAuthModal";
import { fetchAuthMe, type AuthMeResponse } from "../../product/api/auth";
import { coercePublicLang } from "../../public/lib/publicLang";
import { createBankrollAccount, createBankrollEntry, deleteBankrollEntry, fetchBankrollBootstrap, updateBankrollEntry } from "../api/bankroll";
import { ToolsApiError } from "../api/client";
import type { BankrollBootstrapResponse, BankrollEntry, BankrollEntryWrite } from "../api/types";
import { BankrollDashboard } from "../bankroll/BankrollDashboard";
import { BankrollEntryForm } from "../bankroll/BankrollEntryForm";
import { BankrollHistory } from "../bankroll/BankrollHistory";
import { interpolate, toolsCopy } from "../i18n";
import { parseMoneyToCents } from "../lib/format";

type PageState = "loading" | "guest" | "ready" | "unavailable" | "error" | "session-expired";

export function BankrollManagerPage() {
  const { lang: rawLang } = useParams<{ lang: string }>();
  const lang = coercePublicLang(rawLang) as Lang;
  const copy = toolsCopy(lang);
  const [pageState, setPageState] = React.useState<PageState>("loading");
  const [data, setData] = React.useState<BankrollBootstrapResponse | null>(null);
  const [authOpen, setAuthOpen] = React.useState(false);
  const [authMode, setAuthMode] = React.useState<"login" | "signup">("login");
  const [busy, setBusy] = React.useState(false);
  const [busyEntryId, setBusyEntryId] = React.useState<number | null>(null);
  const [editing, setEditing] = React.useState<BankrollEntry | null>(null);
  const [errorText, setErrorText] = React.useState("");
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [comingSoon, setComingSoon] = React.useState(false);

  const handleError = React.useCallback((error: unknown) => {
    console.error("bankroll manager request failed", error);
    if (error instanceof ToolsApiError) {
      if (error.status === 401 || error.code === "UNAUTHENTICATED") { setPageState("session-expired"); return; }
      if (error.code === "TOOL_UNAVAILABLE") { setPageState("unavailable"); return; }
      if (error.code === "TOOL_FREE_LIMIT_REACHED") { setUpgradeOpen(true); return; }
    }
    setErrorText(copy.serviceError);
    setPageState((current) => current === "loading" ? "error" : current);
  }, [copy.serviceError]);

  const loadBootstrap = React.useCallback(async () => {
    setErrorText("");
    try {
      const response = await fetchBankrollBootstrap();
      setData(response); setPageState(response.tool.available ? "ready" : "unavailable");
    } catch (error) { handleError(error); }
  }, [handleError]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auth = await fetchAuthMe();
        if (cancelled) return;
        if (!auth.is_authenticated) { setPageState("guest"); return; }
        await loadBootstrap();
      } catch (error) { if (!cancelled) handleError(error); }
    })();
    return () => { cancelled = true; };
  }, [handleError, loadBootstrap]);

  function openAuth(mode: "login" | "signup") { setAuthMode(mode); setAuthOpen(true); }
  async function authSuccess(_payload: AuthMeResponse, _meta: AuthSuccessMeta) { setAuthOpen(false); setPageState("loading"); await loadBootstrap(); }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setErrorText("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const balance = parseMoneyToCents(String(form.get("balance") ?? ""));
    if (!name) { setErrorText(copy.requiredError); return; }
    if (balance == null || balance < 0) { setErrorText(copy.moneyError); return; }
    setBusy(true);
    try { await createBankrollAccount({ name, currency_code: String(form.get("currency") ?? "BRL"), initial_balance_cents: balance }); await loadBootstrap(); }
    catch (error) { handleError(error); } finally { setBusy(false); }
  }

  async function saveEntry(payload: BankrollEntryWrite) {
    setBusy(true); setErrorText("");
    try {
      if (editing) await updateBankrollEntry(editing.entry_id, payload); else await createBankrollEntry(payload);
      setEditing(null); await loadBootstrap(); return true;
    } catch (error) { handleError(error); return false; } finally { setBusy(false); }
  }

  async function removeEntry(entry: BankrollEntry) {
    if (!window.confirm(copy.confirmDelete)) return;
    setBusyEntryId(entry.entry_id); setErrorText("");
    try { await deleteBankrollEntry(entry.entry_id); if (editing?.entry_id === entry.entry_id) setEditing(null); await loadBootstrap(); }
    catch (error) { handleError(error); } finally { setBusyEntryId(null); }
  }

  if (pageState === "loading") return <div className="tools-page"><div className="tools-state" role="status">{copy.loading}</div></div>;
  if (pageState === "guest" || pageState === "session-expired") return <div className="tools-page"><section className="tools-auth-gate"><span className="tools-eyebrow">prevIA Tools</span><h1>{copy.signInTitle}</h1><p>{pageState === "session-expired" ? copy.sessionExpired : copy.signInBody}</p><div className="tools-auth-actions"><button type="button" className="tools-btn tools-btn-primary" onClick={() => openAuth("login")}>{copy.login}</button><button type="button" className="tools-btn tools-btn-secondary" onClick={() => openAuth("signup")}>{copy.signup}</button></div></section><ProductAuthModal open={authOpen} lang={lang} initialMode={authMode} onClose={() => setAuthOpen(false)} onAuthSuccess={authSuccess} /></div>;
  if (pageState === "unavailable") return <div className="tools-page"><div className="tools-state tools-state-error"><h1>{copy.unavailable}</h1><p>{copy.serviceError}</p></div></div>;
  if (pageState === "error" || !data) return <div className="tools-page"><div className="tools-state tools-state-error"><p>{copy.serviceError}</p><button type="button" className="tools-btn tools-btn-secondary" onClick={() => { setPageState("loading"); void loadBootstrap(); }}>{copy.retry}</button></div></div>;

  const access = data.tool.access;
  const rawLimit = data.tool.limits?.max_entries;
  const limit = typeof rawLimit === "number" && Number.isInteger(rawLimit) ? rawLimit : null;
  const used = data.summary.entries_count;

  return <div className="tools-page bankroll-page">
    <section className="bankroll-header"><div><span className="tools-eyebrow">prevIA Tools</span><h1>{copy.bankrollTitle}</h1><p>{copy.bankrollDescription}</p></div><div className="bankroll-access"><strong>{access === "lifetime" ? copy.accessLifetime : copy.accessFree}</strong><span>{access === "lifetime" ? copy.unlimited : limit == null ? "—" : interpolate(copy.usage, { used, limit })}</span></div></section>
    {errorText ? <div id="bankroll-account-error" className="tools-alert" role="alert">{errorText}</div> : null}
    {!data.account ? <section className="tools-panel bankroll-onboarding"><h2>{copy.accountTitle}</h2><p>{copy.accountBody}</p><form className="bankroll-account-form" onSubmit={createAccount} aria-describedby={errorText ? "bankroll-account-error" : undefined}><label>{copy.accountName}<input name="name" maxLength={120} required /></label><label>{copy.currency}<select name="currency" defaultValue={lang === "pt" ? "BRL" : lang === "es" ? "EUR" : "USD"}><option>BRL</option><option>USD</option><option>EUR</option></select></label><label>{copy.initialBalance}<input name="balance" inputMode="decimal" defaultValue="0" required /></label><button type="submit" className="tools-btn tools-btn-primary" disabled={busy}>{busy ? copy.saving : copy.createAccount}</button></form></section> : <>
      <BankrollDashboard summary={data.summary} currency={data.account.currency_code} lang={lang} copy={copy} />
      <BankrollEntryForm copy={copy} lang={lang} currency={data.account.currency_code} accountId={data.account.account_id} editing={editing} busy={busy} onSubmit={saveEntry} onCancel={() => setEditing(null)} />
      <BankrollHistory entries={data.entries} currency={data.account.currency_code} lang={lang} copy={copy} busyId={busyEntryId} onEdit={(entry) => { setEditing(entry); window.scrollTo({ top: 260, behavior: "smooth" }); }} onDelete={removeEntry} />
    </>}
    {upgradeOpen && access !== "lifetime" ? <div className="tools-modal-backdrop" role="presentation"><section className="tools-modal" role="dialog" aria-modal="true" aria-labelledby="tools-upgrade-title"><h2 id="tools-upgrade-title">{copy.upgradeTitle}</h2><p>{comingSoon ? copy.comingSoon : copy.upgradeBody}</p>{!comingSoon ? <button type="button" className="tools-btn tools-btn-primary" onClick={() => setComingSoon(true)}>{copy.unlock}</button> : null}<button type="button" className="tools-btn tools-btn-secondary" onClick={() => { setUpgradeOpen(false); setComingSoon(false); }}>{copy.close}</button></section></div> : null}
  </div>;
}
