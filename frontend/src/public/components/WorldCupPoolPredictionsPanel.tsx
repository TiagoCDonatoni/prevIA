import React from "react";

import type { Lang } from "../../i18n";
import {
  fetchWorldCupPoolParticipantMatches,
  saveWorldCupPoolPrediction,
  type WorldCupPoolMatchFilter,
  type WorldCupPoolRoundFilter,
  type WorldCupPoolParticipantMatch,
  type WorldCupPoolParticipantMatchesResponse,
} from "../api/publicClient";

type Props = {
  lang: Lang;
  inviteToken: string;
};

type DraftScore = {
  home: string;
  away: string;
};

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "locked";

type DayGroup = {
  key: string;
  label: string;
  items: WorldCupPoolParticipantMatch[];
};

const PAGE_SIZE = 10;
const AUTOSAVE_DELAY_MS = 700;

const COPY = {
  pt: {
    title: "Palpites",
    body: "Preencha os placares. Quando os dois campos estiverem completos, salvamos automaticamente.",
    loading: "Carregando jogos...",
    emptyTitle: "Nenhum jogo encontrado",
    emptyBody: "Assim que o calendário estiver disponível, os jogos aparecerão aqui.",
    error: "Não foi possível carregar os jogos agora.",
    all: "Todos",
    pending: "Pendentes",
    predicted: "Salvos",
    lockedFilter: "Bloqueados",
    predictedCount: "palpites enviados",
    pendingCount: "pendentes",
    lockedCount: "bloqueados",
    page: "Página",
    of: "de",
    previous: "Anterior",
    next: "Próxima",
    match: "Jogo",
    group: "Grupo",
    roundFilter: "Rodada",
    allRounds: "Todas as rodadas",
    knockout: "Mata-mata",
    round1: "Rodada 1",
    round2: "Rodada 2",
    round3: "Rodada 3",
    roundOf32: "32 avos",
    roundOf16: "Oitavas",
    quarterFinal: "Quartas",
    semiFinal: "Semifinal",
    thirdPlace: "3º lugar",
    final: "Final",
    kickoffTbd: "Data a definir",
    timeTbd: "Horário a definir",
    lockedStatus: "Edição encerrada",
    pendingStatus: "Pendente",
    dirty: "Editando...",
    saving: "Salvando...",
    saved: "Salvo automaticamente",
    errorStatus: "Erro ao salvar",
    retry: "Tentar novamente",
  },
  en: {
    title: "Predictions",
    body: "Fill in the scores. Once both fields are complete, we save automatically.",
    loading: "Loading matches...",
    emptyTitle: "No matches found",
    emptyBody: "Once the schedule is available, matches will appear here.",
    error: "Could not load matches right now.",
    all: "All",
    pending: "Pending",
    predicted: "Saved",
    lockedFilter: "Locked",
    predictedCount: "predictions sent",
    pendingCount: "pending",
    lockedCount: "locked",
    page: "Page",
    of: "of",
    previous: "Previous",
    next: "Next",
    match: "Match",
    group: "Group",
    roundFilter: "Round",
    allRounds: "All rounds",
    knockout: "Knockout",
    round1: "Round 1",
    round2: "Round 2",
    round3: "Round 3",
    roundOf32: "Round of 32",
    roundOf16: "Round of 16",
    quarterFinal: "Quarter-final",
    semiFinal: "Semi-final",
    thirdPlace: "Third place",
    final: "Final",
    kickoffTbd: "Date TBD",
    timeTbd: "Time TBD",
    lockedStatus: "Editing closed",
    pendingStatus: "Pending",
    dirty: "Editing...",
    saving: "Saving...",
    saved: "Saved automatically",
    errorStatus: "Save error",
    retry: "Try again",
  },
  es: {
    title: "Pronósticos",
    body: "Completa los marcadores. Cuando los dos campos estén completos, guardamos automáticamente.",
    loading: "Cargando partidos...",
    emptyTitle: "No se encontraron partidos",
    emptyBody: "Cuando el calendario esté disponible, los partidos aparecerán aquí.",
    error: "No fue posible cargar los partidos ahora.",
    all: "Todos",
    pending: "Pendientes",
    predicted: "Guardados",
    lockedFilter: "Bloqueados",
    predictedCount: "pronósticos enviados",
    pendingCount: "pendientes",
    lockedCount: "bloqueados",
    page: "Página",
    of: "de",
    previous: "Anterior",
    next: "Siguiente",
    match: "Partido",
    group: "Grupo",
    roundFilter: "Jornada",
    allRounds: "Todas las jornadas",
    knockout: "Eliminatorias",
    round1: "Jornada 1",
    round2: "Jornada 2",
    round3: "Jornada 3",
    roundOf32: "Dieciseisavos",
    roundOf16: "Octavos",
    quarterFinal: "Cuartos",
    semiFinal: "Semifinal",
    thirdPlace: "3º puesto",
    final: "Final",
    kickoffTbd: "Fecha por definir",
    timeTbd: "Hora por definir",
    lockedStatus: "Edición cerrada",
    pendingStatus: "Pendiente",
    dirty: "Editando...",
    saving: "Guardando...",
    saved: "Guardado automáticamente",
    errorStatus: "Error al guardar",
    retry: "Intentar nuevamente",
  },
} as const;

function normalizeScore(value: string): string {
  const onlyDigits = value.replace(/\D/g, "").slice(0, 2);
  if (!onlyDigits) return "";

  const parsed = Number(onlyDigits);
  if (!Number.isFinite(parsed)) return "";
  if (parsed > 99) return "99";

  return String(parsed);
}

function isCompleteScore(draft: DraftScore | undefined): draft is DraftScore {
  if (!draft) return false;
  return /^\d{1,2}$/.test(draft.home) && /^\d{1,2}$/.test(draft.away);
}

function getInitialDraft(match: WorldCupPoolParticipantMatch): DraftScore {
  return {
    home:
      match.prediction?.home_score === null || match.prediction?.home_score === undefined
        ? ""
        : String(match.prediction.home_score),
    away:
      match.prediction?.away_score === null || match.prediction?.away_score === undefined
        ? ""
        : String(match.prediction.away_score),
  };
}

function getInitialStatus(match: WorldCupPoolParticipantMatch): SaveStatus {
  if (match.is_locked) return "locked";
  if (match.prediction) return "saved";
  return "idle";
}

function localeForLang(lang: Lang): string {
  if (lang === "pt") return "pt-BR";
  if (lang === "es") return "es-ES";
  return "en-US";
}

function formatKickoffTime(
  value: string | null | undefined,
  lang: Lang,
  fallback: string
): string {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(localeForLang(lang), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDayLabel(value: string | null | undefined, lang: Lang, fallback: string): string {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(localeForLang(lang), {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

function getDayKey(value: string | null | undefined): string {
  if (!value) return "tbd";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "tbd";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function groupMatchesByDay(
  matches: WorldCupPoolParticipantMatch[],
  lang: Lang,
  fallback: string
): DayGroup[] {
  const groups: DayGroup[] = [];
  const groupIndex = new Map<string, DayGroup>();

  matches.forEach((match) => {
    const key = getDayKey(match.kickoff_utc);
    const existing = groupIndex.get(key);

    if (existing) {
      existing.items.push(match);
      return;
    }

    const nextGroup = {
      key,
      label: formatDayLabel(match.kickoff_utc, lang, fallback),
      items: [match],
    };

    groups.push(nextGroup);
    groupIndex.set(key, nextGroup);
  });

  return groups;
}

function getPhaseLabel(
  match: WorldCupPoolParticipantMatch,
  copy: (typeof COPY)[keyof typeof COPY]
): string {
  if (match.phase === "group") {
    const groupLabel = match.group_code ? `${copy.group} ${match.group_code}` : copy.group;
    const matchNumber = Number(match.match_key.match(/_match_(\d+)$/)?.[1] || 0);

    if (matchNumber >= 1 && matchNumber <= 2) return `${groupLabel} · ${copy.round1}`;
    if (matchNumber >= 3 && matchNumber <= 4) return `${groupLabel} · ${copy.round2}`;
    if (matchNumber >= 5 && matchNumber <= 6) return `${groupLabel} · ${copy.round3}`;

    return groupLabel;
  }

  if (match.phase === "round_of_32") return copy.roundOf32;
  if (match.phase === "round_of_16") return copy.roundOf16;
  if (match.phase === "quarter_final") return copy.quarterFinal;
  if (match.phase === "semi_final") return copy.semiFinal;
  if (match.phase === "third_place") return copy.thirdPlace;
  if (match.phase === "final") return copy.final;

  return match.bracket_label || copy.knockout;
}

export function WorldCupPoolPredictionsPanel({ lang, inviteToken }: Props) {
  const copy = COPY[lang] ?? COPY.pt;

  const [filter, setFilter] = React.useState<WorldCupPoolMatchFilter>("all");
  const [roundFilter, setRoundFilter] = React.useState<WorldCupPoolRoundFilter>("all");
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<WorldCupPoolParticipantMatchesResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<number, DraftScore>>({});
  const [statuses, setStatuses] = React.useState<Record<number, SaveStatus>>({});

  const timersRef = React.useRef<Record<number, ReturnType<typeof window.setTimeout>>>({});

  const clearTimer = React.useCallback((matchId: number) => {
    const timer = timersRef.current[matchId];
    if (timer) {
      window.clearTimeout(timer);
      delete timersRef.current[matchId];
    }
  }, []);

  const loadMatches = React.useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const response = await fetchWorldCupPoolParticipantMatches(inviteToken, {
        page,
        pageSize: PAGE_SIZE,
        filter,
        round: roundFilter,
      });

      const nextDrafts: Record<number, DraftScore> = {};
      const nextStatuses: Record<number, SaveStatus> = {};

      response.items.forEach((match) => {
        nextDrafts[match.id] = getInitialDraft(match);
        nextStatuses[match.id] = getInitialStatus(match);
      });

      setData(response);
      setDrafts(nextDrafts);
      setStatuses(nextStatuses);
    } catch (err) {
      console.error("failed to load world cup pool matches", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [filter, inviteToken, page, roundFilter]);

  React.useEffect(() => {
    void loadMatches();

    return () => {
      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
      timersRef.current = {};
    };
  }, [loadMatches]);

  const saveDraft = React.useCallback(
    async (match: WorldCupPoolParticipantMatch, draftOverride?: DraftScore) => {
      if (match.is_locked) {
        setStatuses((current) => ({ ...current, [match.id]: "locked" }));
        return;
      }

      const draft = draftOverride || drafts[match.id];
      if (!isCompleteScore(draft)) return;

      clearTimer(match.id);
      setStatuses((current) => ({ ...current, [match.id]: "saving" }));

      try {
        await saveWorldCupPoolPrediction(inviteToken, match.id, {
          home_score: Number(draft.home),
          away_score: Number(draft.away),
        });

        setStatuses((current) => ({ ...current, [match.id]: "saved" }));
      } catch (err) {
        console.error("failed to save world cup pool prediction", err);
        setStatuses((current) => ({ ...current, [match.id]: "error" }));
      }
    },
    [clearTimer, drafts, inviteToken]
  );

  function scheduleAutosave(match: WorldCupPoolParticipantMatch, draft: DraftScore) {
    clearTimer(match.id);

    if (match.is_locked) {
      setStatuses((current) => ({ ...current, [match.id]: "locked" }));
      return;
    }

    setStatuses((current) => ({ ...current, [match.id]: "dirty" }));

    if (!isCompleteScore(draft)) return;

    timersRef.current[match.id] = window.setTimeout(() => {
      void saveDraft(match, draft);
    }, AUTOSAVE_DELAY_MS);
  }

  function onScoreChange(match: WorldCupPoolParticipantMatch, side: "home" | "away", value: string) {
    const normalized = normalizeScore(value);

    setDrafts((current) => {
      const currentDraft = current[match.id] || getInitialDraft(match);
      const nextDraft = {
        ...currentDraft,
        [side]: normalized,
      };

      scheduleAutosave(match, nextDraft);

      return {
        ...current,
        [match.id]: nextDraft,
      };
    });
  }

  function onScoreBlur(match: WorldCupPoolParticipantMatch) {
    const draft = drafts[match.id];
    if (isCompleteScore(draft)) {
      void saveDraft(match, draft);
    }
  }

  function flushVisibleDirtyScores() {
    data?.items.forEach((match) => {
      const status = statuses[match.id];
      const draft = drafts[match.id];

      if ((status === "dirty" || status === "error") && isCompleteScore(draft)) {
        void saveDraft(match, draft);
      }
    });
  }

  function changePage(nextPage: number) {
    if (!data) return;

    const safePage = Math.min(Math.max(nextPage, 1), Math.max(data.pagination.total_pages, 1));
    if (safePage === page) return;

    flushVisibleDirtyScores();
    setPage(safePage);
  }

  function changeFilter(nextFilter: WorldCupPoolMatchFilter) {
    if (nextFilter === filter) return;

    flushVisibleDirtyScores();
    setFilter(nextFilter);
    setPage(1);
  }

  function changeRoundFilter(nextRoundFilter: WorldCupPoolRoundFilter) {
    if (nextRoundFilter === roundFilter) return;

    flushVisibleDirtyScores();
    setRoundFilter(nextRoundFilter);
    setPage(1);
  }

  const totalPages = data?.pagination.total_pages || 0;
  const canGoPrevious = page > 1;
  const canGoNext = totalPages > 0 && page < totalPages;

  const filterOptions: Array<{ value: WorldCupPoolMatchFilter; label: string }> = [
    { value: "all", label: copy.all },
    { value: "pending", label: copy.pending },
    { value: "predicted", label: copy.predicted },
    { value: "locked", label: copy.lockedFilter },
  ];

  const roundOptions: Array<{ value: WorldCupPoolRoundFilter; label: string }> = [
    { value: "all", label: copy.allRounds },
    { value: "1", label: copy.round1 },
    { value: "2", label: copy.round2 },
    { value: "3", label: copy.round3 },
  ];

  const dayGroups = data ? groupMatchesByDay(data.items, lang, copy.kickoffTbd) : [];

  return (
    <section className="worldcup-pool-predictions-panel">
      <div className="worldcup-pool-predictions-head">
        <div>
          <span className="worldcup-pool-panel-kicker">{copy.title}</span>
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
        </div>

        {data ? (
          <div className="worldcup-pool-predictions-summary" aria-label={copy.title}>
            <div>
              <strong>
                {data.summary.predicted_matches}/{data.summary.total_matches}
              </strong>
              <span>{copy.predictedCount}</span>
            </div>
            <div>
              <strong>{data.summary.pending_matches}</strong>
              <span>{copy.pendingCount}</span>
            </div>
            <div>
              <strong>{data.summary.locked_matches}</strong>
              <span>{copy.lockedCount}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="worldcup-pool-predictions-toolbar">
        <div className="worldcup-pool-predictions-toolbar-groups">
          <div className="worldcup-pool-predictions-filters" role="tablist" aria-label={copy.title}>
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`worldcup-pool-predictions-filter ${
                  filter === option.value ? "is-active" : ""
                }`}
                onClick={() => changeFilter(option.value)}
                disabled={loading}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div
            className="worldcup-pool-predictions-filters worldcup-pool-predictions-round-filters"
            role="tablist"
            aria-label={copy.roundFilter}
          >
            {roundOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`worldcup-pool-predictions-filter ${
                  roundFilter === option.value ? "is-active" : ""
                }`}
                onClick={() => changeRoundFilter(option.value)}
                disabled={loading}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {data ? (
          <div className="worldcup-pool-predictions-page-indicator">
            {copy.page} {totalPages === 0 ? 0 : page} {copy.of} {totalPages}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="worldcup-pool-predictions-state">{copy.loading}</div>
      ) : loadError ? (
        <div className="worldcup-pool-predictions-state is-error">{copy.error}</div>
      ) : !data || data.items.length === 0 ? (
        <div className="worldcup-pool-predictions-state">
          <strong>{copy.emptyTitle}</strong>
          <span>{copy.emptyBody}</span>
        </div>
      ) : (
        <div className="worldcup-pool-match-day-list">
          {dayGroups.map((group) => (
            <div key={group.key} className="worldcup-pool-match-day-group">
              <div className="worldcup-pool-match-day-heading">{group.label}</div>

              <div className="worldcup-pool-match-list">
                {group.items.map((match) => {
                  const draft = drafts[match.id] || getInitialDraft(match);
                  const status = statuses[match.id] || getInitialStatus(match);
                  const isLocked = match.is_locked || status === "locked";
                  const phaseLabel = getPhaseLabel(match, copy);
                  const matchTime = formatKickoffTime(match.kickoff_utc, lang, copy.timeTbd);

                  return (
                    <article
                      key={match.id}
                      className={`worldcup-pool-match-card ${isLocked ? "is-locked" : ""}`}
                    >
                      <div className="worldcup-pool-match-meta">
                        <span>
                          {copy.match} {match.official_match_no || match.display_order}
                        </span>
                        <strong>{phaseLabel}</strong>
                        <small>{matchTime}</small>
                      </div>

                      <div className="worldcup-pool-score-editor">
                        <div className="worldcup-pool-team-name">{match.home_label}</div>

                        <input
                          type="text"
                          inputMode="numeric"
                          value={draft.home}
                          onChange={(event) => onScoreChange(match, "home", event.target.value)}
                          onBlur={() => onScoreBlur(match)}
                          disabled={isLocked}
                          aria-label={`${match.home_label} score`}
                        />

                        <span className="worldcup-pool-score-separator">×</span>

                        <input
                          type="text"
                          inputMode="numeric"
                          value={draft.away}
                          onChange={(event) => onScoreChange(match, "away", event.target.value)}
                          onBlur={() => onScoreBlur(match)}
                          disabled={isLocked}
                          aria-label={`${match.away_label} score`}
                        />

                        <div className="worldcup-pool-team-name worldcup-pool-team-name-away">
                          {match.away_label}
                        </div>
                      </div>

                      <div className={`worldcup-pool-save-status is-${status}`}>
                        {status === "saving"
                          ? copy.saving
                          : status === "saved"
                            ? copy.saved
                            : status === "dirty"
                              ? copy.dirty
                              : status === "error"
                                ? copy.errorStatus
                                : isLocked
                                  ? copy.lockedStatus
                                  : copy.pendingStatus}

                        {status === "error" ? (
                          <button type="button" onClick={() => void saveDraft(match)}>
                            {copy.retry}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="worldcup-pool-pagination">
        <button
          type="button"
          className="public-btn public-btn-secondary"
          onClick={() => changePage(page - 1)}
          disabled={!canGoPrevious || loading}
        >
          {copy.previous}
        </button>

        <span>
          {copy.page} {totalPages === 0 ? 0 : page} {copy.of} {totalPages}
        </span>

        <button
          type="button"
          className="public-btn public-btn-secondary"
          onClick={() => changePage(page + 1)}
          disabled={!canGoNext || loading}
        >
          {copy.next}
        </button>
      </div>
    </section>
  );
}