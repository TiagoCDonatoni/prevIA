import type { ProductLeagueItem } from "../../api/contracts";
import type { Lang } from "../i18n";
import {
  getLeagueCountryCode,
  getLeagueCountryName,
  getLeagueDisplayName,
} from "../i18n/leagueCatalogHelpers";

export type FilterOption = {
  value: string;
  label: string;
  searchText: string;
  hint?: string;
  count?: number;
  flagCode?: string | null;
  meta?: Record<string, unknown>;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toFlagCode(countryCode: string | null | undefined) {
  const code = String(countryCode ?? "").trim().toUpperCase();
  return code.length === 2 ? code.toLowerCase() : null;
}

export function buildCountryOptions(
  leagues: ProductLeagueItem[],
  lang: Lang
): FilterOption[] {
  const byCountry = new Map<
    string,
    {
      label: string;
      count: number;
      flagCode: string | null;
    }
  >();

  for (const league of leagues) {
    const countryCode = String(getLeagueCountryCode(league.sport_key) || "INTL").toUpperCase();
    const countryName =
      getLeagueCountryName(league.sport_key, lang) ||
      (countryCode === "INTL" ? "International" : countryCode);

    const current = byCountry.get(countryCode);

    if (current) {
      current.count += 1;
      continue;
    }

    byCountry.set(countryCode, {
      label: countryName,
      count: 1,
      flagCode: toFlagCode(countryCode),
    });
  }

  return Array.from(byCountry.entries())
    .map(([countryCode, entry]) => ({
      value: countryCode,
      label: entry.label,
      searchText: normalizeText(`${entry.label} ${countryCode}`),
      count: entry.count,
      flagCode: entry.flagCode,
      meta: { countryCode },
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function buildLeagueOptions(
  leagues: ProductLeagueItem[],
  lang: Lang,
  selectedCountryCodes: string[]
): FilterOption[] {
  const activeCountries = new Set(
    selectedCountryCodes.map((item) => String(item).trim().toUpperCase())
  );

  return leagues
    .filter((league) => {
      if (!activeCountries.size) return true;
      const countryCode = String(getLeagueCountryCode(league.sport_key) || "INTL").toUpperCase();
      return activeCountries.has(countryCode);
    })
    .map((league) => {
      const countryCode = String(getLeagueCountryCode(league.sport_key) || "INTL").toUpperCase();
      const countryName = getLeagueCountryName(league.sport_key, lang) || countryCode;
      const leagueName = getLeagueDisplayName(league.sport_key, lang);

      return {
        value: league.sport_key,
        label: leagueName,
        hint: countryName,
        flagCode: toFlagCode(countryCode),
        searchText: normalizeText(`${leagueName} ${countryName} ${countryCode} ${league.sport_key}`),
        meta: {
          sport_key: league.sport_key,
          league_id: league.league_id,
          countryCode,
        },
      } satisfies FilterOption;
    })
    .sort((a, b) => {
      const aHint = String(a.hint ?? "");
      const bHint = String(b.hint ?? "");
      const byHint = aHint.localeCompare(bHint, undefined, { sensitivity: "base" });
      if (byHint !== 0) return byHint;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
}

export function filterOptionsByQuery(options: FilterOption[], query: string) {
  const q = normalizeText(query);
  if (!q) return options;
  return options.filter((option) => option.searchText.includes(q));
}

export function filterLeaguesBySelectedSportKeys(
  leagues: ProductLeagueItem[],
  selectedSportKeys: string[]
) {
  if (!selectedSportKeys.length) return leagues;

  const active = new Set(selectedSportKeys.map((item) => String(item).trim()));
  return leagues.filter((league) => active.has(league.sport_key));
}