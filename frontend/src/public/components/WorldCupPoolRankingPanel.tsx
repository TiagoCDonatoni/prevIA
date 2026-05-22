import React from "react";

import type { Lang } from "../../i18n";
import {
  fetchWorldCupPoolParticipantRanking,
  type WorldCupPoolRankingResponse,
} from "../api/publicClient";

type Props = {
  lang: Lang;
  inviteToken: string;
};

const PAGE_SIZE = 10;

const COPY = {
  pt: {
    title: "Ranking",
    body: "Acompanhe sua posição no bolão. O ranking será atualizado conforme os resultados forem calculados.",
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
  },
  en: {
    title: "Ranking",
    body: "Track your position in the pool. The ranking will update as results are calculated.",
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
  },
  es: {
    title: "Ranking",
    body: "Acompaña tu posición en la porra. El ranking se actualizará a medida que se calculen los resultados.",
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
  },
} as const;

export function WorldCupPoolRankingPanel({ lang, inviteToken }: Props) {
  const copy = COPY[lang] ?? COPY.pt;

  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<WorldCupPoolRankingResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);

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

  React.useEffect(() => {
    void loadRanking();
  }, [loadRanking]);

  const totalPages = data?.pagination.total_pages || 0;
  const canGoPrevious = page > 1;
  const canGoNext = totalPages > 0 && page < totalPages;

  function changePage(nextPage: number) {
    if (!data) return;

    const safePage = Math.min(Math.max(nextPage, 1), Math.max(data.pagination.total_pages, 1));
    if (safePage === page) return;

    setPage(safePage);
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
              <li
                key={item.participant_id}
                className={`worldcup-pool-ranking-row ${item.is_me ? "is-me" : ""}`}
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
                </div>
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
    </section>
  );
}