import { LEAGUE_CATALOG, type ProductLang } from "./leagueCatalog";

function humanizeSportKey(sportKey: string): string {
  return sportKey.replace(/_/g, " ");
}

export function getLeagueCatalogEntry(sportKey: string) {
  return LEAGUE_CATALOG[sportKey] ?? null;
}

export function getLeagueDisplayName(sportKey: string, lang: ProductLang): string {
  const entry = getLeagueCatalogEntry(sportKey);
  return entry?.leagueNames?.[lang] ?? humanizeSportKey(sportKey);
}

export function getLeagueCountryName(sportKey: string, lang: ProductLang): string {
  const entry = getLeagueCatalogEntry(sportKey);
  return entry?.countryNames?.[lang] ?? "";
}

export function getLeagueDisplayLabel(sportKey: string, lang: ProductLang): string {
  const leagueName = getLeagueDisplayName(sportKey, lang);
  const countryName = getLeagueCountryName(sportKey, lang);

  if (!countryName) return leagueName;
  return `${countryName} • ${leagueName}`;
}

export function getLeagueCountryCode(sportKey: string): string {
  return getLeagueCatalogEntry(sportKey)?.countryCode ?? "";
}