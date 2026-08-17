import React from "react";
import { Link, useParams } from "react-router-dom";

import type { Lang } from "../../i18n";
import { coercePublicLang } from "../../public/lib/publicLang";
import { fetchToolsCatalog } from "../api/tools";
import { BANKROLL_MANAGER, type ToolCatalogItem } from "../api/types";
import { interpolate, toolsCopy } from "../i18n";
import { bankrollPath } from "../routes";

const TOOL_DEFINITIONS = [{ code: BANKROLL_MANAGER }] as const;

export function ToolsHubPage() {
  const { lang: rawLang } = useParams<{ lang: string }>();
  const lang = coercePublicLang(rawLang) as Lang;
  const copy = toolsCopy(lang);
  const [catalog, setCatalog] = React.useState<ToolCatalogItem[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetchToolsCatalog().then((response) => { if (!cancelled) setCatalog(response.tools); }).catch((error) => {
      console.error("tools catalog failed", error);
      if (!cancelled) { setCatalog([]); setFailed(true); }
    });
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <div className="tools-page tools-hub-page">
      <section className="tools-hero"><span className="tools-eyebrow">prevIA Tools</span><h1>{copy.hubTitle}</h1><p>{copy.hubLead}</p></section>
      {catalog == null ? <div className="tools-state" role="status">{copy.loading}</div> : failed ? (
        <div className="tools-state tools-state-error"><p>{copy.serviceError}</p><button type="button" className="tools-btn tools-btn-secondary" onClick={() => setAttempt((value) => value + 1)}>{copy.retry}</button></div>
      ) : (
        <div className="tools-catalog-grid">
          {TOOL_DEFINITIONS.map((definition) => {
            const item = catalog.find((candidate) => candidate.tool_code === definition.code);
            const rawLimit = item?.limits?.max_entries;
            const limit = typeof rawLimit === "number" && Number.isInteger(rawLimit) ? rawLimit : null;
            const available = Boolean(item);
            return <article className="tools-catalog-card" key={definition.code}>
              <div><span className={`tools-status ${available && item?.free_enabled ? "is-free" : "is-unavailable"}`}>{available ? item?.free_enabled ? copy.free : copy.accessRequired : copy.unavailable}</span><h2>{copy.bankrollTitle}</h2><p>{copy.bankrollDescription}</p></div>
              <div className="tools-card-footer"><span>{available && item?.free_enabled && limit != null ? interpolate(copy.freeLimit, { limit }) : available ? copy.accessRequired : copy.unavailable}</span>{available ? <Link className="tools-btn tools-btn-primary" to={bankrollPath(lang)}>{copy.open}</Link> : null}</div>
            </article>;
          })}
        </div>
      )}
    </div>
  );
}
