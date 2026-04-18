export type PersistedProductIndexFilters = {
  windowMode?: string;
  sortBy?: string;
  onlyOpportunities?: boolean;
  selectedCountryCodes?: string[];
  selectedLeagueSportKeys?: string[];
  selectedBookKeys?: string[];
  selectedTeams?: string[];
};

const PRODUCT_INDEX_FILTERS_SESSION_KEY = "previa_product_index_filters_v1";

export function readPersistedProductIndexFilters(): PersistedProductIndexFilters | null {
  try {
    const raw = window.sessionStorage.getItem(PRODUCT_INDEX_FILTERS_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return parsed as PersistedProductIndexFilters;
  } catch {
    return null;
  }
}

export function writePersistedProductIndexFilters(value: PersistedProductIndexFilters) {
  try {
    window.sessionStorage.setItem(
      PRODUCT_INDEX_FILTERS_SESSION_KEY,
      JSON.stringify(value)
    );
  } catch {}
}

export function clearPersistedProductIndexFilters() {
  try {
    window.sessionStorage.removeItem(PRODUCT_INDEX_FILTERS_SESSION_KEY);
  } catch {}
}