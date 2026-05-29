import React from "react";
import { Link, useParams } from "react-router-dom";
import "../worldcup-pool.css";

import type { Lang } from "../../i18n";
import { coercePublicLang } from "../lib/publicLang";
import {
  fetchWorldCupPoolParticipantDashboard,
  logoutWorldCupPoolParticipant,
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
    scoringClassicMode: "Clássica",
    scoringWeightedMode: "Emoção até a final",
    scoringClassicHint: "Todos os jogos valem igual.",
    scoringWeightedHint: "Base da fase de grupos. Fase extra e mata-mata valem mais.",
    invite: "Voltar ao convite",
    logout: "Sair",
    logoutLoading: "Saindo...",
    logoutError: "Não foi possível sair agora. Tente novamente.",
    changePool: "Trocar bolão",
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
    scoringClassicMode: "Classic",
    scoringWeightedMode: "Drama until the final",
    scoringClassicHint: "Every match is worth the same.",
    scoringWeightedHint: "Group-stage base. Extra round and knockout matches are worth more.",
    invite: "Back to invite",
    logout: "Log out",
    logoutLoading: "Logging out...",
    logoutError: "Could not log out now. Try again.",
    changePool: "Switch pool",
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
    scoringClassicMode: "Clásica",
    scoringWeightedMode: "Emoción hasta la final",
    scoringClassicHint: "Todos los partidos valen igual.",
    scoringWeightedHint: "Base de la fase de grupos. Ronda extra y eliminatorias valen más.",
    invite: "Volver a la invitación",
    logout: "Salir",
    logoutLoading: "Saliendo...",
    logoutError: "No fue posible salir ahora. Inténtalo nuevamente.",
    changePool: "Cambiar porra",
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
  const [logoutLoading, setLogoutLoading] = React.useState(false);
  const [logoutError, setLogoutError] = React.useState("");

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

  async function onParticipantLogout() {
    if (!token || logoutLoading) return;

    setLogoutLoading(true);
    setLogoutError("");

    try {
      await logoutWorldCupPoolParticipant(token);
      window.location.assign(invitePath);
    } catch (err) {
      console.error("failed to logout participant", err);
      setLogoutError(copy.logoutError);
    } finally {
      setLogoutLoading(false);
    }
  }

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

  const scoringModeTitle =
    data.scoring_rules?.title?.[currentLang] ??
    data.scoring_rules?.title?.pt ??
    (data.scoring_mode === "weighted_by_stage"
      ? copy.scoringWeightedMode
      : copy.scoringClassicMode);

  const scoringModeHint =
    data.scoring_mode === "weighted_by_stage"
      ? copy.scoringWeightedHint
      : copy.scoringClassicHint;

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

          <article className="worldcup-pool-participant-card worldcup-pool-participant-card-wide worldcup-pool-scoring-card">
            <div className="worldcup-pool-scoring-card-head">
              <div>
                <span>{copy.rulesTitle}</span>
                <h2>{copy.rulesTitle}</h2>
              </div>

              <div className="worldcup-pool-scoring-mode-summary">
                <strong
                  className={`worldcup-pool-scoring-mode-pill ${
                    data.scoring_mode === "weighted_by_stage" ? "is-weighted" : "is-classic"
                  }`}
                >
                  {scoringModeTitle}
                </strong>
                <small>{scoringModeHint}</small>
              </div>
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

          <Link className="public-btn public-btn-secondary" to={`/${currentLang}/bolao/copa/meus-boloes`}>
            {copy.changePool}
          </Link>

          <button
            type="button"
            className="public-btn public-btn-secondary"
            onClick={onParticipantLogout}
            disabled={logoutLoading}
          >
            {logoutLoading ? copy.logoutLoading : copy.logout}
          </button>
        </div>

        {logoutError ? (
          <p className="worldcup-pool-form-error">{logoutError}</p>
        ) : null}
      </section>
    </div>
  );
}