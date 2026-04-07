import type {
  ProductLeagueItem,
  ProductOddsBook,
  ProductOddsEvent,
} from "../../api/contracts";
import type { Lang } from "../i18n";
import { getCountryNameByCode } from "../i18n/countryCatalog";

function getLeagueDisplayTitle(item: {
  official_name?: string | null;
  sport_title?: string | null;
  sport_key?: string | null;
}) {
  return String(item.official_name || item.sport_title || item.sport_key || "").trim();
}

function getCountryDisplayName(item: {
  official_country_code?: string | null;
  country_name?: string | null;
}, lang: Lang) {
  const localized = getCountryNameByCode(item.official_country_code, lang);
  if (localized) return localized;
  return String(item.country_name || "International").trim();
}

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
    const countryName = getCountryDisplayName(league, lang);
    const countryCode = String(league.official_country_code ?? "").trim().toUpperCase();
    const countryKey = countryCode || normalizeText(countryName);

    const current = byCountry.get(countryKey);

    if (current) {
      current.count += 1;
      continue;
    }

    byCountry.set(countryKey, {
      label: countryName,
      count: 1,
      flagCode: toFlagCode(countryCode),
    });
  }

  return Array.from(byCountry.entries())
    .map(([countryKey, entry]) => ({
      value: countryKey,
      label: entry.label,
      searchText: normalizeText(`${entry.label} ${countryKey}`),
      count: entry.count,
      flagCode: entry.flagCode,
      meta: { countryKey },
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
      const countryCode = String(league.official_country_code ?? "").trim().toUpperCase();
      const fallbackKey = normalizeText(getCountryDisplayName(league, lang));
      return activeCountries.has(countryCode || fallbackKey);
    })
    .map((league) => {
      const countryName = getCountryDisplayName(league, lang);
      const countryCode = String(league.official_country_code ?? "").trim().toUpperCase();
      const countryKey = countryCode || normalizeText(countryName);
      const leagueName = getLeagueDisplayTitle(league);

      return {
        value: league.sport_key,
        label: leagueName,
        hint: countryName,
        flagCode: toFlagCode(countryCode),
        searchText: normalizeText(
          `${leagueName} ${countryName} ${league.sport_key} ${countryCode}`
        ),
        meta: {
          sport_key: league.sport_key,
          league_id: league.league_id,
          countryKey,
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

export function buildBookOptions(
  events: ProductOddsEvent[],
  booksByEventId?: Record<string, ProductOddsBook[]>
): FilterOption[] {
  const safeBooksByEventId = booksByEventId ?? {};
  const byBook = new Map<string, { label: string; count: number }>();

  for (const event of events) {
    const eventId = String(event?.event_id ?? "").trim();
    if (!eventId) continue;

    const books = safeBooksByEventId[eventId] ?? [];
    for (const book of books) {
      const label = String(book?.name ?? book?.key ?? "").trim();
      const value = String(book?.key ?? label).trim();
      if (!label || !value) continue;

      const current = byBook.get(value);
      if (current) {
        current.count += 1;
      } else {
        byBook.set(value, { label, count: 1 });
      }
    }
  }

  return Array.from(byBook.entries())
    .map(([value, entry]) => ({
      value,
      label: entry.label,
      count: entry.count,
      searchText: normalizeText(`${entry.label} ${value}`),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function buildTeamOptions(events: ProductOddsEvent[]): FilterOption[] {
  const byTeam = new Map<string, { label: string; count: number }>();

  function addTeam(name: string | null | undefined) {
    const label = String(name ?? "").trim();
    if (!label) return;

    const current = byTeam.get(label);
    if (current) {
      current.count += 1;
    } else {
      byTeam.set(label, {
        label,
        count: 1,
      });
    }
  }

  for (const event of events) {
    addTeam(event.home_name);
    addTeam(event.away_name);
  }

  return Array.from(byTeam.entries())
    .map(([value, entry]) => ({
      value,
      label: entry.label,
      count: entry.count,
      searchText: normalizeText(entry.label),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}