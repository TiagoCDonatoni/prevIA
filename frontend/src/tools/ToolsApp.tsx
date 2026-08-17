import "./tools.css";

import React from "react";
import { Navigate, useParams } from "react-router-dom";

import { coercePublicLang } from "../public/lib/publicLang";
import { warmI18n } from "../product/i18n";
import { toolsCopy } from "./i18n";
import { BankrollManagerPage } from "./pages/BankrollManagerPage";
import { ToolsHubPage } from "./pages/ToolsHubPage";
import { bankrollPath, BANKROLL_SLUGS } from "./routes";

export function ToolsApp({ page = "hub" }: { page?: "hub" | "bankroll" }) {
  const { lang: rawLang, toolSlug } = useParams<{ lang: string; toolSlug: string }>();
  const lang = coercePublicLang(rawLang);
  const [authI18nReady, setAuthI18nReady] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    warmI18n(lang).finally(() => { if (!cancelled) setAuthI18nReady(true); });
    return () => { cancelled = true; };
  }, [lang]);
  if (page === "hub") return <ToolsHubPage />;
  if (toolSlug !== BANKROLL_SLUGS[lang]) {
    const isLocalizedBankrollSlug = Object.values(BANKROLL_SLUGS).includes(toolSlug ?? "");
    return <Navigate to={isLocalizedBankrollSlug ? bankrollPath(lang) : `/${lang}/tools`} replace />;
  }
  if (!authI18nReady) return <div className="tools-page"><div className="tools-state" role="status">{toolsCopy(lang).loading}</div></div>;
  return <BankrollManagerPage />;
}
