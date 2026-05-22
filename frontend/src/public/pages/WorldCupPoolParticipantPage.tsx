import React from "react";
import { Link, useParams } from "react-router-dom";
import "../worldcup-pool.css";

import type { Lang } from "../../i18n";
import { coercePublicLang } from "../lib/publicLang";
import {
  fetchWorldCupPoolParticipantDashboard,
  type WorldCupPoolParticipantDashboardResponse,
} from "../api/publicClient";
import { WorldCupPoolPredictionsPanel } from "../components/WorldCupPoolPredictionsPanel";
import { WorldCupPoolRankingPanel } from "../components/WorldCupPoolRankingPanel";

const COPY = {
  pt: {
    loading: "Carregando seu painel...",
    errorTitle: "Entre pelo link do bolão",
    errorBody:
      "Não encontramos uma sessão ativa para este bolão neste navegador. Entre novamente com seu e-mail e PIN.",
    enterAgain: "Entrar neste bolão",
    eyebrow: "Painel do participante",
    hello: "Olá",
    participantStatus: "Participando",
    poolLabel: "Bolão",
    participants: "participantes",
    predictionsTitle: "Palpites",
    predictionsStatus: "Em breve",
    predictionsBody:
      "Aqui você verá os jogos da Copa para enviar e editar seus palpites.",
    rankingTitle: "Ranking",
    rankingStatus: "Em breve",
    rankingBody:
      "Quando os resultados forem calculados, sua posição aparecerá aqui.",
    rulesTitle: "Pontuação",
    exactScore: "Placar exato",
    outcome: "Resultado correto",
    teamScoreBonus: "Bônus por gols de um time",
    maxPerMatch: "Máximo por jogo",
    invite: "Voltar ao convite",
  },
  en: {
    loading: "Loading your dashboard...",
    errorTitle: "Enter through the pool link",
    errorBody:
      "We could not find an active session for this pool in this browser. Sign in again with your email and PIN.",
    enterAgain: "Enter this pool",
    eyebrow: "Participant dashboard",
    hello: "Hi",
    participantStatus: "Participating",
    poolLabel: "Pool",
    participants: "participants",
    predictionsTitle: "Predictions",
    predictionsStatus: "Coming soon",
    predictionsBody:
      "Here you will see World Cup matches to submit and edit your predictions.",
    rankingTitle: "Ranking",
    rankingStatus: "Coming soon",
    rankingBody:
      "Once results are calculated, your position will appear here.",
    rulesTitle: "Scoring",
    exactScore: "Exact score",
    outcome: "Correct outcome",
    teamScoreBonus: "Team score bonus",
    maxPerMatch: "Maximum per match",
    invite: "Back to invite",
  },
  es: {
    loading: "Cargando tu panel...",
    errorTitle: "Entra por el enlace de la porra",
    errorBody:
      "No encontramos una sesión activa para esta porra en este navegador. Entra nuevamente con tu email y PIN.",
    enterAgain: "Entrar en esta porra",
    eyebrow: "Panel del participante",
    hello: "Hola",
    participantStatus: "Participando",
    poolLabel: "Porra",
    participants: "participantes",
    predictionsTitle: "Pronósticos",
    predictionsStatus: "Próximamente",
    predictionsBody:
      "Aquí verás los partidos del Mundial para enviar y editar tus pronósticos.",
    rankingTitle: "Ranking",
    rankingStatus: "Próximamente",
    rankingBody:
      "Cuando los resultados sean calculados, tu posición aparecerá aquí.",
    rulesTitle: "Puntuación",
    exactScore: "Marcador exacto",
    outcome: "Resultado correcto",
    teamScoreBonus: "Bono por goles de un equipo",
    maxPerMatch: "Máximo por partido",
    invite: "Volver a la invitación",
  },
} as const;

export function WorldCupPoolParticipantPage() {
  const { lang, inviteToken } = useParams<{ lang: string; inviteToken: string }>();
  const currentLang = coercePublicLang(lang) as Lang;
  const copy = COPY[currentLang] ?? COPY.pt;
  const token = String(inviteToken || "").trim();

  const [data, setData] = React.useState<WorldCupPoolParticipantDashboardResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) {
        setLoadError(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(false);

      try {
        const response = await fetchWorldCupPoolParticipantDashboard(token);
        if (!cancelled) {
          setData(response);
        }
      } catch (err) {
        console.error("failed to load world cup pool participant dashboard", err);
        if (!cancelled) {
          setLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const invitePath = `/${currentLang}/bolao/copa/entrar/${encodeURIComponent(token)}`;

  if (loading) {
    return (
      <div className="worldcup-pool-page">
        <section className="worldcup-pool-hero">
          <div className="worldcup-pool-hero-card worldcup-pool-placeholder-card">
            <p className="public-body">{copy.loading}</p>
          </div>
        </section>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="worldcup-pool-page">
        <section className="worldcup-pool-hero">
          <div className="worldcup-pool-hero-card worldcup-pool-placeholder-card">
            <div className="worldcup-pool-create-result">
              <div>
                <div className="public-eyebrow">{copy.eyebrow}</div>
                <h1>{copy.errorTitle}</h1>
                <p>{copy.errorBody}</p>
              </div>

              <Link className="public-btn public-btn-primary" to={invitePath}>
                {copy.enterAgain}
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="worldcup-pool-page">
      <section className="worldcup-pool-participant-shell">
        <header className="worldcup-pool-participant-hero">
          <div>
            <div className="public-eyebrow">{copy.eyebrow}</div>
            <h1>
              {copy.hello}, {data.participant.display_name}
            </h1>
            <p>
              {copy.poolLabel}: <strong>{data.pool.name}</strong>
            </p>
          </div>

          <div className="worldcup-pool-participant-status">
            <span>{copy.participantStatus}</span>
            <strong>{data.pool.participant_count}</strong>
            <small>{copy.participants}</small>
          </div>
        </header>

        <div className="worldcup-pool-participant-grid">
          <div className="worldcup-pool-participant-card-wide">
            <WorldCupPoolPredictionsPanel lang={currentLang} inviteToken={token} />
          </div>

          <div className="worldcup-pool-participant-card-wide">
            <WorldCupPoolRankingPanel lang={currentLang} inviteToken={token} />
          </div>

          <article className="worldcup-pool-participant-card worldcup-pool-participant-card-wide">
            <div>
              <span>{copy.rulesTitle}</span>
              <h2>{copy.rulesTitle}</h2>
            </div>

            <dl className="worldcup-pool-scoring-list">
              <div>
                <dt>{copy.exactScore}</dt>
                <dd>{data.scoring.exact_score_points}</dd>
              </div>
              <div>
                <dt>{copy.outcome}</dt>
                <dd>{data.scoring.outcome_points}</dd>
              </div>
              <div>
                <dt>{copy.teamScoreBonus}</dt>
                <dd>{data.scoring.exact_team_score_bonus}</dd>
              </div>
              <div>
                <dt>{copy.maxPerMatch}</dt>
                <dd>{data.scoring.max_points_per_match}</dd>
              </div>
            </dl>
          </article>
        </div>

        <div className="worldcup-pool-participant-actions">
          <Link className="public-btn public-btn-secondary" to={invitePath}>
            {copy.invite}
          </Link>
        </div>
      </section>
    </div>
  );
}