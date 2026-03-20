import type { ProductLeagueItem } from "../../api/contracts";

/**
 * Product overrides (temporário) para itens que ainda não estão governados no backend.
 *
 * Objetivo: evitar hardcode dentro das páginas.
 * Próximo passo natural: mover isso para tabela/endpoint (ex.: model artifacts por liga).
 */
export type LeagueOverride = {
  assume_season?: number;
  artifact_filename?: string;
};

const OVERRIDES: Record<string, LeagueOverride> = {
  // EPL (já tem artifact)
  soccer_epl: {
    assume_season: 2025,
    artifact_filename: "epl_1x2_logreg_tempcal_v1_C_2021_2023_C0.3_cal2023.json",
  },

  // Brasileirão A (ainda sem artifact no seu snapshot atual)
  // Quando existir um modelo próprio, basta preencher artifact_filename aqui.
  soccer_brazil_campeonato: {
    assume_season: 2025,
  },
};

export function applyLeagueOverride(l: ProductLeagueItem) {
  const o = OVERRIDES[l.sport_key] || {};
  const season =
    (l.season_policy === "fixed" && l.fixed_season != null ? l.fixed_season : undefined) ??
    o.assume_season ??
    2025;

  return {
    ...l,
    assume_season: season,
    artifact_filename: o.artifact_filename ?? null,
  };
}
