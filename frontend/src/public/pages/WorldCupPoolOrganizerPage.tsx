import React from "react";
import { Link, useParams } from "react-router-dom";
import "../worldcup-pool.css";

import type { Lang } from "../../i18n";
import { coercePublicLang } from "../lib/publicLang";
import {
  createWorldCupPoolOrganizerParticipantSession,
  fetchWorldCupPoolOrganizerDashboard,
  fetchWorldCupPoolOrganizerSessionStatus,
  loginWorldCupPoolOrganizer,
  logoutWorldCupPoolOrganizer,
  requestWorldCupPoolPinReset,
  removeWorldCupPoolParticipant,
  type WorldCupPoolOrganizerDashboardResponse,
} from "../api/publicClient";

const PAGE_SIZE = 10;

const COPY = {
  pt: {
    loading: "Carregando painel...",
    errorTitle: "Não foi possível abrir o painel",
    errorBody:
      "Este painel exige a sessão do organizador. Entre com o e-mail e PIN usados na criação do bolão.",
    loginTitle: "Entrar como organizador",
    loginBody: "Use o e-mail e o PIN de 4 dígitos criados junto com este bolão.",
    email: "E-mail do organizador",
    emailPlaceholder: "voce@email.com",
    pin: "PIN",
    pinPlaceholder: "0000",
    loginButton: "Entrar no painel",
    loginLoading: "Entrando...",
    loginError: "Não foi possível entrar. Confira o e-mail, PIN e o bolão aberto.",
    forgotPin: "Esqueci meu PIN",
    pinResetSending: "Enviando...",
    pinResetSent:
      "Se este e-mail estiver vinculado a este bolão, enviaremos um novo PIN e os links de acesso.",
    pinResetEmailRequired: "Informe o e-mail do organizador para recuperar o PIN.",
    pinResetError: "Não foi possível enviar o novo PIN agora. Tente novamente em instantes.",
    myPredictions: "Acessar meus palpites",
    myPredictionsLoading: "Abrindo palpites...",
    myPredictionsError: "Não foi possível abrir seus palpites agora.",
    logout: "Sair",
    logoutLoading: "Saindo...",
    logoutError: "Não foi possível sair agora. Tente novamente.",
    eyebrow: "Painel do organizador",
    inviteLink: "Link de convite",
    copyLink: "Copiar link",
    copied: "Link copiado",
    activeParticipants: "participantes ativos",
    availableMatches: "jogos liberados",
    rankingTitle: "Ranking geral",
    rankingBody: "Veja a classificação do bolão e o progresso de palpites de cada participante.",
    searchLabel: "Filtrar por nome",
    searchPlaceholder: "Buscar participante...",
    searchButton: "Filtrar",
    clearSearch: "Limpar",
    empty: "Ainda não há participantes confirmados.",
    noResults: "Nenhum participante encontrado com esse nome.",
    remove: "Remover",
    removing: "Removendo...",
    removeConfirm: "Remover este participante do bolão?",
    organizer: "Organizador",
    joinedAt: "Entrou em",
    points: "pts",
    predictions: "palpites",
    page: "Página",
    of: "de",
    previous: "Anterior",
    next: "Próxima",
    backToLanding: "Voltar para página do bolão",
  },
  en: {
    loading: "Loading dashboard...",
    errorTitle: "Could not open dashboard",
    errorBody:
      "This dashboard requires the organizer session. Log in with the email and PIN used to create this pool.",
    loginTitle: "Log in as organizer",
    loginBody: "Use the email and 4-digit PIN created with this pool.",
    email: "Organizer email",
    emailPlaceholder: "you@email.com",
    pin: "PIN",
    pinPlaceholder: "0000",
    loginButton: "Open dashboard",
    loginLoading: "Signing in...",
    loginError: "Could not sign in. Check the email, PIN, and pool link.",
    forgotPin: "I forgot my PIN",
    pinResetSending: "Sending...",
    pinResetSent:
      "If this email is linked to this pool, we will send a new PIN and access links.",
    pinResetEmailRequired: "Enter the organizer email to recover the PIN.",
    pinResetError: "Could not send a new PIN right now. Try again in a moment.",
    myPredictions: "Open my predictions",
    myPredictionsLoading: "Opening predictions...",
    myPredictionsError: "Could not open your predictions right now.",
    logout: "Log out",
    logoutLoading: "Logging out...",
    logoutError: "Could not log out now. Try again.",
    eyebrow: "Organizer dashboard",
    inviteLink: "Invite link",
    copyLink: "Copy link",
    copied: "Link copied",
    activeParticipants: "active participants",
    availableMatches: "available matches",
    rankingTitle: "Overall ranking",
    rankingBody: "See the pool standings and each participant's prediction progress.",
    searchLabel: "Filter by name",
    searchPlaceholder: "Search participant...",
    searchButton: "Filter",
    clearSearch: "Clear",
    empty: "No confirmed participants yet.",
    noResults: "No participants found with that name.",
    remove: "Remove",
    removing: "Removing...",
    removeConfirm: "Remove this participant from the pool?",
    organizer: "Organizer",
    joinedAt: "Joined at",
    points: "pts",
    predictions: "predictions",
    page: "Page",
    of: "of",
    previous: "Previous",
    next: "Next",
    backToLanding: "Back to pool page",
  },
  es: {
    loading: "Cargando panel...",
    errorTitle: "No fue posible abrir el panel",
    errorBody:
      "Este panel exige la sesión del organizador. Entra con el email y PIN usados al crear esta porra.",
    loginTitle: "Entrar como organizador",
    loginBody: "Usa el email y el PIN de 4 dígitos creados con esta porra.",
    email: "Email del organizador",
    emailPlaceholder: "tu@email.com",
    pin: "PIN",
    pinPlaceholder: "0000",
    loginButton: "Entrar al panel",
    loginLoading: "Entrando...",
    loginError: "No fue posible entrar. Revisa el email, PIN y la porra abierta.",
    forgotPin: "Olvidé mi PIN",
    pinResetSending: "Enviando...",
    pinResetSent:
      "Si este email está vinculado a esta porra, enviaremos un nuevo PIN y los enlaces de acceso.",
    pinResetEmailRequired: "Informa el email del organizador para recuperar el PIN.",
    pinResetError: "No fue posible enviar el nuevo PIN ahora. Inténtalo nuevamente en unos instantes.",
    myPredictions: "Acceder a mis pronósticos",
    myPredictionsLoading: "Abriendo pronósticos...",
    myPredictionsError: "No fue posible abrir tus pronósticos ahora.",
    logout: "Salir",
    logoutLoading: "Saliendo...",
    logoutError: "No fue posible salir ahora. Inténtalo nuevamente.",
    eyebrow: "Panel del organizador",
    inviteLink: "Enlace de invitación",
    copyLink: "Copiar enlace",
    copied: "Enlace copiado",
    activeParticipants: "participantes activos",
    availableMatches: "partidos disponibles",
    rankingTitle: "Ranking general",
    rankingBody: "Consulta la clasificación de la porra y el progreso de pronósticos de cada participante.",
    searchLabel: "Filtrar por nombre",
    searchPlaceholder: "Buscar participante...",
    searchButton: "Filtrar",
    clearSearch: "Limpiar",
    empty: "Aún no hay participantes confirmados.",
    noResults: "No se encontraron participantes con ese nombre.",
    remove: "Eliminar",
    removing: "Eliminando...",
    removeConfirm: "¿Eliminar este participante de la porra?",
    organizer: "Organizador",
    joinedAt: "Entró en",
    points: "pts",
    predictions: "pronósticos",
    page: "Página",
    of: "de",
    previous: "Anterior",
    next: "Siguiente",
    backToLanding: "Volver a la página de la porra",
  },
} as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function isExpectedOrganizerAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  return (
    message.includes("ORGANIZER_SESSION_REQUIRED") ||
    message.includes("INVALID_ORGANIZER_SESSION")
  );
}

export function WorldCupPoolOrganizerPage() {
  const { lang, slug } = useParams<{ lang: string; slug: string }>();
  const currentLang = coercePublicLang(lang) as Lang;
  const copy = COPY[currentLang] ?? COPY.pt;
  const poolSlug = String(slug || "").trim();

  const [data, setData] = React.useState<WorldCupPoolOrganizerDashboardResponse | null>(null);
  const [page, setPage] = React.useState(1);
  const [query, setQuery] = React.useState("");
  const [queryDraft, setQueryDraft] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<number | null>(null);
  const [loginEmail, setLoginEmail] = React.useState("");
  const [loginPin, setLoginPin] = React.useState("");
  const [loginLoading, setLoginLoading] = React.useState(false);
  const [loginError, setLoginError] = React.useState("");
  const [pinResetBusy, setPinResetBusy] = React.useState(false);
  const [pinResetMessage, setPinResetMessage] = React.useState("");
  const [pinResetError, setPinResetError] = React.useState("");
  const [myPredictionsLoading, setMyPredictionsLoading] = React.useState(false);
  const [myPredictionsError, setMyPredictionsError] = React.useState("");
  const [logoutLoading, setLogoutLoading] = React.useState(false);
  const [logoutError, setLogoutError] = React.useState("");

  const loadDashboard = React.useCallback(async () => {
    if (!poolSlug) {
      setLoadError(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(false);

    try {
      const response = await fetchWorldCupPoolOrganizerDashboard(poolSlug, {
        page,
        pageSize: PAGE_SIZE,
        q: query,
      });
      setData(response);
    } catch (err) {
      if (!isExpectedOrganizerAuthError(err)) {
        console.error("failed to load organizer dashboard", err);
      }

      setData(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [poolSlug, page, query]);

  React.useEffect(() => {
    let active = true;

    async function bootstrapOrganizerSession() {
      if (!poolSlug) {
        setLoadError(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(false);

      try {
        const session = await fetchWorldCupPoolOrganizerSessionStatus(poolSlug);

        if (!active) return;

        if (!session.authenticated) {
          setData(null);
          setLoadError(true);
          setLoading(false);
          return;
        }

        await loadDashboard();
      } catch (err) {
        if (active) {
          console.error("failed to check organizer session", err);
          setData(null);
          setLoadError(true);
          setLoading(false);
        }
      }
    }

    void bootstrapOrganizerSession();

    return () => {
      active = false;
    };
  }, [poolSlug, loadDashboard]);

  async function openMyPredictions() {
    if (!data?.pool.slug) return;

    const predictionsTab = window.open("", "_blank");

    if (!predictionsTab) {
      setMyPredictionsError(copy.myPredictionsError);
      return;
    }

    predictionsTab.opener = null;
    predictionsTab.document.title = copy.myPredictionsLoading;
    predictionsTab.document.body.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #0f172a;">
        <strong>${copy.myPredictionsLoading}</strong>
      </div>
    `;

    setMyPredictionsLoading(true);
    setMyPredictionsError("");

    try {
      const response = await createWorldCupPoolOrganizerParticipantSession(data.pool.slug);
      predictionsTab.location.href = response.participant_url;
    } catch (err) {
      console.error("failed to open organizer participant panel", err);
      predictionsTab.close();
      setMyPredictionsError(copy.myPredictionsError);
    } finally {
      setMyPredictionsLoading(false);
    }
  }

  async function onOrganizerLogout() {
    if (!data?.pool.slug || logoutLoading) return;

    setLogoutLoading(true);
    setLogoutError("");

    try {
      await logoutWorldCupPoolOrganizer(data.pool.slug);

      setData(null);
      setLoadError(true);
      setLoginPin("");
      setMyPredictionsError("");
    } catch (err) {
      console.error("failed to logout organizer", err);
      setLogoutError(copy.logoutError);
    } finally {
      setLogoutLoading(false);
    }
  }

  async function copyInviteLink() {
    if (!data?.pool.invite_url) return;

    try {
      await navigator.clipboard.writeText(data.pool.invite_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

   function onLoginPinChange(value: string) {
    setLoginPin(value.replace(/\D/g, "").slice(0, 4));
  }

  async function onPinReset() {
    if (!poolSlug || !loginEmail.trim()) {
      setPinResetMessage("");
      setPinResetError(copy.pinResetEmailRequired);
      return;
    }

    setPinResetBusy(true);
    setPinResetMessage("");
    setPinResetError("");

    try {
      await requestWorldCupPoolPinReset({
        email: loginEmail.trim(),
        pool_slug: poolSlug,
      });

      setPinResetMessage(copy.pinResetSent);
    } catch (err) {
      console.error("failed to request organizer pin reset", err);
      setPinResetError(copy.pinResetError);
    } finally {
      setPinResetBusy(false);
    }
  }

  async function onOrganizerLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!poolSlug || !loginEmail.trim() || loginPin.length !== 4) {
      setLoginError(copy.loginError);
      return;
    }

    setLoginLoading(true);
    setLoginError("");

    try {
      await loginWorldCupPoolOrganizer(poolSlug, {
        email: loginEmail.trim(),
        pin: loginPin,
      });

      setLoadError(false);
      await loadDashboard();
    } catch (err) {
      console.error("failed to login organizer", err);
      setLoginError(copy.loginError);
    } finally {
      setLoginLoading(false);
    }
  }

  function onSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(queryDraft.trim());
  }

  function clearSearch() {
    setQueryDraft("");
    setQuery("");
    setPage(1);
  }

  function changePage(nextPage: number) {
    if (!data) return;

    const safePage = Math.min(Math.max(nextPage, 1), Math.max(data.pagination.total_pages, 1));
    if (safePage === page) return;

    setPage(safePage);
  }

  async function onRemoveParticipant(participantId: number) {
    if (!data) return;

    const ok = window.confirm(copy.removeConfirm);
    if (!ok) return;

    setRemovingId(participantId);

    try {
      await removeWorldCupPoolParticipant(data.pool.slug, participantId);
      await loadDashboard();
    } catch (err) {
      console.error("failed to remove participant", err);
    } finally {
      setRemovingId(null);
    }
  }

  if (loading && !data) {
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
          <div className="worldcup-pool-hero-card worldcup-pool-placeholder-card worldcup-pool-organizer-login-card">
            <div>
              <div className="public-eyebrow">{copy.eyebrow}</div>
              <h1 className="public-title">{copy.errorTitle}</h1>
              <p className="public-body">{copy.errorBody}</p>

              <Link className="public-btn public-btn-secondary" to={`/${currentLang}/bolao/copa`}>
                {copy.backToLanding}
              </Link>
            </div>

            <form className="worldcup-pool-form worldcup-pool-organizer-login-form" onSubmit={onOrganizerLogin}>
              <div>
                <h3 className="worldcup-pool-form-title">{copy.loginTitle}</h3>
                <p className="worldcup-pool-form-body">{copy.loginBody}</p>
              </div>

              <label className="product-field">
                <span>{copy.email}</span>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder={copy.emailPlaceholder}
                  autoComplete="email"
                  disabled={loginLoading}
                />
              </label>

              <label className="product-field">
                <span>{copy.pin}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={loginPin}
                  onChange={(event) => onLoginPinChange(event.target.value)}
                  placeholder={copy.pinPlaceholder}
                  autoComplete="one-time-code"
                  disabled={loginLoading}
                />
              </label>

              <div className="worldcup-pool-pin-reset-row">
                <button
                  type="button"
                  className="worldcup-pool-link-button"
                  onClick={onPinReset}
                  disabled={pinResetBusy || loginLoading}
                >
                  {pinResetBusy ? copy.pinResetSending : copy.forgotPin}
                </button>
              </div>

              {pinResetMessage ? (
                <p className="worldcup-pool-form-success">{pinResetMessage}</p>
              ) : null}

              {pinResetError ? (
                <p className="worldcup-pool-form-error">{pinResetError}</p>
              ) : null}

              {loginError ? <p className="worldcup-pool-form-error">{loginError}</p> : null}

              <button
                type="submit"
                className="public-btn public-btn-primary"
                disabled={loginLoading || !loginEmail.trim() || loginPin.length !== 4}
              >
                {loginLoading ? copy.loginLoading : copy.loginButton}
              </button>
            </form>
          </div>
        </section>
      </div>
    );
  }

  const totalPages = data.pagination.total_pages || 0;
  const canGoPrevious = page > 1;
  const canGoNext = totalPages > 0 && page < totalPages;
  const hasSearch = query.trim().length > 0;

  return (
    <div className="worldcup-pool-page">
      <section className="worldcup-pool-hero">
        <div className="worldcup-pool-hero-card worldcup-pool-placeholder-card">
          <div>
            <div className="public-eyebrow">{copy.eyebrow}</div>
            <h1 className="public-title">{data.pool.name}</h1>

            <div className="worldcup-pool-admin-stats">
              <div>
                <strong>{data.summary.active_participants}</strong>
                <span>{copy.activeParticipants}</span>
              </div>

              <div>
                <strong>{data.summary.available_matches}</strong>
                <span>{copy.availableMatches}</span>
              </div>
            </div>
          </div>

          <div className="worldcup-pool-admin-link-card">
            <span>{copy.inviteLink}</span>
            <strong>{data.pool.invite_url}</strong>

            <div className="worldcup-pool-admin-link-actions">
              <button
                type="button"
                className="public-btn public-btn-primary"
                onClick={copyInviteLink}
              >
                {copied ? copy.copied : copy.copyLink}
              </button>

              <button
                type="button"
                className="public-btn public-btn-secondary"
                onClick={openMyPredictions}
                disabled={myPredictionsLoading}
              >
                {myPredictionsLoading ? copy.myPredictionsLoading : copy.myPredictions}
              </button>

              <button
                type="button"
                className="public-btn public-btn-secondary"
                onClick={onOrganizerLogout}
                disabled={logoutLoading}
              >
                {logoutLoading ? copy.logoutLoading : copy.logout}
              </button>
            </div>

            {myPredictionsError ? (
              <p className="worldcup-pool-form-error">{myPredictionsError}</p>
            ) : null}

            {logoutError ? (
              <p className="worldcup-pool-form-error">{logoutError}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="worldcup-pool-section">
        <div className="worldcup-pool-admin-ranking-panel">
          <div className="worldcup-pool-admin-ranking-head">
            <div>
              <span className="worldcup-pool-panel-kicker">{copy.eyebrow}</span>
              <h2>{copy.rankingTitle}</h2>
              <p>{copy.rankingBody}</p>
            </div>

            <form className="worldcup-pool-admin-search" onSubmit={onSearchSubmit}>
              <label htmlFor="worldcup-pool-admin-search-input">{copy.searchLabel}</label>
              <div>
                <input
                  id="worldcup-pool-admin-search-input"
                  type="search"
                  value={queryDraft}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                />
                <button type="submit" className="public-btn public-btn-primary" disabled={loading}>
                  {copy.searchButton}
                </button>
                {hasSearch ? (
                  <button
                    type="button"
                    className="public-btn public-btn-secondary"
                    onClick={clearSearch}
                    disabled={loading}
                  >
                    {copy.clearSearch}
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="worldcup-pool-ranking-table-card">
            <div className="worldcup-pool-ranking-table-head">
              <strong>{copy.rankingTitle}</strong>

              <span>
                {copy.page} {totalPages === 0 ? 0 : page} {copy.of} {totalPages}
              </span>
            </div>

            {loading ? (
              <div className="worldcup-pool-ranking-state">{copy.loading}</div>
            ) : data.participants.length === 0 ? (
              <div className="worldcup-pool-ranking-state">
                {hasSearch ? copy.noResults : copy.empty}
              </div>
            ) : (
              <ol className="worldcup-pool-admin-ranking-list">
                {data.participants.map((participant) => (
                  <li key={participant.id} className="worldcup-pool-admin-ranking-row">
                    <div className="worldcup-pool-ranking-position">#{participant.rank}</div>

                    <div className="worldcup-pool-admin-ranking-main">
                      <div className="worldcup-pool-ranking-name">
                        <strong>
                          {participant.display_name}
                          {participant.is_organizer ? (
                            <span className="worldcup-pool-organizer-badge">{copy.organizer}</span>
                          ) : null}
                        </strong>
                        <span>{participant.email}</span>
                        <small>
                          {copy.joinedAt}: {formatDate(participant.joined_at_utc)}
                        </small>
                      </div>

                      <div className="worldcup-pool-admin-ranking-progress">
                        <strong>
                          {participant.predictions_count}/{participant.available_matches}
                        </strong>
                        <span>{copy.predictions}</span>
                      </div>
                    </div>

                    <div className="worldcup-pool-admin-ranking-side">
                      <div className="worldcup-pool-ranking-points">
                        <strong>{participant.points}</strong>
                        <span>{copy.points}</span>
                      </div>

                      {participant.is_organizer ? (
                        <span className="worldcup-pool-organizer-locked-badge">{copy.organizer}</span>
                      ) : (
                        <button
                          type="button"
                          className="public-btn public-btn-secondary worldcup-pool-admin-remove-btn"
                          onClick={() => onRemoveParticipant(participant.id)}
                          disabled={removingId === participant.id || loading}
                        >
                          {removingId === participant.id ? copy.removing : copy.remove}
                        </button>
                      )}
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
        </div>
      </section>
    </div>
  );
}