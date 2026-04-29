import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listTeams } from "../../api/client";
import type { TeamLite } from "../../api/contracts";
import { SearchableSingleSelect } from "../components/SearchableSingleSelect";
import { type PlanId } from "../entitlements";
import { t, type Lang } from "../i18n";
import {
  fetchManualAnalysisHistory,
  postManualAnalysisEvaluate,
  type ManualAnalysisEvaluateRequest,
  type ManualAnalysisMarketKey,
  type ManualAnalysisMarketSnapshot,
  type ManualAnalysisResponse,
} from "../api/manualAnalysis";
import { useProductStore } from "../state/productStore";

const ALLOWED_PLANS: PlanId[] = ["LIGHT", "PRO"];
const TOTALS_LINE_OPTIONS = [1.5, 2.5, 3.5, 4.5] as const;

type MarketSectionKey = "one_x_two" | "totals" | "btts";
function sanitizeOddInput(raw: string) {
  const normalized = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  let output = "";
  let hasDot = false;

  for (const char of normalized) {
    if (char === ".") {
      if (hasDot) continue;
      hasDot = true;
      output += char;
      continue;
    }
    output += char;
  }

  return output;
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

export default function ProductManualAnalysisPage() {
  const store = useProductStore();
  const lang = store.state.lang as Lang;
  const plan = store.entitlements.plan as PlanId;
  const tr = (key: string, vars?: Record<string, unknown>) =>
    t(lang, `product.manualAnalysis.${key}`, vars);

  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [history, setHistory] = useState<ManualAnalysisResponse[]>([]);

  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHomeTeamId, setSelectedHomeTeamId] = useState("");
  const [selectedAwayTeamId, setSelectedAwayTeamId] = useState("");

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

  const hasFeatureAccess =
    ALLOWED_PLANS.includes(plan) || Boolean(store.accessContext?.product_internal_access);

  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      if (!hasFeatureAccess) {
        setIsLoadingHistory(false);
        return;
      }

      try {
        setIsLoadingHistory(true);
        const response = await fetchManualAnalysisHistory(20);
        if (!isMounted) return;
        setHistory(response.items ?? []);
      } catch (error) {
        console.error("manual analysis history failed", error);
        if (!isMounted) return;
        setHistory([]);
      } finally {
        if (isMounted) setIsLoadingHistory(false);
      }
    }

    void loadHistory();

    return () => {
      isMounted = false;
    };
  }, [hasFeatureAccess]);

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

      if (!response.ok) {
        setErrorMessage(response.message ?? tr("genericError"));
        setConfirmOpen(false);
        return;
      }

      setCurrentAnalysis(response);
      setHistory((prev) =>
        [response, ...prev.filter((item) => item.analysis_id !== response.analysis_id)].slice(0, 20)
      );
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
          <div className="manual-analysis-lock-eyebrow">Light+</div>
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

  return (
    <section className="manual-analysis-page">
      <div className="manual-analysis-hero">
        <div className="manual-analysis-eyebrow">Light+</div>
        <h1 className="manual-analysis-title">{tr("title")}</h1>
        <p className="manual-analysis-subtitle">{tr("subtitle")}</p>
      </div>

      <div className="manual-analysis-shell">
        <div className="manual-analysis-card manual-analysis-card--history">
          <div className="manual-analysis-selection-grid">
            {/*
              Liga de referência removida da UI final.

              Se no futuro criarmos um "modo avançado", podemos reativar aqui
              um seletor de contexto estatístico:
              - automático
              - liga do mandante
              - liga do visitante
              - liga manual
            */}

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
                    placeholder="0000.00"
                    inputMode="decimal"
                  />
                </div>

                <div className="manual-analysis-field">
                  <label>{tr("drawLabel")}</label>
                  <input
                    value={oddD}
                    onChange={(event) => setOddD(sanitizeOddInput(event.target.value))}
                    placeholder="0000.00"
                    inputMode="decimal"
                  />
                </div>

                <div className="manual-analysis-field">
                  <label>{tr("awayLabel")}</label>
                  <input
                    value={oddA}
                    onChange={(event) => setOddA(sanitizeOddInput(event.target.value))}
                    placeholder="0000.00"
                    inputMode="decimal"
                  />
                </div>
              </div>
            </div>

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
                    placeholder="0000.00"
                    inputMode="decimal"
                  />
                </div>

                <div className="manual-analysis-field">
                  <label>{tr("underLabel", { line: totalsLine.toFixed(1) })}</label>
                  <input
                    value={oddUnder}
                    onChange={(event) => setOddUnder(sanitizeOddInput(event.target.value))}
                    placeholder="0000.00"
                    inputMode="decimal"
                  />
                </div>
              </div>
            </div>

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
                    placeholder="0000.00"
                    inputMode="decimal"
                  />
                </div>

                <div className="manual-analysis-field">
                  <label>{tr("noLabel")}</label>
                  <input
                    value={oddNo}
                    onChange={(event) => setOddNo(sanitizeOddInput(event.target.value))}
                    placeholder="0000.00"
                    inputMode="decimal"
                  />
                </div>
              </div>
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
                {getAnalysisMarketSections(currentAnalysis).map(({ key: sectionKey, market }) => (
                  <div key={sectionKey} className="manual-analysis-result-market-section">
                    <div className="manual-analysis-result-market-title">
                      {getMarketSectionTitle(tr, sectionKey, market)}
                    </div>

                    <div className="manual-analysis-comparison-grid">
                      {Object.entries(market.model?.selections ?? {}).map(([selectionKey, selectionValue]) => {
                        const comparison = market.evaluation?.comparisons?.[selectionKey] ?? null;

                        return (
                          <div key={`${sectionKey}-${selectionKey}`} className="manual-analysis-comparison-card">
                            <div className="manual-analysis-comparison-label">
                              {getSelectionLabel(
                                lang,
                                market.market?.market_key ?? "1X2",
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
                      })}
                    </div>
                  </div>
                ))}
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
                onClick={() => setCurrentAnalysis(item)}
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
      </div>

      {confirmOpen ? (
        <div className="manual-analysis-modal-backdrop" role="presentation">
          <div
            className="manual-analysis-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-analysis-confirm-title"
          >
            <h2 id="manual-analysis-confirm-title">{tr("confirmTitle")}</h2>
            <p>{tr("confirmBody")}</p>

            <div className="manual-analysis-summary-list">
              {summaryRows.map((row) => (
                <div key={row.label} className="manual-analysis-summary-row">
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>

            <div className="manual-analysis-note">{tr("confirmCreditHint")}</div>

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