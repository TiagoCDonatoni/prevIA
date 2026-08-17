import type { Lang } from "../../i18n";
import type { BankrollSummary } from "../api/types";
import type { ToolsCopy } from "../i18n";
import { formatMoney, formatPercent } from "../lib/format";

export function BankrollDashboard({ summary, currency, lang, copy }: { summary: BankrollSummary; currency: string; lang: Lang; copy: ToolsCopy }) {
  const metrics = [
    [copy.metrics.available, formatMoney(summary.available_balance_cents, currency, lang)],
    [copy.metrics.profit, formatMoney(summary.realized_profit_cents, currency, lang)],
    [copy.metrics.staked, formatMoney(summary.total_staked_cents, currency, lang)],
    [copy.metrics.pending, formatMoney(summary.pending_staked_cents, currency, lang)],
    [copy.metrics.roi, formatPercent(summary.roi, lang)],
    [copy.metrics.winRate, formatPercent(summary.win_rate, lang)],
    [copy.metrics.bets, new Intl.NumberFormat(lang).format(summary.entries_count)],
  ];
  return (
    <section aria-label={copy.bankrollTitle}>
      <div className="bankroll-metrics">{metrics.map(([label, value]) => <article className="bankroll-metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <p className="bankroll-balance-note">{copy.balanceNote}</p>
    </section>
  );
}
