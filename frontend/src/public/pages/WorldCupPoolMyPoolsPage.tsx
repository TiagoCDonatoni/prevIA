import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import "../worldcup-pool.css";

import type { Lang } from "../../i18n";
import { coercePublicLang } from "../lib/publicLang";
import {
  fetchWorldCupPoolMyPools,
  type WorldCupPoolMyPool,
} from "../api/publicClient";

const COPY = {
  pt: {
    loading: "Carregando seus bolões...",
    eyebrow: "Meus bolões",
    title: "Escolha qual bolão você quer abrir",
    subtitle:
      "Encontramos mais de uma sessão ativa neste navegador. Você pode alternar entre seus bolões sem digitar o PIN novamente.",
    emptyTitle: "Nenhum bolão ativo neste navegador",
    emptyBody:
      "Entre pelo link de convite ou pelo painel de organizador para salvar uma sessão neste navegador.",
    errorTitle: "Não foi possível carregar seus bolões",
    errorBody: "Tente atualizar a página ou entrar novamente pelo link do bolão.",
    organizer: "Organizador",
    participant: "Participante",
    participants: "participantes",
    predictions: "palpites feitos",
    openAdmin: "Gerenciar bolão",
    openPredictions: "Ver meus palpites",
    backToLanding: "Voltar para página do bolão",
  },
  en: {
    loading: "Loading your pools...",
    eyebrow: "My pools",
    title: "Choose which pool you want to open",
    subtitle:
      "We found more than one active session in this browser. You can switch between pools without typing the PIN again.",
    emptyTitle: "No active pool in this browser",
    emptyBody:
      "Enter through an invite link or an organizer dashboard to save a session in this browser.",
    errorTitle: "Could not load your pools",
    errorBody: "Try refreshing the page or signing in again through the pool link.",
    organizer: "Organizer",
    participant: "Participant",
    participants: "participants",
    predictions: "predictions saved",
    openAdmin: "Manage pool",
    openPredictions: "Open predictions",
    backToLanding: "Back to pool page",
  },
  es: {
    loading: "Cargando tus porras...",
    eyebrow: "Mis porras",
    title: "Elige qué porra quieres abrir",
    subtitle:
      "Encontramos más de una sesión activa en este navegador. Puedes alternar entre porras sin escribir el PIN nuevamente.",
    emptyTitle: "Ninguna porra activa en este navegador",
    emptyBody:
      "Entra por el enlace de invitación o por el panel del organizador para guardar una sesión en este navegador.",
    errorTitle: "No fue posible cargar tus porras",
    errorBody: "Intenta actualizar la página o entrar nuevamente por el enlace de la porra.",
    organizer: "Organizador",
    participant: "Participante",
    participants: "participantes",
    predictions: "pronósticos hechos",
    openAdmin: "Gestionar porra",
    openPredictions: "Ver mis pronósticos",
    backToLanding: "Volver a la página de la porra",
  },
} as const;

function participantPath(lang: Lang, pool: WorldCupPoolMyPool) {
  return `/${lang}/bolao/copa/painel/${encodeURIComponent(pool.invite_token)}`;
}

function adminPath(lang: Lang, pool: WorldCupPoolMyPool) {
  return `/${lang}/bolao/copa/admin/${encodeURIComponent(pool.slug)}`;
}

export function WorldCupPoolMyPoolsPage() {
  const { lang } = useParams<{ lang: string }>();
  const navigate = useNavigate();
  const currentLang = coercePublicLang(lang) as Lang;
  const copy = COPY[currentLang] ?? COPY.pt;

  const [pools, setPools] = React.useState<WorldCupPoolMyPool[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(false);

      try {
        const response = await fetchWorldCupPoolMyPools();

        if (cancelled) {
          return;
        }

        setPools(response.pools);

        if (response.pools.length === 1) {
          const onlyPool = response.pools[0];
          const destination =
            onlyPool.primary_role === "organizer"
              ? adminPath(currentLang, onlyPool)
              : participantPath(currentLang, onlyPool);

          navigate(destination, { replace: true });
        }
      } catch (err) {
        console.error("failed to load authenticated world cup pools", err);

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
  }, [currentLang, navigate]);

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

  if (loadError) {
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

              <Link className="public-btn public-btn-secondary" to={`/${currentLang}/bolao/copa`}>
                {copy.backToLanding}
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (pools.length === 0) {
    return (
      <div className="worldcup-pool-page">
        <section className="worldcup-pool-hero">
          <div className="worldcup-pool-hero-card worldcup-pool-placeholder-card">
            <div className="worldcup-pool-create-result">
              <div>
                <div className="public-eyebrow">{copy.eyebrow}</div>
                <h1>{copy.emptyTitle}</h1>
                <p>{copy.emptyBody}</p>
              </div>

              <Link className="public-btn public-btn-primary" to={`/${currentLang}/bolao/copa`}>
                {copy.backToLanding}
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="worldcup-pool-page">
      <section className="worldcup-pool-my-pools-shell">
        <header className="worldcup-pool-my-pools-head">
          <div>
            <div className="public-eyebrow">{copy.eyebrow}</div>
            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>
        </header>

        <div className="worldcup-pool-my-pools-grid">
          {pools.map((pool) => {
            const isOrganizer = pool.roles.includes("organizer");
            const isParticipant = pool.roles.includes("participant");

            return (
              <article key={pool.id} className="worldcup-pool-my-pool-card">
                <div className="worldcup-pool-my-pool-card-head">
                  <div>
                    <h2>{pool.name}</h2>
                    <p>
                      {pool.participant_count} {copy.participants}
                    </p>
                  </div>

                  <div className="worldcup-pool-my-pool-roles">
                    {isOrganizer ? <span>{copy.organizer}</span> : null}
                    {isParticipant ? <span>{copy.participant}</span> : null}
                  </div>
                </div>

                {isParticipant ? (
                  <div className="worldcup-pool-my-pool-progress">
                    <strong>
                      {pool.predictions_count}/{pool.available_matches}
                    </strong>
                    <span>{copy.predictions}</span>
                  </div>
                ) : null}

                <div className="worldcup-pool-my-pool-actions">
                  {isOrganizer ? (
                    <Link className="public-btn public-btn-primary" to={adminPath(currentLang, pool)}>
                      {copy.openAdmin}
                    </Link>
                  ) : null}

                  {isParticipant ? (
                    <Link
                      className="public-btn public-btn-secondary"
                      to={participantPath(currentLang, pool)}
                    >
                      {copy.openPredictions}
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}