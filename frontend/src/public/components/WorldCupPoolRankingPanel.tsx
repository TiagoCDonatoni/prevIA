import React from "react";

import type { Lang } from "../../i18n";
import {
  fetchWorldCupPoolParticipantLockedPredictions,
  fetchWorldCupPoolParticipantRanking,
  type WorldCupPoolRankingResponse,
  type WorldCupPoolVisiblePredictionsResponse,
} from "../api/publicClient";

type Props = {
  lang: Lang;
  inviteToken: string;
};

type RankingParticipant = WorldCupPoolRankingResponse["items"][number];

const PAGE_SIZE = 10;
const LOCKED_PREDICTIONS_PAGE_SIZE = 10;

const COPY = {
  pt: {
    title: "Ranking",
    body: "Acompanhe sua posição no bolão. Toque em um participante para ver os palpites que já foram bloqueados.",
    loading: "Carregando ranking...",
    error: "Não foi possível carregar o ranking agora.",
    empty: "Ainda não há participantes no ranking.",
    me: "Sua posição",
    points: "pts",
    predictions: "palpites",
    generalRanking: "Ranking geral",
    page: "Página",
    of: "de",
    previous: "Anterior",
    next: "Próxima",
    movedUp: "Subiu",
    movedDown: "Caiu",
    maintained: "Manteve a posição",
    viewPredictions: "Ver palpites bloqueados",
    modalKicker: "Palpites visíveis",
    modalTitle: "Palpites de",
    modalClose: "Fechar",
    modalBody:
      "Só aparecem jogos que já foram bloqueados para edição. Palpites futuros continuam privados.",
    modalLoading: "Carregando palpites visíveis...",
    modalError: "Não foi possível carregar os palpites agora.",
    modalEmpty: "Este participante ainda não tem palpites visíveis em jogos bloqueados.",
    prediction: "Palpite",
    result: "Resultado",
    resultPending: "Resultado ainda não finalizado",
    pointsPending: "Pontos após resultado",
    matchDateTbd: "Data a definir",
    matchNo: "Jogo",
    group: "Grupo",
  },
  en: {
    title: "Ranking",
    body: "Track your position in the pool. Tap a participant to see predictions that have already been locked.",
    loading: "Loading ranking...",
    error: "Could not load the ranking right now.",
    empty: "There are no participants in the ranking yet.",
    me: "Your position",
    points: "pts",
    predictions: "predictions",
    generalRanking: "Overall ranking",
    page: "Page",
    of: "of",
    previous: "Previous",
    next: "Next",
    movedUp: "Moved up",
    movedDown: "Moved down",
    maintained: "Held position",
    viewPredictions: "View locked predictions",
    modalKicker: "Visible predictions",
    modalTitle: "Predictions by",
    modalClose: "Close",
    modalBody:
      "Only matches already locked for editing are shown. Future predictions remain private.",
    modalLoading: "Loading visible predictions...",
    modalError: "Could not load predictions right now.",
    modalEmpty: "This participant does not have visible predictions for locked matches yet.",
    prediction: "Prediction",
    result: "Result",
    resultPending: "Result not final yet",
    pointsPending: "Points after result",
    matchDateTbd: "Date TBD",
    matchNo: "Match",
    group: "Group",
  },
  es: {
    title: "Ranking",
    body: "Acompaña tu posición en la porra. Toca un participante para ver los pronósticos que ya fueron bloqueados.",
    loading: "Cargando ranking...",
    error: "No fue posible cargar el ranking ahora.",
    empty: "Aún no hay participantes en el ranking.",
    me: "Tu posición",
    points: "pts",
    predictions: "pronósticos",
    generalRanking: "Ranking general",
    page: "Página",
    of: "de",
    previous: "Anterior",
    next: "Siguiente",
    movedUp: "Subió",
    movedDown: "Bajó",
    maintained: "Mantuvo la posición",
    viewPredictions: "Ver pronósticos bloqueados",
    modalKicker: "Pronósticos visibles",
    modalTitle: "Pronósticos de",
    modalClose: "Cerrar",
    modalBody:
      "Solo aparecen partidos que ya fueron bloqueados para edición. Los pronósticos futuros siguen privados.",
    modalLoading: "Cargando pronósticos visibles...",
    modalError: "No fue posible cargar los pronósticos ahora.",
    modalEmpty: "Este participante aún no tiene pronósticos visibles en partidos bloqueados.",
    prediction: "Pronóstico",
    result: "Resultado",
    resultPending: "Resultado aún no finalizado",
    pointsPending: "Puntos después del resultado",
    matchDateTbd: "Fecha por definir",
    matchNo: "Partido",
    group: "Grupo",
  },
} as const;

function localeForLang(lang: Lang): string {
  if (lang === "pt") return "pt-BR";
  if (lang === "es") return "es-ES";
  return "en-US";
}

function formatDateTime(value: string | null | undefined, lang: Lang, fallback: string): string {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(localeForLang(lang), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function WorldCupPoolRankingPanel({ lang, inviteToken }: Props) {
  const copy = COPY[lang] ?? COPY.pt;

  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<WorldCupPoolRankingResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);

  const [selectedParticipant, setSelectedParticipant] =
    React.useState<RankingParticipant | null>(null);
  const [lockedPredictionsPage, setLockedPredictionsPage] = React.useState(1);
  const [lockedPredictionsData, setLockedPredictionsData] =
    React.useState<WorldCupPoolVisiblePredictionsResponse | null>(null);
  const [lockedPredictionsLoading, setLockedPredictionsLoading] = React.useState(false);
  const [lockedPredictionsError, setLockedPredictionsError] = React.useState(false);

  const loadRanking = React.useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const response = await fetchWorldCupPoolParticipantRanking(inviteToken, {
        page,
        pageSize: PAGE_SIZE,
      });

      setData(response);
    } catch (err) {
      console.error("failed to load world cup pool ranking", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [inviteToken, page]);

  const loadLockedPredictions = React.useCallback(async () => {
    if (!selectedParticipant) return;

    setLockedPredictionsLoading(true);
    setLockedPredictionsError(false);

    try {
      const response = await fetchWorldCupPoolParticipantLockedPredictions(
        inviteToken,
        selectedParticipant.participant_id,
        {
          page: lockedPredictionsPage,
          pageSize: LOCKED_PREDICTIONS_PAGE_SIZE,
        }
      );

      setLockedPredictionsData(response);
    } catch (err) {
      console.error("failed to load participant locked predictions", err);
      setLockedPredictionsError(true);
    } finally {
      setLockedPredictionsLoading(false);
    }
  }, [inviteToken, lockedPredictionsPage, selectedParticipant]);

  React.useEffect(() => {
    void loadRanking();
  }, [loadRanking]);

  React.useEffect(() => {
    if (!selectedParticipant) return;
    void loadLockedPredictions();
  }, [loadLockedPredictions, selectedParticipant]);

  const totalPages = data?.pagination.total_pages || 0;
  const canGoPrevious = page > 1;
  const canGoNext = totalPages > 0 && page < totalPages;

  const lockedPredictionsTotalPages = lockedPredictionsData?.pagination.total_pages || 0;
  const canGoLockedPredictionsPrevious = lockedPredictionsPage > 1;
  const canGoLockedPredictionsNext =
    lockedPredictionsTotalPages > 0 && lockedPredictionsPage < lockedPredictionsTotalPages;

  function changePage(nextPage: number) {
    if (!data) return;

    const safePage = Math.min(Math.max(nextPage, 1), Math.max(data.pagination.total_pages, 1));
    if (safePage === page) return;

    setPage(safePage);
  }

  function renderRankMovementBadge(item: WorldCupPoolRankingResponse["items"][number]) {
    const movement = item.rank_movement;
    const delta = typeof item.rank_delta === "number" ? item.rank_delta : null;

    if (!movement || delta === null) return null;

    const absoluteDelta = Math.abs(delta);
    const label =
      movement === "up"
        ? `${copy.movedUp} ${absoluteDelta}`
        : movement === "down"
          ? `${copy.movedDown} ${absoluteDelta}`
          : copy.maintained;

    return (
      <span
        className={`worldcup-pool-rank-movement is-${movement}`}
        title={label}
        aria-label={label}
      >
        <span className="worldcup-pool-rank-movement-symbol" aria-hidden="true" />
        {movement !== "same" ? (
          <span className="worldcup-pool-rank-movement-value" aria-hidden="true">
            {absoluteDelta}
          </span>
        ) : null}
      </span>
    );
  }

  function openParticipantPredictions(participant: RankingParticipant) {
    setSelectedParticipant(participant);
    setLockedPredictionsPage(1);
    setLockedPredictionsData(null);
    setLockedPredictionsError(false);
  }

  function closeParticipantPredictions() {
    setSelectedParticipant(null);
    setLockedPredictionsPage(1);
    setLockedPredictionsData(null);
    setLockedPredictionsError(false);
  }

  function changeLockedPredictionsPage(nextPage: number) {
    const safePage = Math.min(
      Math.max(nextPage, 1),
      Math.max(lockedPredictionsData?.pagination.total_pages || 1, 1)
    );

    if (safePage === lockedPredictionsPage) return;

    setLockedPredictionsPage(safePage);
  }

  function getMatchMeta(
    prediction: WorldCupPoolVisiblePredictionsResponse["items"][number]
  ): string {
    const parts: string[] = [];

    if (prediction.official_match_no) {
      parts.push(`${copy.matchNo} ${prediction.official_match_no}`);
    }

    if (prediction.group_code) {
      parts.push(`${copy.group} ${prediction.group_code}`);
    } else if (prediction.bracket_label) {
      parts.push(prediction.bracket_label);
    } else if (prediction.phase) {
      parts.push(prediction.phase);
    }

    return parts.join(" · ");
  }

  return (
    <section className="worldcup-pool-ranking-panel">
      <div className="worldcup-pool-ranking-head">
        <div>
          <span className="worldcup-pool-panel-kicker">{copy.title}</span>
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
        </div>

        {data ? (
          <div className="worldcup-pool-my-rank-card">
            <span>{copy.me}</span>
            <strong>#{data.me.rank}</strong>
            <p>{data.me.display_name}</p>
            <small>
              {data.me.points} {copy.points} · {data.me.predictions_count} {copy.predictions}
            </small>
            {renderRankMovementBadge(data.me)}
          </div>
        ) : null}
      </div>

      <div className="worldcup-pool-ranking-table-card">
        <div className="worldcup-pool-ranking-table-head">
          <strong>{copy.generalRanking}</strong>

          {data ? (
            <span>
              {copy.page} {totalPages === 0 ? 0 : page} {copy.of} {totalPages}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="worldcup-pool-ranking-state">{copy.loading}</div>
        ) : loadError ? (
          <div className="worldcup-pool-ranking-state is-error">{copy.error}</div>
        ) : !data || data.items.length === 0 ? (
          <div className="worldcup-pool-ranking-state">{copy.empty}</div>
        ) : (
          <ol className="worldcup-pool-ranking-list">
            {data.items.map((item) => (
              <li className="worldcup-pool-ranking-row-wrap" key={item.participant_id}>
                <button
                  type="button"
                  className={`worldcup-pool-ranking-row ${item.is_me ? "is-me" : ""}`}
                  onClick={() => openParticipantPredictions(item)}
                  aria-label={`${copy.viewPredictions}: ${item.display_name}`}
                  aria-current={item.is_me ? "true" : undefined}
                >
                  <div className="worldcup-pool-ranking-position">#{item.rank}</div>

                  <div className="worldcup-pool-ranking-name">
                    <strong>{item.display_name}</strong>
                    <span>
                      {item.predictions_count} {copy.predictions}
                    </span>
                  </div>

                  <div className="worldcup-pool-ranking-points">
                    <strong>{item.points}</strong>
                    <span>{copy.points}</span>
                    {renderRankMovementBadge(item)}
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

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

      {selectedParticipant ? (
        <div
          className="worldcup-pool-modal-backdrop"
          role="presentation"
          onClick={closeParticipantPredictions}
        >
          <div
            className="worldcup-pool-modal worldcup-pool-locked-predictions-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="worldcup-pool-locked-predictions-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="worldcup-pool-modal-head">
              <div>
                <span className="worldcup-pool-panel-kicker">{copy.modalKicker}</span>
                <h4 id="worldcup-pool-locked-predictions-title">
                  {copy.modalTitle} {selectedParticipant.display_name}
                </h4>
              </div>

              <button
                type="button"
                className="worldcup-pool-modal-close"
                aria-label={copy.modalClose}
                onClick={closeParticipantPredictions}
              >
                ×
              </button>
            </div>

            <div className="worldcup-pool-modal-body">
              <p>{copy.modalBody}</p>

              {lockedPredictionsLoading ? (
                <div className="worldcup-pool-ranking-state worldcup-pool-locked-predictions-state">
                  {copy.modalLoading}
                </div>
              ) : lockedPredictionsError ? (
                <div className="worldcup-pool-ranking-state worldcup-pool-locked-predictions-state is-error">
                  {copy.modalError}
                </div>
              ) : !lockedPredictionsData || lockedPredictionsData.items.length === 0 ? (
                <div className="worldcup-pool-ranking-state worldcup-pool-locked-predictions-state">
                  {copy.modalEmpty}
                </div>
              ) : (
                <div className="worldcup-pool-locked-predictions-list">
                  {lockedPredictionsData.items.map((prediction) => {
                    const hasResult =
                      prediction.result_home_score !== null &&
                      prediction.result_home_score !== undefined &&
                      prediction.result_away_score !== null &&
                      prediction.result_away_score !== undefined;

                    return (
                      <article
                        className="worldcup-pool-locked-prediction-card"
                        key={prediction.match_id}
                      >
                        <div className="worldcup-pool-locked-prediction-main">
                          <div className="worldcup-pool-locked-prediction-match">
                            <span>{getMatchMeta(prediction)}</span>
                            <strong>
                              {prediction.home_label} × {prediction.away_label}
                            </strong>
                            <small>
                              {formatDateTime(
                                prediction.kickoff_utc,
                                lang,
                                copy.matchDateTbd
                              )}
                            </small>
                          </div>

                          <div className="worldcup-pool-locked-prediction-score">
                            <strong>
                              {prediction.predicted_home_score} ×{" "}
                              {prediction.predicted_away_score}
                            </strong>
                            <span>{copy.prediction}</span>
                          </div>
                        </div>

                        <div className="worldcup-pool-locked-prediction-meta">
                          {hasResult ? (
                            <span>
                              {copy.result}:{" "}
                              <strong>
                                {prediction.result_home_score} ×{" "}
                                {prediction.result_away_score}
                              </strong>
                            </span>
                          ) : (
                            <span>{copy.resultPending}</span>
                          )}

                          {hasResult &&
                          prediction.points !== null &&
                          prediction.points !== undefined ? (
                            <span>
                              <strong>{prediction.points}</strong> {copy.points}
                            </span>
                          ) : (
                            <span>{copy.pointsPending}</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {lockedPredictionsData && lockedPredictionsTotalPages > 1 ? (
              <div className="worldcup-pool-locked-predictions-pagination">
                <button
                  type="button"
                  className="public-btn public-btn-secondary"
                  onClick={() => changeLockedPredictionsPage(lockedPredictionsPage - 1)}
                  disabled={!canGoLockedPredictionsPrevious || lockedPredictionsLoading}
                >
                  {copy.previous}
                </button>

                <span>
                  {copy.page} {lockedPredictionsPage} {copy.of}{" "}
                  {lockedPredictionsTotalPages}
                </span>

                <button
                  type="button"
                  className="public-btn public-btn-secondary"
                  onClick={() => changeLockedPredictionsPage(lockedPredictionsPage + 1)}
                  disabled={!canGoLockedPredictionsNext || lockedPredictionsLoading}
                >
                  {copy.next}
                </button>
              </div>
            ) : null}

            <button
              type="button"
              className="public-btn public-btn-primary"
              onClick={closeParticipantPredictions}
            >
              {copy.modalClose}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}