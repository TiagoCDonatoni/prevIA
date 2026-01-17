export function fmtIsoToShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function fmtNum(
  value: number | null | undefined,
  opts?: Intl.NumberFormatOptions
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, opts).format(value);
}

export function fmtPct(p: number): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  return `${(p * 100).toFixed(1)}%`;
}