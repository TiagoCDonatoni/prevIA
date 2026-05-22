import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { Lang } from "../i18n";
import { coercePublicLang } from "../public/lib/publicLang";
import { usePublicSeo } from "../public/lib/publicSeo";
import {
  fetchPartnerConsoleMe,
  PartnerConsoleError,
  type PartnerConsoleAttribution,
  type PartnerConsoleCampaign,
  type PartnerConsoleResponse,
} from "./partnerApi";
import "./partner-console.css";

const COPY = {
  pt: {
    seoTitle: "Painel do Parceiro | prevIA",
    seoDescription: "Acompanhe campanhas oficiais, usuários atribuídos e condições comerciais do seu contrato prevIA.",
    eyebrow: "Painel do parceiro",
    title: "Acompanhe suas campanhas oficiais no prevIA.",
    body:
      "Veja os usuários atribuídos às suas campanhas e as condições comerciais do contrato ativo. Comissões financeiras serão exibidas somente após pagamento confirmado e validação.",
    loading: "Carregando painel do parceiro...",
    loginTitle: "Entre para acessar seu painel",
    loginBody: "Use o mesmo email vinculado ao parceiro aprovado no prevIA.",
    loginCta: "Entrar",
    deniedTitle: "Painel não disponível para este usuário",
    deniedBody:
      "Não encontramos um parceiro ativo vinculado a esta conta. Se você já foi aprovado, confirme se está usando o mesmo email definido como responsável do parceiro.",
    backHome: "Voltar para a página inicial",
    retry: "Tentar novamente",
    partnerStatus: "Status",
    tier: "Categoria",
    contract: "Contrato",
    activeContract: "Contrato ativo",
    noContract: "Sem contrato ativo",
    commission: "Comissão",
    months: "Meses",
    validation: "Validação",
    payout: "Pagamento",
    onlyNewUsers: "Somente novos usuários",
    paidInvoice: "Exige fatura paga",
    refundExclusion: "Exclui reembolso",
    disputeExclusion: "Exclui disputa",
    summary: {
      total: "Usuários atribuídos",
      active: "Ativos",
      pending: "Pendentes",
      nonCommissionable: "Sem comissão",
    },
    campaignsTitle: "Campanhas oficiais",
    attributionsTitle: "Usuários atribuídos",
    emptyCampaigns: "Nenhuma campanha oficial vinculada ainda.",
    emptyAttributions: "Nenhum usuário atribuído ainda.",
    campaign: "Campanha",
    publicLink: "Link público",
    status: "Status",
    attributed: "Atribuídos",
    period: "Período",
    user: "Usuário",
    rule: "Regra",
    date: "Data",
    financialNoticeTitle: "Aviso sobre comissões",
    financialNotice:
      "Este painel é informativo. Valores financeiros futuros dependerão de pagamentos confirmados, prazos de validação, ausência de reembolso/disputa e regras do contrato ativo.",
    copied: "Link copiado",
    copyLink: "Copiar link",
    open: "Abrir",
    labels: {
      active: "Ativo",
      paused: "Pausado",
      pending: "Pendente",
      ended: "Encerrado",
      non_commissionable: "Sem comissão",
      cancelled: "Cancelado",
      superseded: "Substituído",
      new_user_campaign_redeem: "Novo usuário",
      existing_user_campaign_redeem: "Usuário já existente",
      unknown_user_age_campaign_redeem: "Idade desconhecida",
      monthly: "Mensal",
      quarterly: "Trimestral",
      manual: "Manual",
      manual_pix: "PIX manual",
      manual_bank_transfer: "Transferência manual",
      manual_other: "Outro manual",
      platform_later: "Automação futura",
      yes: "Sim",
      no: "Não",
    },
  },
  en: {
    seoTitle: "Partner Dashboard | prevIA",
    seoDescription: "Track official campaigns, attributed users, and commercial terms for your prevIA partner contract.",
    eyebrow: "Partner dashboard",
    title: "Track your official prevIA campaigns.",
    body:
      "See users attributed to your campaigns and the commercial terms of your active contract. Financial commissions will only be shown after confirmed payment and validation.",
    loading: "Loading partner dashboard...",
    loginTitle: "Sign in to access your dashboard",
    loginBody: "Use the same email linked to your approved prevIA partner account.",
    loginCta: "Sign in",
    deniedTitle: "Dashboard unavailable for this user",
    deniedBody:
      "We could not find an active partner linked to this account. If you have already been approved, make sure you are using the same email assigned as the partner owner.",
    backHome: "Back to home",
    retry: "Try again",
    partnerStatus: "Status",
    tier: "Tier",
    contract: "Contract",
    activeContract: "Active contract",
    noContract: "No active contract",
    commission: "Commission",
    months: "Months",
    validation: "Validation",
    payout: "Payout",
    onlyNewUsers: "New users only",
    paidInvoice: "Requires paid invoice",
    refundExclusion: "Excludes refunds",
    disputeExclusion: "Excludes disputes",
    summary: {
      total: "Attributed users",
      active: "Active",
      pending: "Pending",
      nonCommissionable: "Non-commissionable",
    },
    campaignsTitle: "Official campaigns",
    attributionsTitle: "Attributed users",
    emptyCampaigns: "No official campaign has been linked yet.",
    emptyAttributions: "No users have been attributed yet.",
    campaign: "Campaign",
    publicLink: "Public link",
    status: "Status",
    attributed: "Attributed",
    period: "Period",
    user: "User",
    rule: "Rule",
    date: "Date",
    financialNoticeTitle: "Commission notice",
    financialNotice:
      "This dashboard is informational. Future financial values depend on confirmed payments, validation windows, no refunds/disputes, and the rules of the active contract.",
    copied: "Link copied",
    copyLink: "Copy link",
    open: "Open",
    labels: {
      active: "Active",
      paused: "Paused",
      pending: "Pending",
      ended: "Ended",
      non_commissionable: "Non-commissionable",
      cancelled: "Cancelled",
      superseded: "Superseded",
      new_user_campaign_redeem: "New user",
      existing_user_campaign_redeem: "Existing user",
      unknown_user_age_campaign_redeem: "Unknown user age",
      monthly: "Monthly",
      quarterly: "Quarterly",
      manual: "Manual",
      manual_pix: "Manual PIX",
      manual_bank_transfer: "Manual bank transfer",
      manual_other: "Other manual",
      platform_later: "Future automation",
      yes: "Yes",
      no: "No",
    },
  },
  es: {
    seoTitle: "Panel del Socio | prevIA",
    seoDescription: "Acompaña campañas oficiales, usuarios atribuidos y condiciones comerciales de tu contrato prevIA.",
    eyebrow: "Panel del socio",
    title: "Acompaña tus campañas oficiales en prevIA.",
    body:
      "Consulta los usuarios atribuidos a tus campañas y las condiciones comerciales del contrato activo. Las comisiones financieras se mostrarán solo después de pago confirmado y validación.",
    loading: "Cargando panel del socio...",
    loginTitle: "Inicia sesión para acceder a tu panel",
    loginBody: "Usa el mismo email vinculado al socio aprobado en prevIA.",
    loginCta: "Iniciar sesión",
    deniedTitle: "Panel no disponible para este usuario",
    deniedBody:
      "No encontramos un socio activo vinculado a esta cuenta. Si ya fuiste aprobado, confirma que estás usando el mismo email definido como responsable del socio.",
    backHome: "Volver al inicio",
    retry: "Intentar de nuevo",
    partnerStatus: "Estado",
    tier: "Categoría",
    contract: "Contrato",
    activeContract: "Contrato activo",
    noContract: "Sin contrato activo",
    commission: "Comisión",
    months: "Meses",
    validation: "Validación",
    payout: "Pago",
    onlyNewUsers: "Solo nuevos usuarios",
    paidInvoice: "Exige factura pagada",
    refundExclusion: "Excluye reembolso",
    disputeExclusion: "Excluye disputa",
    summary: {
      total: "Usuarios atribuidos",
      active: "Activos",
      pending: "Pendientes",
      nonCommissionable: "Sin comisión",
    },
    campaignsTitle: "Campañas oficiales",
    attributionsTitle: "Usuarios atribuidos",
    emptyCampaigns: "Todavía no hay campañas oficiales vinculadas.",
    emptyAttributions: "Todavía no hay usuarios atribuidos.",
    campaign: "Campaña",
    publicLink: "Link público",
    status: "Estado",
    attributed: "Atribuidos",
    period: "Período",
    user: "Usuario",
    rule: "Regla",
    date: "Fecha",
    financialNoticeTitle: "Aviso sobre comisiones",
    financialNotice:
      "Este panel es informativo. Los valores financieros futuros dependen de pagos confirmados, plazos de validación, ausencia de reembolsos/disputas y reglas del contrato activo.",
    copied: "Link copiado",
    copyLink: "Copiar link",
    open: "Abrir",
    labels: {
      active: "Activo",
      paused: "Pausado",
      pending: "Pendiente",
      ended: "Finalizado",
      non_commissionable: "Sin comisión",
      cancelled: "Cancelado",
      superseded: "Sustituido",
      new_user_campaign_redeem: "Nuevo usuario",
      existing_user_campaign_redeem: "Usuario existente",
      unknown_user_age_campaign_redeem: "Antigüedad desconocida",
      monthly: "Mensual",
      quarterly: "Trimestral",
      manual: "Manual",
      manual_pix: "PIX manual",
      manual_bank_transfer: "Transferencia manual",
      manual_other: "Otro manual",
      platform_later: "Automatización futura",
      yes: "Sí",
      no: "No",
    },
  },
} as const;

type PageState =
  | { status: "loading" }
  | { status: "ready"; data: PartnerConsoleResponse }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "error"; message: string };

function label(copy: (typeof COPY)[Lang], value: string | null | undefined) {
  if (!value) return "—";
  return copy.labels[value as keyof typeof copy.labels] || value;
}

function boolLabel(copy: (typeof COPY)[Lang], value: boolean | null | undefined) {
  return value ? copy.labels.yes : copy.labels.no;
}

function formatDate(value: string | null | undefined, lang: Lang) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const locale = lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(date);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatMoney(value: number | null | undefined, currency: string | null | undefined, lang: Lang) {
  if (value == null || !Number.isFinite(value)) return "—";

  const locale = lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "BRL",
  }).format(value);
}

function campaignPublicUrl(campaign: PartnerConsoleCampaign, lang: Lang) {
  return campaign.public_urls?.[lang] || campaign.public_urls?.pt || `/pt/beta/${campaign.campaign_slug}`;
}

function partnerConsolePath(lang: Lang) {
  if (lang === "en") return "/en/partners/dashboard";
  if (lang === "es") return "/es/socios/panel";
  return "/pt/parceiros/painel";
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="partner-console-kpi">
      <div className="partner-console-kpi-value">{value}</div>
      <div className="partner-console-kpi-label">{label}</div>
    </div>
  );
}

function CampaignCard({
  campaign,
  lang,
  copiedLinkId,
  onCopy,
}: {
  campaign: PartnerConsoleCampaign;
  lang: Lang;
  copiedLinkId: number | null;
  onCopy: (campaign: PartnerConsoleCampaign) => void;
}) {
  const copy = COPY[lang];
  const url = campaignPublicUrl(campaign, lang);

  return (
    <article className="partner-console-campaign-card">
      <div>
        <div className="partner-console-card-kicker">
          #{campaign.campaign_id} · {label(copy, campaign.status)}
        </div>
        <h3>{campaign.campaign_label || campaign.label || campaign.campaign_slug}</h3>
        <p>
          {copy.period}: {formatDate(campaign.starts_at_utc, lang)} →{" "}
          {formatDate(campaign.ends_at_utc, lang)}
        </p>
      </div>

      <div className="partner-console-campaign-stats">
        <span>{copy.attributed}: {campaign.attributions_total}</span>
        <span>{copy.summary.active}: {campaign.attributions_active}</span>
        <span>{copy.summary.nonCommissionable}: {campaign.attributions_non_commissionable}</span>
      </div>

      <div className="partner-console-link-row">
        <code>{url}</code>
        <a className="partner-console-small-btn" href={url} target="_blank" rel="noreferrer">
          {copy.open}
        </a>
        <button
          type="button"
          className="partner-console-small-btn"
          onClick={() => onCopy(campaign)}
        >
          {copiedLinkId === campaign.link_id ? copy.copied : copy.copyLink}
        </button>
      </div>
    </article>
  );
}

function AttributionRow({
  attribution,
  lang,
}: {
  attribution: PartnerConsoleAttribution;
  lang: Lang;
}) {
  const copy = COPY[lang];

  return (
    <tr>
      <td>
        <strong>
          {attribution.user_display_name ||
            attribution.user_email_masked ||
            `#${attribution.user_id}`}
        </strong>
        <div className="partner-console-muted">
          #{attribution.user_id}
          {attribution.user_email_masked ? ` · ${attribution.user_email_masked}` : ""}
        </div>
      </td>
      <td>
        <strong>{attribution.campaign_label || attribution.campaign_slug || `#${attribution.campaign_id}`}</strong>
        <div className="partner-console-muted">#{attribution.campaign_id}</div>
      </td>
      <td>{label(copy, attribution.attribution_rule)}</td>
      <td>
        <span className="partner-console-status-pill">
          {label(copy, attribution.status)}
        </span>
      </td>
      <td>{formatDate(attribution.attributed_at, lang)}</td>
    </tr>
  );
}

export function PartnerConsolePage() {
  const { lang: rawLang } = useParams<{ lang: string }>();
  const navigate = useNavigate();
  const lang = coercePublicLang(rawLang);
  const copy = COPY[lang];

  const [state, setState] = React.useState<PageState>({ status: "loading" });
  const [copiedLinkId, setCopiedLinkId] = React.useState<number | null>(null);

  usePublicSeo({
    title: copy.seoTitle,
    description: copy.seoDescription,
    lang,
    path: partnerConsolePath(lang),
  });

  const load = React.useCallback(async () => {
    setState({ status: "loading" });

    try {
      const data = await fetchPartnerConsoleMe();
      setState({ status: "ready", data });
    } catch (error) {
      if (error instanceof PartnerConsoleError) {
        if (error.status === 401) {
          setState({ status: "unauthenticated" });
          return;
        }

        if (error.status === 403 && error.code === "PARTNER_STAFF_USE_BACKOFFICE") {
          navigate("/admin/backoffice/partners/applications", { replace: true });
          return;
        }

        if (error.status === 403) {
          navigate("/app", { replace: true });
          return;
        }
      }

      const message = error instanceof Error ? error.message : "Partner console failed";
      setState({ status: "error", message });
    }
  }, [navigate]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function copyCampaignLink(campaign: PartnerConsoleCampaign) {
    const path = campaignPublicUrl(campaign, lang);
    const url = `${window.location.origin}${path}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkId(campaign.link_id);
      window.setTimeout(() => setCopiedLinkId(null), 1600);
    } catch {
      setCopiedLinkId(null);
    }
  }

  const loginUrl = `/${lang}?auth=login&next=${encodeURIComponent(
    partnerConsolePath(lang)
  )}`;

  if (state.status === "loading") {
    return (
      <section className="partner-console-page">
        <div className="partner-console-panel">
          <strong>{copy.loading}</strong>
        </div>
      </section>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <section className="partner-console-page">
        <div className="partner-console-empty">
          <span>{copy.eyebrow}</span>
          <h1>{copy.loginTitle}</h1>
          <p>{copy.loginBody}</p>
          <Link className="public-btn public-btn-primary" to={loginUrl}>
            {copy.loginCta}
          </Link>
        </div>
      </section>
    );
  }

  if (state.status === "forbidden") {
    return (
      <section className="partner-console-page">
        <div className="partner-console-empty">
          <span>{copy.eyebrow}</span>
          <h1>{copy.deniedTitle}</h1>
          <p>{copy.deniedBody}</p>
          <Link className="public-btn public-btn-secondary" to={`/${lang}`}>
            {copy.backHome}
          </Link>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="partner-console-page">
        <div className="partner-console-empty">
          <span>{copy.eyebrow}</span>
          <h1>Erro</h1>
          <p>{state.message}</p>
          <button className="public-btn public-btn-primary" onClick={() => void load()}>
            {copy.retry}
          </button>
        </div>
      </section>
    );
  }

  const { data } = state;
  const contract = data.active_contract;

  return (
    <section className="partner-console-page">
      <div className="partner-console-hero">
        <div>
          <span className="partner-console-eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
        </div>

        <div className="partner-console-partner-card">
          <span>{copy.partnerStatus}</span>
          <strong>{data.partner.display_name}</strong>
          <div className="partner-console-muted">
            {label(copy, data.partner.status)} · {copy.tier}: {data.partner.tier}
          </div>
        </div>
      </div>

      <div className="partner-console-kpi-grid">
        <KpiCard label={copy.summary.total} value={data.attribution_summary.total} />
        <KpiCard label={copy.summary.active} value={data.attribution_summary.active} />
        <KpiCard label={copy.summary.pending} value={data.attribution_summary.pending} />
        <KpiCard
          label={copy.summary.nonCommissionable}
          value={data.attribution_summary.non_commissionable}
        />
      </div>

      <div className="partner-console-grid">
        <div className="partner-console-panel">
          <div className="partner-console-panel-header">
            <span>{copy.contract}</span>
            <strong>{contract ? copy.activeContract : copy.noContract}</strong>
          </div>

          {contract ? (
            <div className="partner-console-terms-grid">
              <div>
                <span>{copy.commission}</span>
                <strong>{contract.commission_enabled ? formatPercent(contract.commission_rate) : "—"}</strong>
              </div>
              <div>
                <span>{copy.months}</span>
                <strong>{contract.commission_invoice_limit ?? "—"}</strong>
              </div>
              <div>
                <span>{copy.validation}</span>
                <strong>{contract.validation_days ?? "—"} dias</strong>
              </div>
              <div>
                <span>{copy.payout}</span>
                <strong>
                  {label(copy, contract.payout_frequency)} · {contract.payout_currency || "BRL"}
                </strong>
                <small>
                  {formatMoney(contract.payout_minimum_amount, contract.payout_currency, lang)}
                </small>
              </div>
              <div>
                <span>{copy.onlyNewUsers}</span>
                <strong>{boolLabel(copy, contract.commission_only_for_new_users)}</strong>
              </div>
              <div>
                <span>{copy.paidInvoice}</span>
                <strong>{boolLabel(copy, contract.commission_requires_paid_invoice)}</strong>
              </div>
              <div>
                <span>{copy.refundExclusion}</span>
                <strong>{boolLabel(copy, contract.commission_excludes_refunded_payments)}</strong>
              </div>
              <div>
                <span>{copy.disputeExclusion}</span>
                <strong>{boolLabel(copy, contract.commission_excludes_disputed_payments)}</strong>
              </div>
            </div>
          ) : (
            <p className="partner-console-muted">{copy.noContract}</p>
          )}
        </div>

        <div className="partner-console-panel partner-console-notice">
          <strong>{copy.financialNoticeTitle}</strong>
          <p>{copy.financialNotice}</p>
        </div>
      </div>

      <div className="partner-console-panel">
        <div className="partner-console-panel-header">
          <span>{copy.campaignsTitle}</span>
          <strong>{data.campaigns.length}</strong>
        </div>

        {data.campaigns.length ? (
          <div className="partner-console-campaign-grid">
            {data.campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.link_id}
                campaign={campaign}
                lang={lang}
                copiedLinkId={copiedLinkId}
                onCopy={copyCampaignLink}
              />
            ))}
          </div>
        ) : (
          <p className="partner-console-muted">{copy.emptyCampaigns}</p>
        )}
      </div>

      <div className="partner-console-panel">
        <div className="partner-console-panel-header">
          <span>{copy.attributionsTitle}</span>
          <strong>{data.attributions.length}</strong>
        </div>

        {data.attributions.length ? (
          <div className="partner-console-table-wrap">
            <table className="partner-console-table">
              <thead>
                <tr>
                  <th>{copy.user}</th>
                  <th>{copy.campaign}</th>
                  <th>{copy.rule}</th>
                  <th>{copy.status}</th>
                  <th>{copy.date}</th>
                </tr>
              </thead>
              <tbody>
                {data.attributions.map((attribution) => (
                  <AttributionRow
                    key={attribution.attribution_id}
                    attribution={attribution}
                    lang={lang}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="partner-console-muted">{copy.emptyAttributions}</p>
        )}
      </div>
    </section>
  );
}