import React from "react";

import type { Lang } from "../../i18n";
import {
  createWorldCupPool,
  loginWorldCupPoolOrganizer,
  type WorldCupPoolCreateResponse,
  type WorldCupPoolScoringMode,
  type WorldCupPoolScoringModeConfig,
} from "../api/publicClient";

type Props = {
  lang: Lang;
  canCreate: boolean;
  scoringModes: WorldCupPoolScoringModeConfig[];
};

const COPY = {
  pt: {
    title: "Crie seu bolão grátis",
    body: "Informe os dados básicos. Em seguida, você recebe o link para convidar o grupo e o acesso ao painel do organizador.",
    disabled:
      "A criação de novos bolões está temporariamente pausada. Tente novamente em instantes.",
    poolName: "Nome do bolão",
    organizerName: "Seu nome",
    email: "Seu e-mail",
    pin: "PIN de 4 dígitos",
    poolNamePlaceholder: "Bolão da Firma 2026",
    organizerNamePlaceholder: "Seu nome",
    emailPlaceholder: "voce@email.com",
    pinPlaceholder: "1234",
    termsPrefix: "Aceito os",
    termsLink: "termos do Bolão da Copa",
    termsModalTitle: "Termos do Bolão da Copa",
    termsModalBody: [
      "O Bolão da Copa é uma experiência recreativa para ranking e diversão entre amigos.",
      "Não envolve apostas, prêmios financeiros, intermediação de pagamentos ou promessa de ganho.",
      "O organizador é responsável por convidar seus amigos e administrar o grupo.",
      "O prevIA fornece apenas a ferramenta de criação, participação, ranking e acompanhamento do bolão.",
    ],
    termsModalClose: "Entendi",
    marketing: "Quero receber novidades do prevIA e do Bolão da Copa.",
    submit: "Criar bolão",
    sending: "Criando...",
    successTitle: "Bolão criado!",
    successBody: "Seu bolão está pronto. Você já entrou como participante automaticamente.",
    creatorParticipantTitle: "Você já está participando",
    creatorParticipantBody: "Seu nome já foi adicionado à lista de participantes.",
    inviteTitle: "Link para convidar amigos",
    inviteBody: "Envie este link para quem vai participar do bolão.",
    adminHintTitle: "Painel do organizador",
    adminHintBody: "Use seu e-mail e PIN para voltar ao painel quando precisar.",
    copyLink: "Copiar convite",
    copied: "Convite copiado",
    openLink: "Ver convite",
    shareWhatsApp: "Compartilhar no WhatsApp",
    whatsAppText:
      "Criei o bolão {poolName} para a Copa 2026. Entra pelo link e deixa seus palpites: {inviteUrl}",
    openAdmin: "Ir para o painel",
    openAdminLoading: "Entrando...",
    linkNote: "Guarde o PIN que você acabou de criar. Ele não será exibido novamente.",
    error: "Não foi possível criar o bolão agora. Confira os dados e tente novamente.",
    pinHelp: "Use apenas números. Esse PIN será usado para você voltar ao painel do organizador.",
    scoringModeTitle: "Pontuação do bolão",
    scoringModeBody: "Escolha como os palpites serão pontuados. A Clássica é o padrão e todos os jogos valem igual.",
    scoringClassicTitle: "Clássica",
    scoringClassicBody: "Todos os jogos valem a mesma pontuação. Mais simples para grupos casuais.",
    scoringWeightedTitle: "Emoção até a final",
    scoringWeightedBody: "Jogos das fases finais valem mais pontos para manter a disputa viva.",
    scoringDefaultBadge: "Padrão",
    scoringDetailsLink: "Ver diferenças",
    scoringDetailsTitle: "Diferenças de pontuação",
    scoringDetailsBody: "Compare os modos antes de criar o bolão. A regra escolhida será usada no ranking desse bolão.",
    scoringTablePhase: "Fase",
    scoringTableExact: "Placar exato",
    scoringTableOutcome: "Resultado correto",
    scoringTableTeamGoal: "Gol exato de um time",
    scoringTableMax: "Máximo",
  },
  en: {
    title: "Create your free pool",
    body: "Enter the basics. Then you will receive the invite link and access to the organizer dashboard.",
    disabled:
      "New pool creation is temporarily paused. Please try again shortly.",
    poolName: "Pool name",
    organizerName: "Your name",
    email: "Your email",
    pin: "4-digit PIN",
    poolNamePlaceholder: "Office Pool 2026",
    organizerNamePlaceholder: "Your name",
    emailPlaceholder: "you@email.com",
    pinPlaceholder: "1234",
    termsPrefix: "I accept the",
    termsLink: "World Cup Pool terms",
    termsModalTitle: "World Cup Pool terms",
    termsModalBody: [
      "The World Cup Pool is a recreational experience for rankings and fun among friends.",
      "It does not involve betting, financial prizes, payment intermediation, or any promise of profit.",
      "The organizer is responsible for inviting friends and managing the group.",
      "prevIA only provides the creation, participation, ranking, and tracking tool for the pool.",
    ],
    termsModalClose: "Got it",
    marketing: "I want to receive prevIA and World Cup Pool updates.",
    submit: "Create pool",
    sending: "Creating...",
    successTitle: "Pool created!",
    successBody: "Your pool is ready. You have already joined as a participant automatically.",
    creatorParticipantTitle: "You are already participating",
    creatorParticipantBody: "Your name has already been added to the participant list.",
    inviteTitle: "Invite link",
    inviteBody: "Send this link to everyone who will join the pool.",
    adminHintTitle: "Organizer dashboard",
    adminHintBody: "Use your email and PIN to return to the dashboard whenever needed.",
    copyLink: "Copy invite",
    copied: "Invite copied",
    openLink: "View invite",
    shareWhatsApp: "Share on WhatsApp",
    whatsAppText:
      "I created the {poolName} World Cup 2026 pool. Join through the link and add your predictions: {inviteUrl}",
    openAdmin: "Go to dashboard",
    openAdminLoading: "Opening...",
    linkNote: "Keep the PIN you just created. It will not be shown again.",
    error: "Could not create the pool right now. Check the fields and try again.",
    pinHelp: "Use numbers only. This PIN will let you return to the organizer panel.",
    scoringModeTitle: "Pool scoring",
    scoringModeBody: "Choose how predictions will be scored. Classic is the default and every match is worth the same.",
    scoringClassicTitle: "Classic",
    scoringClassicBody: "Every match uses the same scoring table. Simpler for casual groups.",
    scoringWeightedTitle: "Drama until the final",
    scoringWeightedBody: "Final-stage matches are worth more points to keep the race alive.",
    scoringDefaultBadge: "Default",
    scoringDetailsLink: "See differences",
    scoringDetailsTitle: "Scoring differences",
    scoringDetailsBody: "Compare the modes before creating the pool. The selected rule will be used for this pool leaderboard.",
    scoringTablePhase: "Stage",
    scoringTableExact: "Exact score",
    scoringTableOutcome: "Correct outcome",
    scoringTableTeamGoal: "Exact team score",
    scoringTableMax: "Max",
  },
  es: {
    title: "Crea tu porra gratis",
    body: "Informa los datos básicos. Después recibirás el enlace de invitación y el acceso al panel del organizador.",
    disabled:
      "La creación de nuevas porras está temporalmente pausada. Inténtalo nuevamente en instantes.",
    poolName: "Nombre de la porra",
    organizerName: "Tu nombre",
    email: "Tu email",
    pin: "PIN de 4 dígitos",
    poolNamePlaceholder: "Porra de la Oficina 2026",
    organizerNamePlaceholder: "Tu nombre",
    emailPlaceholder: "tu@email.com",
    pinPlaceholder: "1234",
    termsPrefix: "Acepto los",
    termsLink: "términos de la Porra del Mundial",
    termsModalTitle: "Términos de la Porra del Mundial",
    termsModalBody: [
      "La Porra del Mundial es una experiencia recreativa para ranking y diversión entre amigos.",
      "No implica apuestas, premios financieros, intermediación de pagos ni promesa de ganancias.",
      "El organizador es responsable de invitar a sus amigos y administrar el grupo.",
      "prevIA solo proporciona la herramienta de creación, participación, ranking y seguimiento de la porra.",
    ],
    termsModalClose: "Entendido",
    marketing: "Quiero recibir novedades de prevIA y de la Porra del Mundial.",
    submit: "Crear porra",
    sending: "Creando...",
    successTitle: "¡Porra creada!",
    successBody: "Tu porra está lista. Ya entraste automáticamente como participante.",
    creatorParticipantTitle: "Ya estás participando",
    creatorParticipantBody: "Tu nombre ya fue agregado a la lista de participantes.",
    inviteTitle: "Enlace para invitar amigos",
    inviteBody: "Envía este enlace a quienes van a participar en la porra.",
    adminHintTitle: "Panel del organizador",
    adminHintBody: "Usa tu email y PIN para volver al panel cuando lo necesites.",
    copyLink: "Copiar invitación",
    copied: "Invitación copiada",
    openLink: "Ver invitación",
    shareWhatsApp: "Compartir por WhatsApp",
    whatsAppText:
      "Creé la porra {poolName} para el Mundial 2026. Entra por el enlace y deja tus pronósticos: {inviteUrl}",
    openAdmin: "Ir al panel",
    openAdminLoading: "Entrando...",
    linkNote: "Guarda el PIN que acabas de crear. No se mostrará nuevamente.",
    error: "No fue posible crear la porra ahora. Revisa los datos e inténtalo nuevamente.",
    pinHelp: "Usa solo números. Este PIN te permitirá volver al panel del organizador.",
    scoringModeTitle: "Puntuación de la porra",
    scoringModeBody: "Elige cómo se puntuarán los pronósticos. La Clásica es el estándar y todos los partidos valen igual.",
    scoringClassicTitle: "Clásica",
    scoringClassicBody: "Todos los partidos usan la misma puntuación. Más simple para grupos casuales.",
    scoringWeightedTitle: "Emoción hasta la final",
    scoringWeightedBody: "Los partidos de las fases finales valen más puntos para mantener la disputa viva.",
    scoringDefaultBadge: "Estándar",
    scoringDetailsLink: "Ver diferencias",
    scoringDetailsTitle: "Diferencias de puntuación",
    scoringDetailsBody: "Compara los modos antes de crear la porra. La regla elegida se usará en el ranking de esta porra.",
    scoringTablePhase: "Fase",
    scoringTableExact: "Marcador exacto",
    scoringTableOutcome: "Resultado correcto",
    scoringTableTeamGoal: "Gol exacto de un equipo",
    scoringTableMax: "Máximo",
  },
} as const;

export function WorldCupPoolCreateForm({ lang, canCreate, scoringModes }: Props) {
  const copy = COPY[lang] ?? COPY.pt;

  const [poolName, setPoolName] = React.useState("");
  const [organizerName, setOrganizerName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [scoringMode, setScoringMode] = React.useState<WorldCupPoolScoringMode>("classic");
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [marketingOptIn, setMarketingOptIn] = React.useState(false);
  const [termsModalOpen, setTermsModalOpen] = React.useState(false);
  const [scoringModalOpen, setScoringModalOpen] = React.useState(false);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [created, setCreated] = React.useState<WorldCupPoolCreateResponse | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [adminOpening, setAdminOpening] = React.useState(false);

  const pinIsValid = /^\d{4}$/.test(pin);

  const visibleScoringModes = React.useMemo(() => {
    const order: WorldCupPoolScoringMode[] = ["classic", "weighted_by_stage"];

    return [...scoringModes]
      .filter((item) => order.includes(item.mode))
      .sort((a, b) => order.indexOf(a.mode) - order.indexOf(b.mode));
  }, [scoringModes]);

  const disabled =
    !canCreate ||
    busy ||
    !poolName.trim() ||
    !organizerName.trim() ||
    !email.trim() ||
    !pinIsValid ||
    !termsAccepted;

  function onPinChange(value: string) {
    setPin(value.replace(/\D/g, "").slice(0, 4));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (disabled) return;

    setBusy(true);
    setError("");
    setCreated(null);
    setCopied(false);
    setAdminOpening(false);

    try {
      const response = await createWorldCupPool({
        name: poolName.trim(),
        organizer_name: organizerName.trim(),
        organizer_email: email.trim(),
        organizer_pin: pin,
        lang,
        scoring_mode: scoringMode,
        terms_accepted: termsAccepted,
        marketing_opt_in: marketingOptIn,
      });

      setCreated(response);
    } catch (err) {
      console.error("failed to create world cup pool", err);
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  async function openOrganizerPanelAfterCreate() {
    if (!created?.pool.slug || !created.pool.admin_url || adminOpening) return;

    setAdminOpening(true);

    try {
      await loginWorldCupPoolOrganizer(created.pool.slug, {
        email: email.trim(),
        pin,
      });
    } catch {
      // O endpoint de criação já tentou criar a sessão do organizador.
      // Se este refresh silencioso falhar, a página do painel ainda mostra o login normal.
    } finally {
      window.location.assign(created.pool.admin_url);
    }
  }

  async function copyInviteLink() {
    if (!created?.pool.invite_url) return;

    try {
      await navigator.clipboard.writeText(created.pool.invite_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (created) {
    const creatorName = created.creator_participant?.display_name || organizerName.trim();
    const creatorEmail = created.creator_participant?.email || email.trim();
    const whatsappText = copy.whatsAppText
      .replace("{poolName}", created.pool.name)
      .replace("{inviteUrl}", created.pool.invite_url);

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

    return (
      <div className="worldcup-pool-create-result worldcup-pool-create-success">
        <div className="worldcup-pool-success-hero">
          <div className="worldcup-pool-success-icon" aria-hidden="true">
            ✓
          </div>

          <div>
            <div className="public-eyebrow">{copy.successTitle}</div>
            <h2>{created.pool.name}</h2>
            <p>{copy.successBody}</p>
          </div>
        </div>

        <div className="worldcup-pool-success-grid">
          <div className="worldcup-pool-success-card">
            <span>{copy.creatorParticipantTitle}</span>
            <strong>{creatorName}</strong>
            {creatorEmail ? <small>{creatorEmail}</small> : null}
            <p>{copy.creatorParticipantBody}</p>
          </div>

          <div className="worldcup-pool-success-card">
            <span>{copy.adminHintTitle}</span>
            <strong>{copy.openAdmin}</strong>
            <p>{copy.adminHintBody}</p>
          </div>
        </div>

        <div className="worldcup-pool-success-invite">
          <div className="worldcup-pool-success-invite-head">
            <div>
              <strong>{copy.inviteTitle}</strong>
              <p>{copy.inviteBody}</p>
            </div>
          </div>

          <div className="worldcup-pool-created-link">
            <span>{created.pool.invite_url}</span>
          </div>
        </div>

        <div className="worldcup-pool-created-actions worldcup-pool-created-actions-four">
          <button
            type="button"
            className="public-btn public-btn-primary"
            onClick={openOrganizerPanelAfterCreate}
            disabled={adminOpening}
          >
            {adminOpening ? copy.openAdminLoading : copy.openAdmin}
          </button>

          <a
            className="public-btn public-btn-secondary"
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
          >
            {copy.shareWhatsApp}
          </a>

          <button type="button" className="public-btn public-btn-secondary" onClick={copyInviteLink}>
            {copied ? copy.copied : copy.copyLink}
          </button>

          <a className="public-btn public-btn-secondary" href={created.pool.invite_url}>
            {copy.openLink}
          </a>
        </div>

        <p className="worldcup-pool-success-note">{copy.linkNote}</p>
      </div>
    );
  }

  return (
    <form className="worldcup-pool-form worldcup-pool-create-form" onSubmit={onSubmit}>
      <div>
        <h3 className="worldcup-pool-form-title">{copy.title}</h3>
        <p className="worldcup-pool-form-body">
          {canCreate ? copy.body : copy.disabled}
        </p>
      </div>

      <label className="product-field">
        <span>{copy.poolName}</span>
        <input
          value={poolName}
          onChange={(event) => setPoolName(event.target.value)}
          placeholder={copy.poolNamePlaceholder}
          autoComplete="off"
          disabled={!canCreate || busy}
        />
      </label>

      <label className="product-field">
        <span>{copy.organizerName}</span>
        <input
          value={organizerName}
          onChange={(event) => setOrganizerName(event.target.value)}
          placeholder={copy.organizerNamePlaceholder}
          autoComplete="name"
          disabled={!canCreate || busy}
        />
      </label>

      <label className="product-field">
        <span>{copy.email}</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={copy.emailPlaceholder}
          autoComplete="email"
          disabled={!canCreate || busy}
        />
      </label>

      <label className="product-field">
        <span>{copy.pin}</span>
        <input
          type="text"
          inputMode="numeric"
          value={pin}
          onChange={(event) => onPinChange(event.target.value)}
          placeholder={copy.pinPlaceholder}
          autoComplete="one-time-code"
          disabled={!canCreate || busy}
        />
      </label>

      <p className="worldcup-pool-pin-help">{copy.pinHelp}</p>

      <section className="worldcup-pool-scoring-choice" aria-labelledby="worldcup-pool-scoring-choice-title">
        <div className="worldcup-pool-scoring-choice-head">
          <div>
            <h4 id="worldcup-pool-scoring-choice-title">{copy.scoringModeTitle}</h4>
            <p>{copy.scoringModeBody}</p>
          </div>

          {visibleScoringModes.length > 0 ? (
            <button
              type="button"
              className="worldcup-pool-scoring-details-button"
              onClick={() => setScoringModalOpen(true)}
              disabled={!canCreate || busy}
            >
              {copy.scoringDetailsLink}
            </button>
          ) : null}
        </div>

        <div className="worldcup-pool-scoring-choice-options" role="radiogroup" aria-label={copy.scoringModeTitle}>
          <button
            type="button"
            className={`worldcup-pool-scoring-choice-option${
              scoringMode === "classic" ? " is-selected" : ""
            }`}
            role="radio"
            aria-checked={scoringMode === "classic"}
            onClick={() => setScoringMode("classic")}
            disabled={!canCreate || busy}
          >
            <span>
              <strong>{copy.scoringClassicTitle}</strong>
              <em>{copy.scoringDefaultBadge}</em>
            </span>
            <small>{copy.scoringClassicBody}</small>
          </button>

          <button
            type="button"
            className={`worldcup-pool-scoring-choice-option${
              scoringMode === "weighted_by_stage" ? " is-selected" : ""
            }`}
            role="radio"
            aria-checked={scoringMode === "weighted_by_stage"}
            onClick={() => setScoringMode("weighted_by_stage")}
            disabled={!canCreate || busy}
          >
            <span>
              <strong>{copy.scoringWeightedTitle}</strong>
            </span>
            <small>{copy.scoringWeightedBody}</small>
          </button>
        </div>
      </section>

      <div className="worldcup-pool-consents">
        <div className="worldcup-pool-consent-row">
          <input
            id="worldcup-pool-terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
            disabled={!canCreate || busy}
          />

          <div className="worldcup-pool-consent-text">
            <span>{copy.termsPrefix} </span>
            <button
              type="button"
              className="worldcup-pool-inline-link"
              onClick={() => setTermsModalOpen(true)}
            >
              {copy.termsLink}
            </button>
            <span>.</span>
          </div>
        </div>

        <div className="worldcup-pool-consent-row">
          <input
            id="worldcup-pool-marketing"
            type="checkbox"
            checked={marketingOptIn}
            onChange={(event) => setMarketingOptIn(event.target.checked)}
            disabled={!canCreate || busy}
          />

          <label className="worldcup-pool-consent-text" htmlFor="worldcup-pool-marketing">
            {copy.marketing}
          </label>
        </div>
      </div>

      {termsModalOpen ? (
        <div
          className="worldcup-pool-modal-backdrop"
          role="presentation"
          onClick={() => setTermsModalOpen(false)}
        >
          <div
            className="worldcup-pool-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="worldcup-pool-terms-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="worldcup-pool-modal-head">
              <h4 id="worldcup-pool-terms-title">{copy.termsModalTitle}</h4>
              <button
                type="button"
                className="worldcup-pool-modal-close"
                aria-label={copy.termsModalClose}
                onClick={() => setTermsModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="worldcup-pool-modal-body">
              {copy.termsModalBody.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>

            <button
              type="button"
              className="public-btn public-btn-primary"
              onClick={() => setTermsModalOpen(false)}
            >
              {copy.termsModalClose}
            </button>
          </div>
        </div>
      ) : null}

      {scoringModalOpen ? (
        <div
          className="worldcup-pool-modal-backdrop"
          role="presentation"
          onClick={() => setScoringModalOpen(false)}
        >
          <div
            className="worldcup-pool-modal worldcup-pool-scoring-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="worldcup-pool-scoring-details-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="worldcup-pool-modal-head">
              <h4 id="worldcup-pool-scoring-details-title">{copy.scoringDetailsTitle}</h4>
              <button
                type="button"
                className="worldcup-pool-modal-close"
                aria-label={copy.termsModalClose}
                onClick={() => setScoringModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="worldcup-pool-modal-body">
              <p>{copy.scoringDetailsBody}</p>

              <div className="worldcup-pool-scoring-modal-list">
                {visibleScoringModes.map((modeConfig) => (
                  <section className="worldcup-pool-scoring-modal-card" key={modeConfig.mode}>
                    <div className="worldcup-pool-scoring-modal-card-head">
                      <strong>{modeConfig.title[lang] ?? modeConfig.title.pt}</strong>
                      <p>{modeConfig.summary[lang] ?? modeConfig.summary.pt}</p>
                    </div>

                    <div className="worldcup-pool-scoring-table-wrap">
                      <table className="worldcup-pool-scoring-table">
                        <thead>
                          <tr>
                            <th>{copy.scoringTablePhase}</th>
                            <th>{copy.scoringTableExact}</th>
                            <th>{copy.scoringTableOutcome}</th>
                            <th>{copy.scoringTableTeamGoal}</th>
                            <th>{copy.scoringTableMax}</th>
                          </tr>
                        </thead>

                        <tbody>
                          {modeConfig.phases.map((phaseConfig) => (
                            <tr key={`${modeConfig.mode}-${phaseConfig.phase_key}`}>
                              <td>{phaseConfig.phase_label[lang] ?? phaseConfig.phase_label.pt}</td>
                              <td>{phaseConfig.exact_score_points}</td>
                              <td>{phaseConfig.outcome_points}</td>
                              <td>{phaseConfig.exact_team_score_bonus}</td>
                              <td>{phaseConfig.max_points_per_match}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="public-btn public-btn-primary"
              onClick={() => setScoringModalOpen(false)}
            >
              {copy.termsModalClose}
            </button>
          </div>
        </div>
      ) : null}

      <button type="submit" className="public-btn public-btn-primary" disabled={disabled}>
        {busy ? copy.sending : copy.submit}
      </button>

      {error ? <div className="beta-form-error">{error}</div> : null}
    </form>
  );
}