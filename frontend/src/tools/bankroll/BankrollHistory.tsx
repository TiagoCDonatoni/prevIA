import type { Lang } from "../../i18n";
import type { BankrollEntry } from "../api/types";
import type { ToolsCopy } from "../i18n";
import { formatMoney } from "../lib/format";

export function BankrollHistory({ entries, currency, lang, copy, busyId, onEdit, onDelete }: {
  entries: BankrollEntry[]; currency: string; lang: Lang; copy: ToolsCopy; busyId: number | null;
  onEdit: (entry: BankrollEntry) => void; onDelete: (entry: BankrollEntry) => void;
}) {
  return (
    <section className="tools-panel bankroll-history" aria-labelledby="bankroll-history-title">
      <div className="tools-section-heading"><h2 id="bankroll-history-title">{copy.history}</h2></div>
      {!entries.length ? <p className="tools-empty">{copy.empty}</p> : (
        <div className="bankroll-table-wrap"><table className="bankroll-table">
          <thead><tr><th>{copy.date}</th><th>{copy.event}</th><th>{copy.selection} / {copy.market}</th><th>{copy.bookmaker}</th><th>{copy.odds}</th><th>{copy.stake}</th><th>{copy.result}</th><th>{copy.returnLabel}</th><th>{copy.actions}</th></tr></thead>
          <tbody>{entries.map((entry) => <tr key={entry.entry_id}>
            <td data-label={copy.date}>{new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.placed_at_utc))}</td>
            <td data-label={copy.event}>{entry.event_name}</td>
            <td data-label={`${copy.selection} / ${copy.market}`}><strong>{entry.selection}</strong><small>{entry.market}</small></td>
            <td data-label={copy.bookmaker}>{entry.bookmaker}</td><td data-label={copy.odds}>{entry.odds_decimal}</td>
            <td data-label={copy.stake}>{formatMoney(entry.stake_cents, currency, lang)}</td>
            <td data-label={copy.result}><span className={`bankroll-result bankroll-result-${entry.result}`}>{copy.results[entry.result]}</span></td>
            <td data-label={copy.returnLabel}>{entry.return_cents == null ? "—" : formatMoney(entry.return_cents, currency, lang)}</td>
            <td data-label={copy.actions}><div className="bankroll-row-actions"><button type="button" onClick={() => onEdit(entry)} disabled={busyId === entry.entry_id}>{copy.edit}</button><button type="button" className="is-danger" onClick={() => onDelete(entry)} disabled={busyId === entry.entry_id}>{copy.remove}</button></div></td>
          </tr>)}</tbody>
        </table></div>
      )}
    </section>
  );
}
