import React from "react";

import type { Lang } from "../../i18n";
import type { BankrollEntry, BankrollEntryWrite, BankrollResult } from "../api/types";
import { FieldLabel } from "../components/FieldHelp";
import type { ToolsCopy } from "../i18n";
import { formatMoney, parseDecimalOdds, parseMoneyToCents, toLocalDateTimeValue } from "../lib/format";
import { isFreeSelectionMarket, isHandicapMarket, isValidLine, OTHER_VALUE, parseStructuredSelection, resolveBookmaker, resolveMarket, serializeBookmaker, serializeMarket, serializeStructuredSelection } from "./marketHelpers";
import { ASIAN_HANDICAP_LINES, BOOKMAKERS, EUROPEAN_HANDICAP_LINES, GOALS_LINES, MARKET_IDS, SIMPLE_SELECTIONS, type MarketId } from "./options";

type FormState = {
  placedAt: string; eventName: string; bookmaker: string; customBookmaker: string;
  marketId: MarketId | ""; customMarket: string; freeSelection: string; selectionChoice: string;
  direction: "over" | "under"; line: string; customLine: string; team: "home" | "away";
  odds: string; stake: string; result: BankrollResult; returnAmount: string; notes: string;
};

function emptyState(): FormState {
  return { placedAt: toLocalDateTimeValue(), eventName: "", bookmaker: "", customBookmaker: "", marketId: "", customMarket: "", freeSelection: "", selectionChoice: "", direction: "over", line: "", customLine: "", team: "home", odds: "", stake: "", result: "pending", returnAmount: "", notes: "" };
}

export function buildEntryFormState(entry: BankrollEntry | null, currency: string, lang: Lang): FormState {
  if (!entry) return emptyState();
  const bookmaker = resolveBookmaker(entry.bookmaker);
  let market = resolveMarket(entry.market);
  let parsed = market.marketId === "other" ? {} : parseStructuredSelection(market.marketId, entry.selection);
  if (market.marketId !== "other" && parsed == null) {
    market = { marketId: "other", customMarket: entry.market };
    parsed = {};
  }
  return {
    placedAt: toLocalDateTimeValue(entry.placed_at_utc), eventName: entry.event_name,
    bookmaker: bookmaker.bookmaker, customBookmaker: bookmaker.customBookmaker,
    marketId: market.marketId, customMarket: market.customMarket, freeSelection: entry.selection,
    selectionChoice: parsed?.choice ?? "", direction: parsed?.direction ?? "over", line: parsed?.line ?? "",
    customLine: parsed?.customLine ?? "", team: parsed?.team ?? "home", odds: entry.odds_decimal,
    stake: formatMoney(entry.stake_cents, currency, lang).replace(/[^\d,.-]/g, "").trim(), result: entry.result,
    returnAmount: entry.return_cents == null ? "" : formatMoney(entry.return_cents, currency, lang).replace(/[^\d,.-]/g, "").trim(), notes: entry.notes ?? "",
  };
}

function selectionLabel(copy: ToolsCopy, marketId: MarketId, value: string): string {
  if (marketId === "double_chance") return value;
  if (marketId === "to_qualify") return value === "home" ? copy.selections.qualifyHome : copy.selections.qualifyAway;
  return copy.selections[value as "home" | "draw" | "away" | "yes" | "no"] ?? value;
}

function freeSelectionPlaceholder(copy: ToolsCopy, marketId: MarketId): string {
  if (marketId === "team_goals") return copy.placeholders.team_goals;
  if (marketId === "corners") return copy.placeholders.corners;
  if (marketId === "cards") return copy.placeholders.cards;
  if (marketId === "correct_score") return copy.placeholders.correct_score;
  return copy.placeholders.freeSelection;
}

export function BankrollEntryForm({ copy, lang, currency, accountId, editing, busy, onSubmit, onCancel }: {
  copy: ToolsCopy; lang: Lang; currency: string; accountId: number; editing: BankrollEntry | null;
  busy: boolean; onSubmit: (payload: BankrollEntryWrite) => Promise<boolean>; onCancel: () => void;
}) {
  const [form, setForm] = React.useState(() => buildEntryFormState(editing, currency, lang));
  const [error, setError] = React.useState("");
  const resetKey = `${editing?.entry_id ?? "new"}:${editing?.updated_at_utc ?? ""}:${currency}`;
  const resetKeyRef = React.useRef(resetKey);
  React.useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    setForm(buildEntryFormState(editing, currency, lang));
  }, [resetKey, editing, currency, lang]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function buildSelection(): string {
    if (!form.marketId) return "";
    return serializeStructuredSelection(form.marketId, { choice: form.selectionChoice, direction: form.direction, line: form.line, customLine: form.customLine, team: form.team }, form.freeSelection);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const bookmaker = serializeBookmaker(form.bookmaker, form.customBookmaker);
    const market = form.marketId ? serializeMarket(form.marketId, form.customMarket) : "";
    const selection = buildSelection();
    const usesLine = form.marketId === "goals_over_under" || (form.marketId !== "" && isHandicapMarket(form.marketId));
    const allowedSelections = form.marketId ? SIMPLE_SELECTIONS[form.marketId] : undefined;
    const allowedLines = form.marketId === "goals_over_under"
      ? GOALS_LINES
      : form.marketId === "asian_handicap"
        ? ASIAN_HANDICAP_LINES
        : EUROPEAN_HANDICAP_LINES;
    if (![form.eventName, bookmaker, market, selection, form.placedAt].every((value) => value.trim())) { setError(copy.requiredError); return; }
    if (allowedSelections && !allowedSelections.includes(form.selectionChoice)) { setError(copy.requiredError); return; }
    if (usesLine && (form.line === OTHER_VALUE ? !isValidLine(form.customLine) : !(allowedLines as readonly string[]).includes(form.line))) { setError(copy.requiredError); return; }
    const placedAt = new Date(form.placedAt);
    if (Number.isNaN(placedAt.getTime())) { setError(copy.requiredError); return; }
    const stakeCents = parseMoneyToCents(form.stake);
    if (stakeCents == null || stakeCents <= 0) { setError(copy.moneyError); return; }
    const odds = parseDecimalOdds(form.odds);
    if (!odds) { setError(copy.oddsError); return; }
    let returnCents: number | null = null;
    if (form.result === "void") returnCents = stakeCents;
    if (form.result === "lost") returnCents = 0;
    if (form.result === "won" || form.result === "cashout") {
      returnCents = parseMoneyToCents(form.returnAmount);
      if (returnCents == null) { setError(copy.returnRequired); return; }
      if (form.result === "won" && returnCents <= stakeCents) { setError(copy.wonReturnError); return; }
    }
    const saved = await onSubmit({ account_id: accountId, placed_at_utc: placedAt.toISOString(), event_name: form.eventName.trim(), bookmaker, market, selection, odds_decimal: odds, stake_cents: stakeCents, result: form.result, return_cents: returnCents, notes: form.notes.trim() || null });
    if (saved && !editing) setForm(emptyState());
  }

  const needsReturn = form.result === "won" || form.result === "cashout";
  const resultOptions: BankrollResult[] = ["pending", "won", "lost", "void", "cashout"];
  const marketId = form.marketId || null;
  const simpleSelections = marketId ? SIMPLE_SELECTIONS[marketId] : undefined;
  const handicapLines = marketId === "asian_handicap" ? ASIAN_HANDICAP_LINES : EUROPEAN_HANDICAP_LINES;

  return (
    <section className="tools-panel" aria-labelledby="bankroll-entry-form-title">
      <div className="tools-section-heading"><h2 id="bankroll-entry-form-title">{editing ? copy.entryEdit : copy.entryAdd}</h2></div>
      <form className="bankroll-form" onSubmit={submit} noValidate aria-describedby={error ? "bankroll-form-error" : undefined}>
        <div className="bankroll-field"><FieldLabel htmlFor="bet-placed-at" label={copy.date} help={copy.fieldHelp.date} helpId="help-bet-placed-at" /><input id="bet-placed-at" aria-describedby="help-bet-placed-at" type="datetime-local" value={form.placedAt} onChange={(e) => update("placedAt", e.target.value)} required /></div>
        <div className="bankroll-field bankroll-field-wide"><FieldLabel htmlFor="bet-event" label={copy.event} help={copy.fieldHelp.event} helpId="help-bet-event" /><input id="bet-event" aria-describedby="help-bet-event" value={form.eventName} onChange={(e) => update("eventName", e.target.value)} placeholder={copy.placeholders.event} maxLength={240} required /></div>
        <div className="bankroll-field"><FieldLabel htmlFor="bet-bookmaker" label={copy.bookmaker} help={copy.fieldHelp.bookmaker} helpId="help-bet-bookmaker" /><select id="bet-bookmaker" aria-describedby="help-bet-bookmaker" value={form.bookmaker} onChange={(e) => update("bookmaker", e.target.value)} required><option value="">{copy.selectPrompt}</option>{BOOKMAKERS.map((bookmaker) => <option key={bookmaker} value={bookmaker}>{bookmaker}</option>)}<option value={OTHER_VALUE}>{copy.other}</option></select></div>
        {form.bookmaker === OTHER_VALUE ? <div className="bankroll-field"><label htmlFor="bet-custom-bookmaker">{copy.customBookmaker}</label><input id="bet-custom-bookmaker" value={form.customBookmaker} onChange={(e) => update("customBookmaker", e.target.value)} maxLength={120} required /></div> : null}
        <div className="bankroll-field"><FieldLabel htmlFor="bet-market" label={copy.market} help={copy.fieldHelp.market} helpId="help-bet-market" /><select id="bet-market" aria-describedby="help-bet-market" value={form.marketId} onChange={(e) => update("marketId", e.target.value as MarketId | "")} required><option value="">{copy.selectPrompt}</option>{MARKET_IDS.map((id) => <option key={id} value={id}>{copy.markets[id]}</option>)}</select></div>
        {marketId === "other" ? <div className="bankroll-field"><label htmlFor="bet-custom-market">{copy.customMarket}</label><input id="bet-custom-market" value={form.customMarket} onChange={(e) => update("customMarket", e.target.value)} maxLength={160} required /></div> : null}

        {marketId && simpleSelections ? <div className="bankroll-field"><FieldLabel htmlFor="bet-selection" label={copy.selection} help={copy.fieldHelp.selection} helpId="help-bet-selection" /><select id="bet-selection" aria-describedby="help-bet-selection" value={form.selectionChoice} onChange={(e) => update("selectionChoice", e.target.value)} required><option value="">{copy.selectPrompt}</option>{simpleSelections.map((value) => <option key={value} value={value}>{selectionLabel(copy, marketId, value)}</option>)}</select></div> : null}
        {marketId === "goals_over_under" ? <StructuredLines copy={copy} kind="goals" form={form} update={update} lines={GOALS_LINES} /> : null}
        {marketId && isHandicapMarket(marketId) ? <StructuredLines copy={copy} kind="handicap" form={form} update={update} lines={handicapLines} /> : null}
        {marketId && isFreeSelectionMarket(marketId) ? <div className="bankroll-field"><FieldLabel htmlFor="bet-free-selection" label={copy.selection} help={copy.fieldHelp.selection} helpId="help-bet-selection" /><input id="bet-free-selection" aria-describedby="help-bet-selection" value={form.freeSelection} onChange={(e) => update("freeSelection", e.target.value)} placeholder={freeSelectionPlaceholder(copy, marketId)} maxLength={160} required /></div> : null}

        <div className="bankroll-field"><FieldLabel htmlFor="bet-odds" label={copy.odds} help={copy.fieldHelp.odds} helpId="help-bet-odds" /><input id="bet-odds" aria-describedby="help-bet-odds" inputMode="decimal" value={form.odds} onChange={(e) => update("odds", e.target.value)} placeholder={copy.placeholders.odds} required /></div>
        <div className="bankroll-field"><FieldLabel htmlFor="bet-stake" label={copy.stake} help={copy.fieldHelp.stake} helpId="help-bet-stake" /><input id="bet-stake" aria-describedby="help-bet-stake" inputMode="decimal" value={form.stake} onChange={(e) => update("stake", e.target.value)} placeholder={copy.placeholders.stake} required /></div>
        <div className="bankroll-field"><FieldLabel htmlFor="bet-result" label={copy.result} help={copy.fieldHelp.result} helpId="help-bet-result" /><select id="bet-result" aria-describedby="help-bet-result" value={form.result} onChange={(e) => update("result", e.target.value as BankrollResult)}>{resultOptions.map((result) => <option key={result} value={result}>{copy.results[result]}</option>)}</select></div>
        {needsReturn ? <div className="bankroll-field"><label htmlFor="bet-return">{copy.return}</label><input id="bet-return" aria-describedby="bet-return-hint" inputMode="decimal" value={form.returnAmount} onChange={(e) => update("returnAmount", e.target.value)} required /><small id="bet-return-hint" className="bankroll-field-hint">{form.result === "won" ? copy.returnHints.won : copy.returnHints.cashout}</small></div> : null}
        <div className="bankroll-field bankroll-field-wide"><FieldLabel htmlFor="bet-notes" label={copy.notes} help={copy.fieldHelp.notes} helpId="help-bet-notes" /><textarea id="bet-notes" aria-describedby="help-bet-notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} maxLength={2000} rows={3} /></div>
        {error ? <p id="bankroll-form-error" className="tools-form-error bankroll-field-wide" role="alert">{error}</p> : null}
        <div className="bankroll-form-actions bankroll-field-wide">{editing ? <button type="button" className="tools-btn tools-btn-secondary" onClick={onCancel} disabled={busy}>{copy.cancel}</button> : null}<button type="submit" className="tools-btn tools-btn-primary" disabled={busy}>{busy ? copy.saving : editing ? copy.update : copy.save}</button></div>
      </form>
    </section>
  );
}

function StructuredLines({ copy, kind, form, update, lines }: { copy: ToolsCopy; kind: "goals" | "handicap"; form: FormState; update: <K extends keyof FormState>(key: K, value: FormState[K]) => void; lines: readonly string[] }) {
  return <div className="bankroll-conditional-group bankroll-field-wide" aria-describedby="help-bet-selection"><div className="bankroll-conditional-heading"><FieldLabel htmlFor={kind === "goals" ? "bet-direction" : "bet-handicap-team"} label={copy.selection} help={copy.fieldHelp.selection} helpId="help-bet-selection" /></div><div className="bankroll-subgrid">
    {kind === "goals" ? <div className="bankroll-field"><label htmlFor="bet-direction">{copy.direction}</label><select id="bet-direction" value={form.direction} onChange={(e) => update("direction", e.target.value as "over" | "under")}><option value="over">{copy.selections.over}</option><option value="under">{copy.selections.under}</option></select></div> : <div className="bankroll-field"><label htmlFor="bet-handicap-team">{copy.team}</label><select id="bet-handicap-team" value={form.team} onChange={(e) => update("team", e.target.value as "home" | "away")}><option value="home">{copy.selections.home}</option><option value="away">{copy.selections.away}</option></select></div>}
    <div className="bankroll-field"><label htmlFor="bet-selection-line">{copy.line}</label><select id="bet-selection-line" value={form.line} onChange={(e) => update("line", e.target.value)} required><option value="">{copy.selectPrompt}</option>{lines.map((line) => <option key={line} value={line}>{line}</option>)}<option value={OTHER_VALUE}>{copy.other}</option></select></div>
    {form.line === OTHER_VALUE ? <div className="bankroll-field"><label htmlFor="bet-custom-line">{copy.customLine}</label><input id="bet-custom-line" inputMode="decimal" value={form.customLine} onChange={(e) => update("customLine", e.target.value)} required /></div> : null}
  </div></div>;
}
