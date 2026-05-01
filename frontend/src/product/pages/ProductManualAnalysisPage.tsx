import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { listTeams } from "../../api/client";
import type { TeamLite } from "../../api/contracts";
import { SearchableSingleSelect } from "../components/SearchableSingleSelect";
import { type PlanId } from "../entitlements";
import { t, type Lang } from "../i18n";
import {
  fetchManualAnalysisHistory,
  postManualAnalysisEvaluate,
  postManualAnalysisImageEvaluateBatch,
  postManualAnalysisImagePreview,
  type ManualAnalysisEvaluateRequest,
  type ManualAnalysisImageImportPreviewItem,
  type ManualAnalysisImageImportPreviewResponse,
  type ManualAnalysisMarketKey,
  type ManualAnalysisMarketSnapshot,
  type ManualAnalysisResponse,
} from "../api/manualAnalysis";
import { useProductStore } from "../state/productStore";

const ALLOWED_PLANS: PlanId[] = ["LIGHT", "PRO"];
const TOTALS_LINE_OPTIONS = [1.5, 2.5, 3.5, 4.5] as const;
const MANUAL_ANALYSIS_HISTORY_PAGE_SIZE = 5;

type MarketSectionKey = "one_x_two" | "totals" | "btts";
const ODD_INPUT_PLACEHOLDER = "0000.00";

function sanitizeOddInput(raw: string) {
  const digits = String(raw ?? "")
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(-6);

  if (!digits) return "";

  const cents = Number(digits);

  if (!Number.isFinite(cents) || cents <= 0) {
    return "";
  }

  const integerPart = Math.floor(cents / 100);
  const decimalPart = String(cents % 100).padStart(2, "0");

  return `${integerPart}.${decimalPart}`;
}

function normalizeOddInputOnBlur(value: string) {
  const sanitized = sanitizeOddInput(value);
  if (!sanitized) return "";

  const numericValue = Number(sanitized);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  return numericValue.toFixed(2);
}

function oddToNumber(raw: string) {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 1) return null;
  return value;
}

function fmtPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function fmtOdd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function getSelectionLabel(
  lang: Lang,
  marketKey: ManualAnalysisMarketKey,
  selectionKey: string,
  event?: ManualAnalysisResponse["event"]
) {
  if (marketKey === "1X2") {
    if (selectionKey === "H") {
      return (
        event?.home_name ??
        (lang === "pt" ? "Mandante" : lang === "es" ? "Local" : "Home")
      );
    }
    if (selectionKey === "D") {
      return lang === "pt" ? "Empate" : lang === "es" ? "Empate" : "Draw";
    }
    return (
      event?.away_name ??
      (lang === "pt" ? "Visitante" : lang === "es" ? "Visitante" : "Away")
    );
  }

  if (marketKey === "TOTALS") {
    return selectionKey === "over" ? "Over" : "Under";
  }

  if (selectionKey === "yes") {
    return lang === "pt" ? "BTTS Sim" : lang === "es" ? "BTTS Sí" : "BTTS Yes";
  }

  return lang === "pt" ? "BTTS Não" : lang === "es" ? "BTTS No" : "BTTS No";
}

function getMarketSectionTitle(
  tr: (key: string, vars?: Record<string, unknown>) => string,
  sectionKey: MarketSectionKey,
  market?: ManualAnalysisMarketSnapshot
) {
  if (sectionKey === "one_x_two") return tr("market1x2");
  if (sectionKey === "totals") {
    const line = market?.market?.line ?? 2.5;
    return `${tr("marketTotals")} ${Number(line).toFixed(1)}`;
  }
  return tr("marketBtts");
}

function getAnalysisMarketSections(
  analysis: ManualAnalysisResponse | null
): Array<{ key: MarketSectionKey; market: ManualAnalysisMarketSnapshot }> {
  if (!analysis) return [];

  const sections: Array<{ key: MarketSectionKey; market: ManualAnalysisMarketSnapshot }> = [];

  if (analysis.markets?.one_x_two) {
    sections.push({ key: "one_x_two", market: analysis.markets.one_x_two });
  }

  if (analysis.markets?.totals) {
    sections.push({ key: "totals", market: analysis.markets.totals });
  }

  if (analysis.markets?.btts) {
    sections.push({ key: "btts", market: analysis.markets.btts });
  }

  // Compatibilidade com históricos antigos, que possuem apenas um mercado no topo.
  if (!sections.length && analysis.market?.market_key && analysis.market.market_key !== "FULL" && analysis.model) {
    sections.push({
      key:
        analysis.market.market_key === "TOTALS"
          ? "totals"
          : analysis.market.market_key === "BTTS"
          ? "btts"
          : "one_x_two",
      market: {
        market: {
          market_key: analysis.market.market_key,
          line: analysis.market.line ?? null,
        },
        model: analysis.model,
        manual_input: analysis.manual_input,
        evaluation: analysis.evaluation as ManualAnalysisMarketSnapshot["evaluation"],
      },
    });
  }

  return sections;
}

function buildNarrative(lang: Lang, plan: PlanId, analysis: ManualAnalysisResponse | null) {
  if (!analysis?.event) return [] as string[];

  const sections = getAnalysisMarketSections(analysis);
  const oneXTwo = sections.find((section) => section.key === "one_x_two")?.market;
  const primarySelections = oneXTwo?.model?.selections ?? {};

  const modelEntries = Object.entries(primarySelections)
    .map(([key, value]) => ({ key, ...(value ?? {}) }))
    .filter((item) => typeof item.model_prob === "number")
    .sort((a, b) => Number(b.model_prob ?? 0) - Number(a.model_prob ?? 0));

  const allComparisons = sections.flatMap((section) =>
    Object.entries(section.market.evaluation?.comparisons ?? {}).map(([selectionKey, comparison]) => ({
      section,
      selectionKey,
      comparison,
    }))
  );

  const lines: string[] = [];
  const top = modelEntries[0];

  if (top) {
    const label = getSelectionLabel(lang, "1X2", top.key, analysis.event);
    const fairOdd = fmtOdd(top.fair_odd ?? null);
    const interesting = fmtOdd(top.interesting_above ?? null);

    if (lang === "pt") {
      lines.push(
        `${label} aparece como o lado mais forte no 1X2, com probabilidade estimada de ${fmtPct(
          top.model_prob ?? null
        )}.`
      );
      lines.push(
        `Preço justo perto de ${fairOdd}. Acima de ${interesting}, esse lado começa a ficar mais interessante.`
      );
    } else if (lang === "es") {
      lines.push(
        `${label} aparece como el lado más fuerte en 1X2, con probabilidad estimada de ${fmtPct(
          top.model_prob ?? null
        )}.`
      );
      lines.push(
        `Precio justo cerca de ${fairOdd}. Por encima de ${interesting}, este lado empieza a verse mejor.`
      );
    } else {
      lines.push(
        `${label} is the strongest side in 1X2, with an estimated probability of ${fmtPct(
          top.model_prob ?? null
        )}.`
      );
      lines.push(
        `Fair price is around ${fairOdd}. Above ${interesting}, this side starts to look more attractive.`
      );
    }
  }

  const good = allComparisons
    .filter((item) => item.comparison?.classification === "GOOD")
    .sort((a, b) => Number(b.comparison?.edge ?? 0) - Number(a.comparison?.edge ?? 0))[0];

  const bad = allComparisons
    .filter((item) => item.comparison?.classification === "BAD")
    .sort((a, b) => Number(a.comparison?.edge ?? 0) - Number(b.comparison?.edge ?? 0))[0];

  if (good) {
    const label = getSelectionLabel(
      lang,
      good.section.market.market.market_key,
      good.selectionKey,
      analysis.event
    );
    const marketTitle =
      good.section.key === "totals"
        ? `Over/Under ${good.section.market.market.line ?? 2.5}`
        : good.section.key === "btts"
        ? "BTTS"
        : "1X2";

    if (lang === "pt") {
      lines.push(
        `Melhor valor detectado: ${label} em ${marketTitle}, com odd digitada em ${fmtOdd(
          good.comparison?.odd ?? null
        )} acima do preço justo do modelo.`
      );
    } else if (lang === "es") {
      lines.push(
        `Mejor valor detectado: ${label} en ${marketTitle}, con cuota ingresada de ${fmtOdd(
          good.comparison?.odd ?? null
        )} por encima del precio justo del modelo.`
      );
    } else {
      lines.push(
        `Best value detected: ${label} in ${marketTitle}, with entered odd at ${fmtOdd(
          good.comparison?.odd ?? null
        )} above the model fair price.`
      );
    }
  }

  if (plan === "PRO" && bad) {
    const label = getSelectionLabel(
      lang,
      bad.section.market.market.market_key,
      bad.selectionKey,
      analysis.event
    );

    if (lang === "pt") {
      lines.push(
        `Atenção em ${label}: a odd digitada ficou curta para o modelo. Fair odd em ${fmtOdd(
          bad.comparison?.fair_odd ?? null
        )} vs odd digitada em ${fmtOdd(bad.comparison?.odd ?? null)}.`
      );
    } else if (lang === "es") {
      lines.push(
        `Atención en ${label}: la cuota ingresada quedó corta para el modelo. Fair odd en ${fmtOdd(
          bad.comparison?.fair_odd ?? null
        )} frente a la cuota de ${fmtOdd(bad.comparison?.odd ?? null)}.`
      );
    } else {
      lines.push(
        `Watch ${label}: the entered price looks short versus the model. Fair odd is ${fmtOdd(
          bad.comparison?.fair_odd ?? null
        )} versus ${fmtOdd(bad.comparison?.odd ?? null)} entered.`
      );
    }
  }

  return lines;
}

function getRuntimeTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  } catch {
    return "America/Sao_Paulo";
  }
}

function getApiLang(lang: Lang) {
  if (lang === "pt") return "pt-BR";
  if (lang === "es") return "es";
  return "en";
}

function fmtNullableOdd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}

function imageImportItemTitle(item: ManualAnalysisImageImportPreviewItem) {
  const home = item.resolved?.home_name || item.raw?.home || "—";
  const away = item.resolved?.away_name || item.raw?.away || "—";
  return `${home} x ${away}`;
}

function imageImportItemOddsSummary(item: ManualAnalysisImageImportPreviewItem) {
  const normalized = item.normalized || {};
  const odds1x2 = normalized.odds_1x2 || {};
  const oddsTotals = normalized.odds_totals || {};
  const oddsBtts = normalized.odds_btts || {};
  const totalsLine = normalized.totals_line ?? normalized.line ?? 2.5;

  const parts = [
    odds1x2.H != null ? `H ${fmtNullableOdd(odds1x2.H)}` : null,
    odds1x2.D != null ? `D ${fmtNullableOdd(odds1x2.D)}` : null,
    odds1x2.A != null ? `A ${fmtNullableOdd(odds1x2.A)}` : null,
    oddsTotals.over != null ? `Over ${Number(totalsLine).toFixed(1)} ${fmtNullableOdd(oddsTotals.over)}` : null,
    oddsTotals.under != null ? `Under ${Number(totalsLine).toFixed(1)} ${fmtNullableOdd(oddsTotals.under)}` : null,
    oddsBtts.yes != null ? `BTTS Sim ${fmtNullableOdd(oddsBtts.yes)}` : null,
    oddsBtts.no != null ? `BTTS Não ${fmtNullableOdd(oddsBtts.no)}` : null,
  ].filter(Boolean);

  return parts.join(" · ") || "—";
}

function canSelectImageImportItem(item: ManualAnalysisImageImportPreviewItem) {
  return item.status === "READY";
}

type ManualAnalysisBatchBestEdge = {
  label: string;
  edge: number;
  classification?: string | null;
};

function fmtImageImportEdge(edge: number | null | undefined) {
  if (edge == null || !Number.isFinite(edge)) return "—";
  const value = edge * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} p.p.`;
}

function getBatchAnalysisTitle(analysis?: ManualAnalysisResponse | null) {
  const home = analysis?.event?.home_name;
  const away = analysis?.event?.away_name;

  if (home && away) return `${home} x ${away}`;
  return "Análise gerada";
}

function getBatchAnalysisSubtitle(analysis?: ManualAnalysisResponse | null) {
  const competition = analysis?.event?.competition_name;
  const marketLine = analysis?.markets?.totals?.market?.line;

  if (competition && marketLine != null) {
    return `${competition} · Over/Under ${marketLine}`;
  }

  if (competition) return competition;
  if (marketLine != null) return `Over/Under ${marketLine}`;

  return "Montar aposta";
}

function getBestEdgeFromAnalysis(analysis?: ManualAnalysisResponse | null): ManualAnalysisBatchBestEdge | null {
  const comparisons = analysis?.evaluation?.comparisons as
    | Record<string, unknown>
    | null
    | undefined;

  if (!comparisons || typeof comparisons !== "object") return null;

  const labels: Record<string, string> = {
    H: "Mandante",
    D: "Empate",
    A: "Visitante",
    over: "Over",
    under: "Under",
    yes: "BTTS Sim",
    no: "BTTS Não",
  };

  const candidates: ManualAnalysisBatchBestEdge[] = [];

  function collectFromGroup(group: unknown) {
    if (!group || typeof group !== "object") return;

    Object.entries(group as Record<string, unknown>).forEach(([key, value]) => {
      if (!value || typeof value !== "object") return;

      const payload = value as {
        edge?: unknown;
        classification?: unknown;
      };

      if (typeof payload.edge !== "number" || !Number.isFinite(payload.edge)) return;

      candidates.push({
        label: labels[key] || key,
        edge: payload.edge,
        classification:
          typeof payload.classification === "string" ? payload.classification : null,
      });
    });
  }

  collectFromGroup(comparisons.one_x_two);
  collectFromGroup(comparisons.totals);
  collectFromGroup(comparisons.btts);

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.edge - a.edge);
  return candidates[0];
}

function getBestEdgeFromBatch(
  items: Array<{
    analysis?: ManualAnalysisResponse;
  }>
) {
  const candidates = items
    .map((item) => ({
      analysis: item.analysis,
      best: getBestEdgeFromAnalysis(item.analysis),
    }))
    .filter(
      (
        item
      ): item is {
        analysis: ManualAnalysisResponse;
        best: ManualAnalysisBatchBestEdge;
      } => Boolean(item.analysis && item.best)
    );

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.best.edge - a.best.edge);

  return {
    analysis: candidates[0].analysis,
    best: candidates[0].best,
  };
}

export default function ProductManualAnalysisPage() {
  const store = useProductStore();
  const lang = store.state.lang as Lang;
  const plan = store.entitlements.plan as PlanId;
  const tr = (key: string, vars?: Record<string, unknown>) =>
    t(lang, `product.manualAnalysis.${key}`, vars);

  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [history, setHistory] = useState<ManualAnalysisResponse[]>([]);

  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [nextHistoryOffset, setNextHistoryOffset] = useState(0);

  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [selectedHomeTeamId, setSelectedHomeTeamId] = useState("");
  const [selectedAwayTeamId, setSelectedAwayTeamId] = useState("");

  const [activeMarketTab, setActiveMarketTab] = useState<ManualAnalysisMarketKey>("1X2");
  const [activeResultMarketTab, setActiveResultMarketTab] = useState<MarketSectionKey>("one_x_two");
  const [totalsLine, setTotalsLine] = useState<number>(2.5);
  const [bookmakerName, setBookmakerName] = useState("");

  const [oddH, setOddH] = useState("");
  const [oddD, setOddD] = useState("");
  const [oddA, setOddA] = useState("");
  const [oddOver, setOddOver] = useState("");
  const [oddUnder, setOddUnder] = useState("");
  const [oddYes, setOddYes] = useState("");
  const [oddNo, setOddNo] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<ManualAnalysisResponse | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [imagePreview, setImagePreview] = useState<ManualAnalysisImageImportPreviewResponse | null>(null);
  const [imageSelectionOpen, setImageSelectionOpen] = useState(false);
  const [selectedImageRowIds, setSelectedImageRowIds] = useState<number[]>([]);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isImageBatchSubmitting, setIsImageBatchSubmitting] = useState(false);
  const [imageImportError, setImageImportError] = useState<string | null>(null);
  const [imageBatchResults, setImageBatchResults] = useState<
    Array<{
      row_id: number;
      analysis_id?: number | null;
      status: string;
      consumed_credit?: boolean;
      analysis?: ManualAnalysisResponse;
    }>
  >([]);
  const [imageBatchSkipped, setImageBatchSkipped] = useState<Array<Record<string, unknown>>>([]);

  const hasFeatureAccess =
    ALLOWED_PLANS.includes(plan) || Boolean(store.accessContext?.product_internal_access);

  const remainingCredits = store.backendUsage.is_ready
    ? store.backendUsage.remaining ?? store.entitlements.credits.remaining_today
    : store.entitlements.credits.remaining_today;

  const readyImageItems = useMemo(
    () => (imagePreview?.items ?? []).filter((item) => item.status === "READY"),
    [imagePreview]
  );

  const maxImageSelectable = Math.max(0, Math.min(readyImageItems.length, remainingCredits ?? 0));

  const selectedImageItems = useMemo(
    () => readyImageItems.filter((item) => selectedImageRowIds.includes(item.row_id)),
    [readyImageItems, selectedImageRowIds]
  );

  const imageBatchAvailableAnalyses = useMemo(
    () =>
      imageBatchResults
        .map((item) => item.analysis)
        .filter((item): item is ManualAnalysisResponse => Boolean(item?.ok)),
    [imageBatchResults]
  );

  const imageBatchBestOpportunity = useMemo(
    () => getBestEdgeFromBatch(imageBatchResults),
    [imageBatchResults]
  );

  const imageBatchGeneratedCount = imageBatchResults.filter(
    (item) => item.status === "generated"
  ).length;

  const imageBatchReusedCount = imageBatchResults.filter(
    (item) => item.status === "already_generated"
  ).length;

  function applyManualAnalysisUsage(response: ManualAnalysisResponse) {
    const usage = response.usage;
    if (!usage) return;

    store.applyBackendUsage({
      date_key:
        response.date_key ??
        store.backendUsage.date_key ??
        new Date().toISOString().slice(0, 10),
      credits_used: usage.credits_used,
      revealed_count: usage.revealed_count,
      daily_limit: usage.daily_limit,
      remaining: usage.remaining,
      revealed_fixture_keys:
        usage.revealed_fixture_keys ??
        store.backendUsage.revealed_fixture_keys ??
        [],
    });
  }

  function applyManualAnalysisBatchUsage(response: { usage?: ManualAnalysisResponse["usage"] | null }) {
    const usage = response.usage;
    if (!usage) return;

    store.applyBackendUsage({
      date_key:
        store.backendUsage.date_key ??
        new Date().toISOString().slice(0, 10),
      credits_used: usage.credits_used,
      revealed_count: usage.revealed_count,
      daily_limit: usage.daily_limit,
      remaining: usage.remaining,
      revealed_fixture_keys:
        usage.revealed_fixture_keys ??
        store.backendUsage.revealed_fixture_keys ??
        [],
    });
  }

  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      if (!hasFeatureAccess) {
        setIsLoadingHistory(false);
        return;
      }

      try {
        setIsLoadingHistory(true);
        const response = await fetchManualAnalysisHistory(MANUAL_ANALYSIS_HISTORY_PAGE_SIZE, 0);
        if (!isMounted) return;

        setHistory(response.items ?? []);
        setHasMoreHistory(Boolean(response.has_more));
        setNextHistoryOffset(response.next_offset ?? (response.items ?? []).length);
      } catch (error) {
        console.error("manual analysis history failed", error);
        if (!isMounted) return;
        setHistory([]);
        setHasMoreHistory(false);
        setNextHistoryOffset(0);
      } finally {
        if (isMounted) setIsLoadingHistory(false);
      }
    }

    void loadHistory();

    return () => {
      isMounted = false;
    };
  }, [hasFeatureAccess]);

  async function handleLoadMoreHistory() {
    if (isLoadingMoreHistory || !hasMoreHistory) return;

    try {
      setIsLoadingMoreHistory(true);

      const response = await fetchManualAnalysisHistory(
        MANUAL_ANALYSIS_HISTORY_PAGE_SIZE,
        nextHistoryOffset
      );

      setHistory((prev) => {
        const merged = [...prev];

        for (const item of response.items ?? []) {
          const alreadyExists = merged.some(
            (current) =>
              current.analysis_id != null &&
              item.analysis_id != null &&
              current.analysis_id === item.analysis_id
          );

          if (!alreadyExists) {
            merged.push(item);
          }
        }

        return merged.slice(0, 20);
      });

      setHasMoreHistory(Boolean(response.has_more));
      setNextHistoryOffset(response.next_offset ?? nextHistoryOffset + (response.items ?? []).length);
    } catch (error) {
      console.error("manual analysis load more history failed", error);
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadTeams() {
      if (!hasFeatureAccess) {
        setTeams([]);
        setIsLoadingTeams(false);
        return;
      }

      try {
        setIsLoadingTeams(true);

        // A análise manual agora usa seleção livre de times.
        // A liga/referência estatística fica escondida do usuário final
        // e deve ser resolvida automaticamente pelo backend.
        const nextTeams = await listTeams(2000, 0);

        if (!isMounted) return;
        setTeams(nextTeams ?? []);
      } catch (error) {
        console.error("manual analysis teams failed", error);
        if (!isMounted) return;
        setTeams([]);
      } finally {
        if (isMounted) setIsLoadingTeams(false);
      }
    }

    void loadTeams();

    return () => {
      isMounted = false;
    };
  }, [hasFeatureAccess]);

  // Liga de referência removida da UI final.
  // O backend resolve automaticamente o contexto estatístico do matchup manual.

  const selectedHomeTeam = useMemo(
    () => teams.find((team) => String(team.team_id) === selectedHomeTeamId) ?? null,
    [teams, selectedHomeTeamId]
  );

  const selectedAwayTeam = useMemo(
    () => teams.find((team) => String(team.team_id) === selectedAwayTeamId) ?? null,
    [teams, selectedAwayTeamId]
  );

  const sameTeamSelected =
    Boolean(selectedHomeTeamId) &&
    Boolean(selectedAwayTeamId) &&
    selectedHomeTeamId === selectedAwayTeamId;

  // Liga de referência removida da UI final.
  // O backend resolve automaticamente o contexto estatístico do matchup manual.

  const homeOptions = useMemo(
    () =>
      teams
        .filter((team) => String(team.team_id) !== selectedAwayTeamId)
        .map((team) => ({
          value: String(team.team_id),
          label: team.country ? `${team.name} · ${team.country}` : team.name,
          searchText: `${team.name} ${team.country || ""}`,
        })),
    [teams, selectedAwayTeamId]
  );

  const awayOptions = useMemo(
    () =>
      teams
        .filter((team) => String(team.team_id) !== selectedHomeTeamId)
        .map((team) => ({
          value: String(team.team_id),
          label: team.country ? `${team.name} · ${team.country}` : team.name,
          searchText: `${team.name} ${team.country || ""}`,
        })),
    [teams, selectedHomeTeamId]
  );

  const canAnalyze = Boolean(selectedHomeTeam) && Boolean(selectedAwayTeam) && !sameTeamSelected;

  const summaryRows = useMemo(() => {
    const rows: Array<{ label: string; value: string }> = [];

    if (selectedHomeTeam && selectedAwayTeam) {
      rows.push({
        label: tr("summary.match"),
        value: `${selectedHomeTeam.name} x ${selectedAwayTeam.name}`,
      });
    }

    rows.push({ label: tr("summary.market"), value: tr("summary.completeAnalysis") });

    const odds1x2 = [oddH ? `H ${oddH}` : null, oddD ? `D ${oddD}` : null, oddA ? `A ${oddA}` : null]
      .filter(Boolean)
      .join(" · ");

    const oddsTotals = [oddOver ? `Over ${oddOver}` : null, oddUnder ? `Under ${oddUnder}` : null]
      .filter(Boolean)
      .join(" · ");

    const oddsBtts = [
      oddYes ? `${tr("yesLabel")} ${oddYes}` : null,
      oddNo ? `${tr("noLabel")} ${oddNo}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    rows.push({
      label: tr("summary.odds"),
      value:
        [odds1x2, oddsTotals, oddsBtts].filter(Boolean).join(" | ") ||
        tr("summary.noOdds"),
    });

    if (bookmakerName.trim()) {
      rows.push({ label: tr("summary.bookmaker"), value: bookmakerName.trim() });
    }

    return rows;
  }, [
    selectedHomeTeam,
    selectedAwayTeam,
    bookmakerName,
    oddH,
    oddD,
    oddA,
    oddOver,
    oddUnder,
    oddYes,
    oddNo,
    totalsLine,
  ]);

  async function handleImageImportPreview() {
    if (!imageFile || isImageUploading) return;

    setImageImportError(null);
    setErrorMessage(null);
    setIsImageUploading(true);
    setImageBatchResults([]);
    setImageBatchSkipped([]);

    try {
      const response = await postManualAnalysisImagePreview(imageFile, {
        lang: getApiLang(lang),
        timezone_name: getRuntimeTimezone(),
      });

      if (!response.ok) {
        setImageImportError(response.message ?? tr("imageImportGenericError"));
        return;
      }

      setImagePreview(response);

      const readyIds = (response.items ?? [])
        .filter((item) => item.status === "READY")
        .map((item) => item.row_id);

      const selectableCount = Math.max(0, Math.min(readyIds.length, remainingCredits ?? 0));
      setSelectedImageRowIds(readyIds.slice(0, selectableCount));
      setImageSelectionOpen(true);
    } catch (error) {
      console.error("manual analysis image preview failed", error);
      setImageImportError(tr("imageImportGenericError"));
    } finally {
      setIsImageUploading(false);
    }
  }

  function toggleImageImportRow(rowId: number) {
    const isSelected = selectedImageRowIds.includes(rowId);

    if (isSelected) {
      setSelectedImageRowIds((prev) => prev.filter((current) => current !== rowId));
      return;
    }

    if (selectedImageRowIds.length >= maxImageSelectable) {
      setImageImportError(tr("imageImportCreditLimitReached"));
      return;
    }

    setSelectedImageRowIds((prev) => [...prev, rowId]);
  }

  async function handleImageImportBatchEvaluate() {
    if (!imagePreview || !selectedImageRowIds.length || isImageBatchSubmitting) return;

    setImageImportError(null);
    setErrorMessage(null);
    setIsImageBatchSubmitting(true);

    try {
      const response = await postManualAnalysisImageEvaluateBatch(
        imagePreview.request_id,
        selectedImageRowIds
      );

      applyManualAnalysisBatchUsage(response);

      if (!response.ok) {
        setImageImportError(response.message ?? tr("imageImportGenericError"));
        return;
      }

      setImageBatchResults(response.analyses ?? []);
      setImageBatchSkipped(response.skipped ?? []);

      const availableAnalyses = response.analyses
        .map((item) => item.analysis)
        .filter((item): item is ManualAnalysisResponse => Boolean(item?.ok));

      if (availableAnalyses.length) {
        const first = availableAnalyses[0];

        setCurrentAnalysis(first);
        setActiveResultMarketTab("one_x_two");
        setHistory((prev) => {
          const merged = [...availableAnalyses, ...prev];

          const unique = merged.filter((item, index, arr) => {
            if (item.analysis_id == null) return true;
            return arr.findIndex((candidate) => candidate.analysis_id === item.analysis_id) === index;
          });

          return unique.slice(0, 20);
        });

        setNextHistoryOffset((prev) => Math.min(prev + availableAnalyses.length, 20));
        setImageSelectionOpen(false);
        return;
      }

      const alreadyGenerated = response.analyses.some((item) => item.status === "already_generated");
      if (alreadyGenerated) {
        setImageImportError(tr("imageImportAlreadyGenerated"));
        return;
      }

      setImageImportError(tr("imageImportNoAnalysisGenerated"));
    } catch (error) {
      console.error("manual analysis image batch failed", error);
      setImageImportError(tr("imageImportGenericError"));
    } finally {
      setIsImageBatchSubmitting(false);
    }
  }

  async function handleConfirmAnalyze() {
    if (!selectedHomeTeam || !selectedAwayTeam || sameTeamSelected) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: ManualAnalysisEvaluateRequest = {
      sport_key: "soccer",

      // Liga/referência ocultada da UI final.
      // O backend deve resolver automaticamente o contexto estatístico.
      league_id: null,
      season: null,
      artifact_filename: null,

      home_team_id: selectedHomeTeam.team_id,
      away_team_id: selectedAwayTeam.team_id,
      market_key: "FULL",
      totals_line: totalsLine,
      bookmaker_name: bookmakerName.trim() || null,
      odds_1x2: {
        H: oddToNumber(oddH),
        D: oddToNumber(oddD),
        A: oddToNumber(oddA),
      },
      odds_totals: {
        over: oddToNumber(oddOver),
        under: oddToNumber(oddUnder),
      },
      odds_btts: {
        yes: oddToNumber(oddYes),
        no: oddToNumber(oddNo),
      },
    };

    try {
      const response = await postManualAnalysisEvaluate(payload);

      applyManualAnalysisUsage(response);

      if (!response.ok) {
        setErrorMessage(response.message ?? tr("genericError"));
        setConfirmOpen(false);
        return;
      }

      setCurrentAnalysis(response);
      setActiveResultMarketTab("one_x_two");
      setHistory((prev) =>
        [response, ...prev.filter((item) => item.analysis_id !== response.analysis_id)].slice(0, 20)
      );

      setNextHistoryOffset((prev) => Math.min(prev + 1, 20));
      setConfirmOpen(false);
    } catch (error) {
      console.error("manual analysis evaluate failed", error);
      setErrorMessage(tr("genericError"));
      setConfirmOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!hasFeatureAccess) {
    return (
      <section className="manual-analysis-page">
        <div className="manual-analysis-lock-card">
          <h1>{tr("lockedTitle")}</h1>
          <p>{tr("lockedBody")}</p>
          <Link to="/app/account" className="manual-analysis-primary-btn">
            {tr("lockedCta")}
          </Link>
        </div>
      </section>
    );
  }

  const narrativeLines = buildNarrative(lang, plan, currentAnalysis);

  const resultMarketSections = getAnalysisMarketSections(currentAnalysis);
  const activeResultSection =
    resultMarketSections.find((section) => section.key === activeResultMarketTab) ??
    resultMarketSections[0] ??
    null;
  const activeResultSectionKey = activeResultSection?.key ?? activeResultMarketTab;

  return (
    <section className="manual-analysis-page">
      <div className="manual-analysis-hero">
        <h1 className="manual-analysis-title">{tr("title")}</h1>
        <p className="manual-analysis-subtitle">{tr("subtitle")}</p>
      </div>

      <div className="manual-analysis-shell">
        <div className="manual-analysis-card manual-analysis-card--history">
          {/*
            Campo de casa de aposta ocultado temporariamente da UI final.

            Mantido para reaproveitamento futuro:
            - state: bookmakerName
            - i18n: bookmakerLabel/bookmakerPlaceholder
            - payload: bookmaker_name

            Quando voltarmos a exibir o campo, basta restaurar este bloco:

            <div className="manual-analysis-selection-grid">
              <div className="manual-analysis-field">
                <label>{tr("bookmakerLabel")}</label>
                <input
                  type="text"
                  value={bookmakerName}
                  onChange={(event) => setBookmakerName(event.target.value)}
                  placeholder={tr("bookmakerPlaceholder")}
                />
              </div>
            </div>
          */}

          <div className="manual-analysis-image-import-card">
            <div className="manual-analysis-image-import-top">
              <div className="manual-analysis-image-import-icon" aria-hidden="true">
                ✦
              </div>

              <div className="manual-analysis-image-import-copy">
                <div className="manual-analysis-image-import-kicker">
                  {tr("imageImportKicker")}
                </div>
                <strong>{tr("imageImportTitle")}</strong>
                <span>{tr("imageImportBody")}</span>
              </div>
            </div>

            <div className="manual-analysis-image-import-dropzone">
              <input
                ref={imageFileInputRef}
                className="manual-analysis-image-import-native-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  setImageImportError(null);
                  setImageBatchResults([]);
                  setImageBatchSkipped([]);
                  setImagePreview(null);
                  setSelectedImageRowIds([]);
                  setImageFile(event.target.files?.[0] ?? null);
                }}
              />

              <button
                type="button"
                className="manual-analysis-image-import-picker"
                onClick={() => imageFileInputRef.current?.click()}
              >
                {tr("imageImportPickFile")}
              </button>

              <div className="manual-analysis-image-import-file">
                <span>{imageFile ? tr("imageImportSelectedFile") : tr("imageImportNoFile")}</span>
                <strong>{imageFile?.name ?? tr("imageImportAcceptedFormats")}</strong>
              </div>

              <button
                type="button"
                className="manual-analysis-primary-btn manual-analysis-image-import-submit"
                onClick={() => void handleImageImportPreview()}
                disabled={!imageFile || isImageUploading}
              >
                {isImageUploading ? tr("imageImportUploading") : tr("imageImportSubmit")}
              </button>
            </div>

            <div className="manual-analysis-image-import-footnote">
              {tr("imageImportFootnote")}
            </div>

            {imageImportError ? (
              <div className="manual-analysis-error manual-analysis-error--compact">
                {imageImportError}
              </div>
            ) : null}
          </div>

          {imageBatchResults.length || imageBatchSkipped.length ? (
            <div className="manual-analysis-image-batch-result">
              <div className="manual-analysis-image-batch-head">
                <div>
                  <strong>
                    {tr("imageImportBatchResultTitle", {
                      count: imageBatchAvailableAnalyses.length,
                    })}
                  </strong>
                  <span>
                    {tr("imageImportBatchResultBody", {
                      generated: imageBatchGeneratedCount,
                      reused: imageBatchReusedCount,
                      skipped: imageBatchSkipped.length,
                    })}
                  </span>
                </div>

                {imageBatchAvailableAnalyses.length ? (
                  <button
                    type="button"
                    className="manual-analysis-secondary-btn"
                    onClick={() => {
                      setImageBatchResults([]);
                      setImageBatchSkipped([]);
                    }}
                  >
                    {tr("imageImportBatchResultClear")}
                  </button>
                ) : null}
              </div>

              {imageBatchBestOpportunity ? (
                <button
                  type="button"
                  className="manual-analysis-image-best-card"
                  onClick={() => {
                    setCurrentAnalysis(imageBatchBestOpportunity.analysis);
                    setActiveResultMarketTab("one_x_two");
                  }}
                >
                  <span>{tr("imageImportBatchBest")}</span>
                  <strong>{getBatchAnalysisTitle(imageBatchBestOpportunity.analysis)}</strong>
                  <em>
                    {imageBatchBestOpportunity.best.label} ·{" "}
                    {tr("imageImportEdgeLabel")}{" "}
                    {fmtImageImportEdge(imageBatchBestOpportunity.best.edge)}
                  </em>
                </button>
              ) : null}

              {imageBatchAvailableAnalyses.length ? (
                <div className="manual-analysis-image-batch-list">
                  {imageBatchResults.map((item) => {
                    const analysis = item.analysis;
                    const best = getBestEdgeFromAnalysis(analysis);

                    return (
                      <div key={`${item.row_id}-${item.analysis_id ?? item.status}`} className="manual-analysis-image-batch-item">
                        <div className="manual-analysis-image-batch-item-copy">
                          <strong>{getBatchAnalysisTitle(analysis)}</strong>
                          <span>{getBatchAnalysisSubtitle(analysis)}</span>

                          {best ? (
                            <em>
                              {best.label} · {tr("imageImportEdgeLabel")}{" "}
                              {fmtImageImportEdge(best.edge)}
                            </em>
                          ) : (
                            <em>{tr("imageImportNoClearEdge")}</em>
                          )}
                        </div>

                        <div className="manual-analysis-image-batch-item-actions">
                          <span
                            className={`manual-analysis-image-batch-status ${
                              item.status === "already_generated"
                                ? "manual-analysis-image-batch-status--reused"
                                : "manual-analysis-image-batch-status--generated"
                            }`}
                          >
                            {item.status === "already_generated"
                              ? tr("imageImportReused")
                              : tr("imageImportGenerated")}
                          </span>

                          {analysis ? (
                            <button
                              type="button"
                              className="manual-analysis-secondary-btn"
                              onClick={() => {
                                setCurrentAnalysis(analysis);
                                setActiveResultMarketTab("one_x_two");
                              }}
                            >
                              {tr("imageImportOpenAnalysis")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {imageBatchSkipped.length ? (
                <div className="manual-analysis-image-skipped">
                  <strong>{tr("imageImportSkippedTitle")}</strong>
                  <span>
                    {tr("imageImportSkippedBody", {
                      count: imageBatchSkipped.length,
                    })}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="manual-analysis-selection-grid manual-analysis-selection-grid--teams">
            <SearchableSingleSelect
              label={tr("homeTeamLabel")}
              placeholder={
                isLoadingTeams ? tr("loadingTeams") : teams.length ? tr("homeTeamPlaceholder") : tr("teamEmpty")
              }
              searchPlaceholder={tr("teamSearchPlaceholder")}
              emptyText={tr("teamEmpty")}
              selectedValue={selectedHomeTeamId}
              options={homeOptions}
              disabled={isLoadingTeams || !teams.length}
              onChange={setSelectedHomeTeamId}
              className="manual-analysis-select"
            />

            <SearchableSingleSelect
              label={tr("awayTeamLabel")}
              placeholder={
                isLoadingTeams ? tr("loadingTeams") : teams.length ? tr("awayTeamPlaceholder") : tr("teamEmpty")
              }
              searchPlaceholder={tr("teamSearchPlaceholder")}
              emptyText={tr("teamEmpty")}
              selectedValue={selectedAwayTeamId}
              options={awayOptions}
              disabled={isLoadingTeams || !teams.length}
              onChange={setSelectedAwayTeamId}
              className="manual-analysis-select"
            />
          </div>

          <div className="manual-analysis-matchup-preview">
            <div className="manual-analysis-matchup-label">{tr("matchupPreviewLabel")}</div>
            <div className="manual-analysis-matchup-value">
              {selectedHomeTeam && selectedAwayTeam
                ? `${selectedHomeTeam.name} x ${selectedAwayTeam.name}`
                : tr("matchupPreviewEmpty")}
            </div>
            {/*
              Liga/referência estatística ocultada do usuário final.
              O matchup manual deve parecer livre: Time A x Time B.
            */}
          </div>

          {sameTeamSelected ? (
            <div className="manual-analysis-warning">{tr("sameTeamWarning")}</div>
          ) : (
            <div className="manual-analysis-inline-note">{tr("matchupHint")}</div>
          )}

          <div className="manual-analysis-market-stack">
            <div className="manual-analysis-tabs" role="tablist" aria-label={tr("completeAnalysisLabel")}>
              <button
                type="button"
                role="tab"
                aria-selected={activeMarketTab === "1X2"}
                className={`manual-analysis-tab-btn ${activeMarketTab === "1X2" ? "is-active" : ""}`}
                onClick={() => setActiveMarketTab("1X2")}
              >
                {tr("market1x2")}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeMarketTab === "TOTALS"}
                className={`manual-analysis-tab-btn ${activeMarketTab === "TOTALS" ? "is-active" : ""}`}
                onClick={() => setActiveMarketTab("TOTALS")}
              >
                {tr("marketTotals")}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeMarketTab === "BTTS"}
                className={`manual-analysis-tab-btn ${activeMarketTab === "BTTS" ? "is-active" : ""}`}
                onClick={() => setActiveMarketTab("BTTS")}
              >
                {tr("marketBtts")}
              </button>
            </div>

            <div className="manual-analysis-tab-panel">
              {activeMarketTab === "1X2" ? (
                <div className="manual-analysis-market-section">
                  <div className="manual-analysis-market-section-head">
                    <h3>{tr("market1x2")}</h3>
                    <span>{tr("optionalOddsHint")}</span>
                  </div>

                  <div className="manual-analysis-odds-grid manual-analysis-odds-grid--three">
                    <div className="manual-analysis-field">
                      <label>{tr("homeLabel")}</label>
                      <input
                        value={oddH}
                        onChange={(event) => setOddH(sanitizeOddInput(event.target.value))}
                        placeholder={ODD_INPUT_PLACEHOLDER}
                        inputMode="decimal"
                      />
                    </div>

                    <div className="manual-analysis-field">
                      <label>{tr("drawLabel")}</label>
                      <input
                        value={oddD}
                        onChange={(event) => setOddD(sanitizeOddInput(event.target.value))}
                        placeholder={ODD_INPUT_PLACEHOLDER}
                        inputMode="decimal"
                      />
                    </div>

                    <div className="manual-analysis-field">
                      <label>{tr("awayLabel")}</label>
                      <input
                        value={oddA}
                        onChange={(event) => setOddA(sanitizeOddInput(event.target.value))}
                        placeholder={ODD_INPUT_PLACEHOLDER}
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {activeMarketTab === "TOTALS" ? (
                <div className="manual-analysis-market-section">
                  <div className="manual-analysis-market-section-head">
                    <h3>{tr("marketTotals")}</h3>
                    <span>{tr("optionalOddsHint")}</span>
                  </div>

                  <div className="manual-analysis-market-tools">
                    <div className="manual-analysis-field">
                      <label>{tr("totalsLineLabel")}</label>
                      <select
                        className="manual-analysis-line-select"
                        value={String(totalsLine)}
                        onChange={(event) => setTotalsLine(Number(event.target.value))}
                      >
                        {TOTALS_LINE_OPTIONS.map((line) => (
                          <option key={line} value={line}>
                            {line.toFixed(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="manual-analysis-odds-grid manual-analysis-odds-grid--two">
                    <div className="manual-analysis-field">
                      <label>{tr("overLabel", { line: totalsLine.toFixed(1) })}</label>
                      <input
                        value={oddOver}
                        onChange={(event) => setOddOver(sanitizeOddInput(event.target.value))}
                        placeholder={ODD_INPUT_PLACEHOLDER}
                        inputMode="decimal"
                      />
                    </div>

                    <div className="manual-analysis-field">
                      <label>{tr("underLabel", { line: totalsLine.toFixed(1) })}</label>
                      <input
                        value={oddUnder}
                        onChange={(event) => setOddUnder(sanitizeOddInput(event.target.value))}
                        placeholder={ODD_INPUT_PLACEHOLDER}
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {activeMarketTab === "BTTS" ? (
                <div className="manual-analysis-market-section">
                  <div className="manual-analysis-market-section-head">
                    <h3>{tr("marketBtts")}</h3>
                    <span>{tr("optionalOddsHint")}</span>
                  </div>

                  <div className="manual-analysis-odds-grid manual-analysis-odds-grid--two">
                    <div className="manual-analysis-field">
                      <label>{tr("yesLabel")}</label>
                      <input
                        value={oddYes}
                        onChange={(event) => setOddYes(sanitizeOddInput(event.target.value))}
                        placeholder={ODD_INPUT_PLACEHOLDER}
                        inputMode="decimal"
                      />
                    </div>

                    <div className="manual-analysis-field">
                      <label>{tr("noLabel")}</label>
                      <input
                        value={oddNo}
                        onChange={(event) => setOddNo(sanitizeOddInput(event.target.value))}
                        placeholder={ODD_INPUT_PLACEHOLDER}
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="manual-analysis-note">{tr("creditHint")}</div>

          {errorMessage ? <div className="manual-analysis-error">{errorMessage}</div> : null}

          <div className="manual-analysis-actions">
            <button
              type="button"
              className="manual-analysis-primary-btn"
              disabled={!canAnalyze || isSubmitting}
              onClick={() => setConfirmOpen(true)}
            >
              {isSubmitting ? tr("submitBusy") : tr("submit")}
            </button>
          </div>
        </div>

        <div className="manual-analysis-card manual-analysis-result-card">
          <div className="manual-analysis-result-head">
            <h2>{tr("resultTitle")}</h2>
            {currentAnalysis?.saved_at_utc ? (
              <span className="manual-analysis-result-time">
                {new Date(currentAnalysis.saved_at_utc).toLocaleString()}
              </span>
            ) : null}
          </div>

          {currentAnalysis ? (
            <>
              <div className="manual-analysis-result-match">
                {currentAnalysis.event?.home_name} x {currentAnalysis.event?.away_name}
              </div>

              {/*
                Competição/temporada ocultada no resultado final.
                A referência estatística continua podendo existir no payload/modelo,
                mas não precisa aparecer para o usuário.
              */}

              <div className="manual-analysis-narrative-list">
                {narrativeLines.map((line, index) => (
                  <p key={`${line}-${index}`}>{line}</p>
                ))}
              </div>

              <div className="manual-analysis-result-markets">
                {resultMarketSections.length ? (
                  <>
                    <div
                      className="manual-analysis-tabs manual-analysis-tabs--result"
                      role="tablist"
                      aria-label={tr("completeAnalysisLabel")}
                    >
                      {resultMarketSections.map(({ key: sectionKey, market }) => (
                        <button
                          key={sectionKey}
                          type="button"
                          role="tab"
                          aria-selected={activeResultSectionKey === sectionKey}
                          className={`manual-analysis-tab-btn ${
                            activeResultSectionKey === sectionKey ? "is-active" : ""
                          }`}
                          onClick={() => setActiveResultMarketTab(sectionKey)}
                        >
                          {getMarketSectionTitle(tr, sectionKey, market)}
                        </button>
                      ))}
                    </div>

                    {activeResultSection ? (
                      <div className="manual-analysis-result-market-section">
                        <div className="manual-analysis-result-market-title">
                          {getMarketSectionTitle(tr, activeResultSection.key, activeResultSection.market)}
                        </div>

                        <div className="manual-analysis-comparison-grid">
                          {Object.entries(activeResultSection.market.model?.selections ?? {}).map(
                            ([selectionKey, selectionValue]) => {
                              const comparison =
                                activeResultSection.market.evaluation?.comparisons?.[selectionKey] ?? null;

                              return (
                                <div
                                  key={`${activeResultSection.key}-${selectionKey}`}
                                  className="manual-analysis-comparison-card"
                                >
                                  <div className="manual-analysis-comparison-label">
                                    {getSelectionLabel(
                                      lang,
                                      activeResultSection.market.market?.market_key ?? "1X2",
                                      selectionKey,
                                      currentAnalysis.event
                                    )}
                                  </div>

                                  <div className="manual-analysis-comparison-row">
                                    <span>{tr("resultModelProb")}</span>
                                    <strong>{fmtPct(selectionValue?.model_prob ?? null)}</strong>
                                  </div>

                                  <div className="manual-analysis-comparison-row">
                                    <span>{tr("resultFairOdd")}</span>
                                    <strong>{fmtOdd(selectionValue?.fair_odd ?? null)}</strong>
                                  </div>

                                  <div className="manual-analysis-comparison-row">
                                    <span>{tr("resultInterestingOdd")}</span>
                                    <strong>{fmtOdd(selectionValue?.interesting_above ?? null)}</strong>
                                  </div>

                                  <div className="manual-analysis-comparison-row">
                                    <span>{tr("resultManualOdd")}</span>
                                    <strong>{fmtOdd(comparison?.odd ?? null)}</strong>
                                  </div>

                                  {comparison ? (
                                    <div
                                      className={`manual-analysis-badge manual-analysis-badge--${String(
                                        comparison.classification || "ALIGNED"
                                      ).toLowerCase()}`}
                                    >
                                      {comparison.classification === "GOOD"
                                        ? tr("badgeGood")
                                        : comparison.classification === "BAD"
                                        ? tr("badgeBad")
                                        : tr("badgeAligned")}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            }
                          )}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="manual-analysis-empty">{tr("resultEmpty")}</div>
          )}
        </div>
      </div>

      <div className="manual-analysis-card manual-analysis-card--form">
        <div className="manual-analysis-result-head">
          <h2>{tr("historyTitle")}</h2>
        </div>

        {isLoadingHistory ? <div className="manual-analysis-empty">{tr("historyLoading")}</div> : null}

        {!isLoadingHistory && !history.length ? (
          <div className="manual-analysis-empty">{tr("historyEmpty")}</div>
        ) : null}

        {!isLoadingHistory && history.length ? (
          <div className="manual-analysis-history-list">
            {history.map((item) => (
              <button
                key={item.analysis_id ?? `${item.created_at_utc}-${item.event?.event_id}`}
                type="button"
                className="manual-analysis-history-item"
                onClick={() => {
                  setCurrentAnalysis(item);
                  const firstSection = getAnalysisMarketSections(item)[0];
                  if (firstSection) setActiveResultMarketTab(firstSection.key);
                }}
              >
                <div>
                  <div className="manual-analysis-history-match">
                    {item.event?.home_name} x {item.event?.away_name}
                  </div>

                  <div className="manual-analysis-history-meta">
                    {item.market?.market_key === "FULL"
                      ? tr("historyCompleteAnalysis")
                      : item.market?.market_key === "1X2"
                      ? tr("market1x2")
                      : item.market?.market_key === "TOTALS"
                      ? `${tr("marketTotals")} ${item.market?.line ?? ""}`
                      : tr("marketBtts")}
                    {" · "}
                    {item.created_at_utc ? new Date(item.created_at_utc).toLocaleString() : "—"}
                  </div>
                </div>

                <span className="manual-analysis-history-open">{tr("historyOpen")}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!isLoadingHistory && hasMoreHistory ? (
          <button
            type="button"
            className="manual-analysis-history-more-btn"
            onClick={handleLoadMoreHistory}
            disabled={isLoadingMoreHistory}
          >
            {isLoadingMoreHistory ? tr("historyLoadingMore") : tr("historyLoadMore")}
          </button>
        ) : null}


      </div>

      {imageSelectionOpen && imagePreview ? (
        <div className="manual-analysis-modal-backdrop" role="presentation">
          <div
            className="manual-analysis-modal manual-analysis-modal--image-import"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-analysis-image-import-title"
          >
            <div className="manual-analysis-modal-head">
              <h2 id="manual-analysis-image-import-title">{tr("imageImportModalTitle")}</h2>
              <p className="manual-analysis-modal-lead">
                {tr("imageImportModalBody")}
              </p>
            </div>

            <div className="manual-analysis-image-summary">
              <div>
                <span>{tr("imageImportDetected")}</span>
                <strong>{imagePreview.summary.items_detected}</strong>
              </div>
              <div>
                <span>{tr("imageImportReady")}</span>
                <strong>{imagePreview.summary.auto_resolved}</strong>
              </div>
              <div>
                <span>{tr("imageImportPending")}</span>
                <strong>{imagePreview.summary.needs_confirmation}</strong>
              </div>
              <div>
                <span>{tr("imageImportRejected")}</span>
                <strong>{imagePreview.summary.rejected}</strong>
              </div>
            </div>

            {imagePreview.image_type === "live" ? (
              <div className="manual-analysis-note manual-analysis-note--modal">
                {tr("imageImportLiveWarning")}
              </div>
            ) : null}

            {maxImageSelectable < readyImageItems.length ? (
              <div className="manual-analysis-warning">
                {tr("imageImportCreditLimit", {
                  available: remainingCredits,
                  total: readyImageItems.length,
                })}
              </div>
            ) : null}

            <div className="manual-analysis-image-selection-list">
              {(imagePreview.items ?? []).map((item) => {
                const isReady = canSelectImageImportItem(item);
                const isSelected = selectedImageRowIds.includes(item.row_id);
                const disabledByCredits = !isSelected && selectedImageRowIds.length >= maxImageSelectable;
                const disabled = !isReady || disabledByCredits || isImageBatchSubmitting;

                return (
                  <label
                    key={item.row_id}
                    className={`manual-analysis-image-row ${
                      isReady ? "manual-analysis-image-row--ready" : "manual-analysis-image-row--blocked"
                    } ${isSelected ? "is-selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => toggleImageImportRow(item.row_id)}
                    />

                    <span className="manual-analysis-image-row-main">
                      <strong>{imageImportItemTitle(item)}</strong>
                      <span>{imageImportItemOddsSummary(item)}</span>

                      {item.normalized?.line_was_defaulted ? (
                        <em>{tr("imageImportLineDefaulted")}</em>
                      ) : null}

                      {item.message ? <em>{item.message}</em> : null}
                    </span>

                    <span className="manual-analysis-image-row-status">
                      {item.status === "READY"
                        ? tr("imageImportStatusReady")
                        : item.status === "NEEDS_CONFIRMATION"
                        ? tr("imageImportStatusNeedsConfirmation")
                        : item.status === "UNSUPPORTED_MARKET"
                        ? tr("imageImportStatusUnsupported")
                        : item.status === "LOW_CONFIDENCE"
                        ? tr("imageImportStatusLowConfidence")
                        : tr("imageImportStatusUnreadable")}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="manual-analysis-note manual-analysis-note--modal">
              {tr("imageImportCreditSummary", {
                selected: selectedImageRowIds.length,
                credits: selectedImageRowIds.length,
                remaining: remainingCredits,
              })}
            </div>

            <div className="manual-analysis-modal-actions">
              <button
                type="button"
                className="manual-analysis-secondary-btn"
                onClick={() => setImageSelectionOpen(false)}
                disabled={isImageBatchSubmitting}
              >
                {tr("confirmCancel")}
              </button>

              <button
                type="button"
                className="manual-analysis-primary-btn"
                onClick={() => void handleImageImportBatchEvaluate()}
                disabled={!selectedImageRowIds.length || isImageBatchSubmitting}
              >
                {isImageBatchSubmitting
                  ? tr("imageImportBatchBusy")
                  : tr("imageImportBatchSubmit", { count: selectedImageRowIds.length })}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="manual-analysis-modal-backdrop" role="presentation">
          <div
            className="manual-analysis-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-analysis-confirm-title"
          >
            <div className="manual-analysis-modal-head">
              <h2 id="manual-analysis-confirm-title">{tr("confirmTitle")}</h2>
              <p className="manual-analysis-modal-lead">{tr("confirmBody")}</p>
            </div>

            <div className="manual-analysis-summary-list">
              {summaryRows.map((row) => (
                <div key={row.label} className="manual-analysis-summary-row">
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>

            <div className="manual-analysis-note manual-analysis-note--modal">
              {tr("confirmCreditHint")}
            </div>

            <div className="manual-analysis-modal-actions">
              <button
                type="button"
                className="manual-analysis-secondary-btn"
                onClick={() => setConfirmOpen(false)}
              >
                {tr("confirmCancel")}
              </button>

              <button
                type="button"
                className="manual-analysis-primary-btn"
                onClick={() => void handleConfirmAnalyze()}
                disabled={isSubmitting}
              >
                {tr("confirmSubmit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}