import React from "react";

import {
  adminActivatePartnerCampaignLink,
  adminConvertPartnerApplication,
  adminCreatePartnerCampaignLink,
  adminEndPartnerCampaignLink,
  adminGetPartner,
  adminGetPartnerApplication,
  adminListPartnerApplications,
  adminPausePartnerCampaignLink,
  adminUpdatePartnerApplication,
} from "../api/client";
import type {
  AdminPartnerApplication,
  AdminPartnerApplicationsListResponse,
  AdminPartnerCampaignLink,
  AdminPartnerDetailResponse,
  PartnerApplicationStatus,
} from "../api/contracts";

const STATUS_OPTIONS: Array<{ value: "" | PartnerApplicationStatus; label: string }> = [
  { value: "", label: "Todos" },
  { value: "new", label: "Nova" },
  { value: "under_review", label: "Em análise" },
  { value: "contacted", label: "Contatado" },
  { value: "approved", label: "Aprovado" },
  { value: "rejected", label: "Rejeitado" },
  { value: "archived", label: "Arquivado" },
  { value: "converted", label: "Convertido" },
];

const STATUS_LABELS: Record<PartnerApplicationStatus, string> = {
  new: "Nova",
  under_review: "Em análise",
  contacted: "Contatado",
  approved: "Aprovado",
  rejected: "Rejeitado",
  converted: "Convertido",
  archived: "Arquivado",
};

const AUDIENCE_LABELS: Record<string, string> = {
  up_to_5k: "Até 5 mil",
  "5k_20k": "5 mil a 20 mil",
  "20k_50k": "20 mil a 50 mil",
  "50k_100k": "50 mil a 100 mil",
  "100k_plus": "100 mil+",
};

const CONTENT_LABELS: Record<string, string> = {
  football_analysis: "Análise de futebol",
  responsible_sports_betting: "Apostas esportivas com responsabilidade",
  sports_data_stats: "Estatística/dados esportivos",
  fantasy_trading: "Fantasy/trading esportivo",
  sports_community: "Comunidade esportiva",
  other: "Outro",
};

const ASSOCIATION_TYPE_OPTIONS: Array<{
  value: AdminPartnerCampaignLink["association_type"];
  label: string;
}> = [
  { value: "primary", label: "Principal" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "newsletter", label: "Newsletter" },
  { value: "community", label: "Comunidade" },
  { value: "special", label: "Especial" },
  { value: "seasonal", label: "Sazonal" },
  { value: "event", label: "Evento" },
  { value: "manual", label: "Manual" },
];

function formatDate(raw: string | null | undefined) {
  if (!raw) return "—";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(status: string | null | undefined) {
  if (!status) return "—";
  return STATUS_LABELS[status as PartnerApplicationStatus] ?? status;
}

function attributionStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "active":
      return "Ativa";
    case "pending":
      return "Pendente";
    case "non_commissionable":
      return "Sem comissão";
    case "cancelled":
      return "Cancelada";
    case "superseded":
      return "Substituída";
    default:
      return status || "—";
  }
}

function attributionRuleLabel(rule: string | null | undefined) {
  switch (rule) {
    case "new_user_campaign_redeem":
      return "Novo usuário";
    case "existing_user_campaign_redeem":
      return "Usuário já existente";
    case "unknown_user_age_campaign_redeem":
      return "Idade desconhecida";
    default:
      return rule || "—";
  }
}

function boolLabel(value: boolean) {
  return value ? "Sim" : "Não";
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function oneYearFromToday() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return toDateInputValue(date);
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="partner-application-detail-row">
      <div className="partner-application-detail-label">{label}</div>
      <div className="partner-application-detail-value">{value || "—"}</div>
    </div>
  );
}

export default function AdminBackofficePartnerApplications() {
  const [listData, setListData] = React.useState<AdminPartnerApplicationsListResponse | null>(null);
  const [detail, setDetail] = React.useState<AdminPartnerApplication | null>(null);
  const [partnerDetail, setPartnerDetail] = React.useState<AdminPartnerDetailResponse | null>(null);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);

  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"" | PartnerApplicationStatus>("");
  const [limit] = React.useState(20);
  const [offset, setOffset] = React.useState(0);

  const [listLoading, setListLoading] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  const [reviewStatus, setReviewStatus] = React.useState<PartnerApplicationStatus>("new");
  const [adminNotes, setAdminNotes] = React.useState("");

  const [convertOwnerUserId, setConvertOwnerUserId] = React.useState("");
  const [convertDisplayName, setConvertDisplayName] = React.useState("");
  const [convertTier, setConvertTier] = React.useState<"founding" | "premium" | "standard" | "watchlist">(
    "founding"
  );
  const [convertStartsAt, setConvertStartsAt] = React.useState(toDateInputValue(new Date()));
  const [convertEndsAt, setConvertEndsAt] = React.useState(oneYearFromToday());
  const [convertCommissionEnabled, setConvertCommissionEnabled] = React.useState(true);
  const [convertCommissionRatePercent, setConvertCommissionRatePercent] = React.useState("50");
  const [convertCommissionInvoiceLimit, setConvertCommissionInvoiceLimit] = React.useState("3");
  const [convertValidationDays, setConvertValidationDays] = React.useState("35");
  const [convertPayoutMinimumAmount, setConvertPayoutMinimumAmount] = React.useState("100");
  const [convertOnlyNewUsers, setConvertOnlyNewUsers] = React.useState(true);
  const [convertRequiresPaidInvoice, setConvertRequiresPaidInvoice] = React.useState(true);
  const [convertExcludesRefundedPayments, setConvertExcludesRefundedPayments] = React.useState(true);
  const [convertExcludesDisputedPayments, setConvertExcludesDisputedPayments] = React.useState(true);
  const [convertRequiresActiveSubscription, setConvertRequiresActiveSubscription] = React.useState(false);
  const [convertPayoutFrequency, setConvertPayoutFrequency] =
    React.useState<"manual" | "monthly" | "quarterly">("monthly");
  const [convertPayoutCurrency, setConvertPayoutCurrency] = React.useState("BRL");
  const [convertPayoutMethod, setConvertPayoutMethod] =
    React.useState<"manual_pix" | "manual_bank_transfer" | "manual_other" | "platform_later">("manual_pix");
  const [convertContractFileUrl, setConvertContractFileUrl] = React.useState("");
  const [convertCommercialNotes, setConvertCommercialNotes] = React.useState("");
  const [convertBusy, setConvertBusy] = React.useState(false);
  const [partnerLoading, setPartnerLoading] = React.useState(false);
  const [campaignLinkBusy, setCampaignLinkBusy] = React.useState(false);
  const [campaignLinkCampaignId, setCampaignLinkCampaignId] = React.useState("");
  const [campaignLinkLabel, setCampaignLinkLabel] = React.useState("");
  const [campaignLinkAssociationType, setCampaignLinkAssociationType] =
    React.useState<AdminPartnerCampaignLink["association_type"]>("primary");

  async function loadList(nextOffset = offset, nextSelectedId?: number | null) {
    setListLoading(true);
    setActionError(null);

    try {
      const data = await adminListPartnerApplications({
        q: q.trim() || undefined,
        status: status || undefined,
        limit,
        offset: nextOffset,
      });
      setListData(data);
      setOffset(nextOffset);

      const desiredId = nextSelectedId ?? selectedId ?? data.items[0]?.id ?? null;
      const exists = desiredId ? data.items.some((item) => item.id === desiredId) : false;
      const resolvedId = exists ? desiredId : data.items[0]?.id ?? null;

      setSelectedId(resolvedId);

      if (resolvedId) {
        await loadDetail(resolvedId);
      } else {
        setDetail(null);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao carregar candidaturas.");
    } finally {
      setListLoading(false);
    }
  }

  async function loadDetail(applicationId: number) {
    setDetailLoading(true);
    setActionError(null);

    try {
      const data = await adminGetPartnerApplication(applicationId);
      setDetail(data.application);
      setReviewStatus(data.application.status);
      setAdminNotes(data.application.admin_notes || "");
      setConvertOwnerUserId("");
      setConvertDisplayName(data.application.public_name || "");
      setConvertTier("founding");
      setConvertStartsAt(toDateInputValue(new Date()));
      setConvertEndsAt(oneYearFromToday());
      setConvertCommissionEnabled(true);
      setConvertCommissionRatePercent("50");
      setConvertCommissionInvoiceLimit("3");
      setConvertValidationDays("35");
      setConvertPayoutMinimumAmount("100");
      setConvertOnlyNewUsers(true);
      setConvertRequiresPaidInvoice(true);
      setConvertExcludesRefundedPayments(true);
      setConvertExcludesDisputedPayments(true);
      setConvertRequiresActiveSubscription(false);
      setConvertPayoutFrequency("monthly");
      setConvertPayoutCurrency("BRL");
      setConvertPayoutMethod("manual_pix");
      setConvertContractFileUrl("");
      setConvertCommercialNotes("");
      setCampaignLinkCampaignId("");
      setCampaignLinkLabel("");
      setCampaignLinkAssociationType("primary");

      if (data.application.converted_partner_id) {
        await loadPartnerDetail(data.application.converted_partner_id);
      } else {
        setPartnerDetail(null);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao carregar candidatura.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadPartnerDetail(partnerId: number) {
    setPartnerLoading(true);

    try {
      const data = await adminGetPartner(partnerId);
      setPartnerDetail(data);
    } catch (error) {
      setPartnerDetail(null);
      setActionError(error instanceof Error ? error.message : "Falha ao carregar parceiro.");
    } finally {
      setPartnerLoading(false);
    }
  }

  React.useEffect(() => {
    void loadList(0, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    await loadList(0, null);
  }

  async function handleSelect(item: AdminPartnerApplication) {
    setSelectedId(item.id);
    await loadDetail(item.id);
  }

  async function handleSaveReview() {
    if (!detail) return;

    setActionBusy(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const data = await adminUpdatePartnerApplication(detail.id, {
        status: reviewStatus,
        admin_notes: adminNotes,
      });
      setDetail(data.application);
      setReviewStatus(data.application.status);
      setAdminNotes(data.application.admin_notes || "");
      setActionSuccess("Candidatura atualizada.");
      await loadList(offset, data.application.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao atualizar candidatura.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleConvertToPartner() {
    if (!detail) return;

    setConvertBusy(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const ownerUserId = convertOwnerUserId.trim() ? Number(convertOwnerUserId.trim()) : null;

      const commissionRatePercent = Number(convertCommissionRatePercent.replace(",", "."));
      const commissionInvoiceLimit = Number(convertCommissionInvoiceLimit);
      const validationDays = Number(convertValidationDays);
      const payoutMinimumAmount = Number(convertPayoutMinimumAmount.replace(",", "."));

      if (!Number.isFinite(commissionRatePercent) || commissionRatePercent < 0 || commissionRatePercent > 100) {
        setActionError("Percentual de comissão inválido. Use um valor entre 0 e 100.");
        return;
      }

      if (!Number.isFinite(commissionInvoiceLimit) || commissionInvoiceLimit < 0 || commissionInvoiceLimit > 36) {
        setActionError("Quantidade de meses inválida. Use um valor entre 0 e 36.");
        return;
      }

      if (!Number.isFinite(validationDays) || validationDays < 0 || validationDays > 365) {
        setActionError("Dias de validação inválido. Use um valor entre 0 e 365.");
        return;
      }

      if (!Number.isFinite(payoutMinimumAmount) || payoutMinimumAmount < 0) {
        setActionError("Valor mínimo de pagamento inválido.");
        return;
      }

      const data = await adminConvertPartnerApplication(detail.id, {
        owner_user_id: ownerUserId,
        display_name: convertDisplayName.trim() || detail.public_name,
        tier: convertTier,
        starts_at: convertStartsAt,
        ends_at: convertEndsAt,
        auto_renewal_enabled: true,
        commission_enabled: convertCommissionEnabled,
        commission_rate: commissionRatePercent / 100,
        commission_invoice_limit: commissionInvoiceLimit,
        validation_days: validationDays,
        payout_minimum_amount: payoutMinimumAmount,
        commission_only_for_new_users: convertOnlyNewUsers,
        commission_requires_paid_invoice: convertRequiresPaidInvoice,
        commission_excludes_refunded_payments: convertExcludesRefundedPayments,
        commission_excludes_disputed_payments: convertExcludesDisputedPayments,
        commission_requires_active_subscription: convertRequiresActiveSubscription,
        payout_frequency: convertPayoutFrequency,
        payout_currency: convertPayoutCurrency.trim().toUpperCase() || "BRL",
        payout_method: convertPayoutMethod,
        contract_file_url: convertContractFileUrl.trim() || null,
        commercial_notes: convertCommercialNotes.trim() || null,
        terms_version: "partner_terms_v1",
      });

      setDetail(data.application);
      setReviewStatus(data.application.status);
      setAdminNotes(data.application.admin_notes || "");
      setActionSuccess(
        `Parceiro #${data.partner.partner_id} criado para ${data.partner.owner_email}. Contrato #${data.contract.contract_id} ativo.`
      );
      await loadPartnerDetail(data.partner.partner_id);

      await loadList(offset, data.application.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao converter candidatura em parceiro.");
    } finally {
      setConvertBusy(false);
    }
  }

  async function handleCreateCampaignLink() {
    const partnerId = detail?.converted_partner_id;
    if (!partnerId) return;

    const campaignId = Number(campaignLinkCampaignId);
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      setActionError("Informe um campaign_id válido.");
      return;
    }

    setCampaignLinkBusy(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const data = await adminCreatePartnerCampaignLink(partnerId, {
        campaign_id: campaignId,
        association_type: campaignLinkAssociationType,
        label: campaignLinkLabel.trim() || null,
      });

      setPartnerDetail(data);
      setCampaignLinkCampaignId("");
      setCampaignLinkLabel("");
      setCampaignLinkAssociationType("primary");
      setActionSuccess(`Campanha #${campaignId} vinculada ao parceiro.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao vincular campanha.");
    } finally {
      setCampaignLinkBusy(false);
    }
  }

  async function handleChangeCampaignLinkStatus(
    link: AdminPartnerCampaignLink,
    action: "activate" | "pause" | "end"
  ) {
    const partnerId = detail?.converted_partner_id;
    if (!partnerId) return;

    setCampaignLinkBusy(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const data =
        action === "activate"
          ? await adminActivatePartnerCampaignLink(partnerId, link.link_id)
          : action === "pause"
          ? await adminPausePartnerCampaignLink(partnerId, link.link_id)
          : await adminEndPartnerCampaignLink(partnerId, link.link_id);

      setPartnerDetail(data);
      setActionSuccess("Status do vínculo atualizado.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao atualizar vínculo.");
    } finally {
      setCampaignLinkBusy(false);
    }
  }

  const items = listData?.items ?? [];

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="card">
        <div className="hd">
          <div>
            <h2>Backoffice · Parceiros · Candidaturas</h2>
            <div className="note">
              Avaliação manual dos candidatos ao Programa de Parceiros. A conversão em parceiro
              fica para o próximo passo.
            </div>
          </div>
          <button className="btn ghost" onClick={() => void loadList(offset, selectedId)} disabled={listLoading}>
            Atualizar
          </button>
        </div>

        <div className="bd">
          <form className="form-row" onSubmit={handleSearch}>
            <div className="field w6">
              <label>Buscar</label>
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Nome, canal, email, WhatsApp ou URL"
              />
            </div>

            <div className="field w4">
              <label>Status</label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as "" | PartnerApplicationStatus)}
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value || "all"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field w2" style={{ display: "flex", alignItems: "end" }}>
              <button className="btn primary" type="submit" disabled={listLoading} style={{ width: "100%" }}>
                Buscar
              </button>
            </div>
          </form>

          {actionError ? <div className="note" style={{ color: "#ffb4b4" }}>{actionError}</div> : null}
          {actionSuccess ? <div className="note" style={{ color: "#b7f7c1" }}>{actionSuccess}</div> : null}
        </div>
      </div>

      <div className="split partner-applications-split">
        <div className="card">
          <div className="hd">
            <h2>Candidaturas</h2>
            <span className="pill">{listLoading ? "Carregando..." : `${items.length} itens`}</span>
          </div>

          <div className="bd" style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Canal</th>
                  <th>Contato</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => void handleSelect(item)}
                    className={selectedId === item.id ? "partner-application-row-active" : undefined}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="mono">#{item.id}</td>
                    <td>
                      <strong>{item.public_name}</strong>
                      <div className="note">{item.main_social_platform}</div>
                    </td>
                    <td>
                      <div>{item.full_name}</div>
                      <div className="note">{item.email}</div>
                    </td>
                    <td>
                      <span className={`pill partner-application-status-${item.status}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td>{formatDate(item.created_at_utc)}</td>
                  </tr>
                ))}

                {!items.length ? (
                  <tr>
                    <td colSpan={5} className="note">
                      Nenhuma candidatura encontrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <div className="actions" style={{ marginTop: 12 }}>
              <button
                className="btn ghost"
                disabled={listLoading || listData?.previous_offset == null}
                onClick={() => void loadList(listData?.previous_offset ?? 0, null)}
              >
                Anterior
              </button>
              <span className="note">Offset {listData?.offset ?? offset}</span>
              <button
                className="btn ghost"
                disabled={listLoading || !listData?.has_more || listData.next_offset == null}
                onClick={() => void loadList(listData?.next_offset ?? offset + limit, null)}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd">
            <h2>Detalhe da candidatura</h2>
            {detail ? <span className="pill">#{detail.id}</span> : null}
          </div>

          <div className="bd">
            {detailLoading ? <div className="note">Carregando detalhe...</div> : null}

            {!detail && !detailLoading ? (
              <div className="note">Selecione uma candidatura para ver os dados e revisar o status.</div>
            ) : null}

            {detail ? (
              <div className="grid" style={{ gap: 12 }}>
                <div className="partner-application-detail-grid">
                  <DetailRow label="Canal" value={detail.public_name} />
                  <DetailRow label="Nome" value={detail.full_name} />
                  <DetailRow label="Email" value={detail.email} />
                  <DetailRow label="WhatsApp" value={detail.whatsapp} />
                  <DetailRow label="Lang" value={detail.lang} />
                  <DetailRow label="Rede principal" value={detail.main_social_platform} />
                  <DetailRow
                    label="URL principal"
                    value={
                      <a href={detail.main_social_url} target="_blank" rel="noreferrer">
                        {detail.main_social_url}
                      </a>
                    }
                  />
                  <DetailRow
                    label="Audiência"
                    value={AUDIENCE_LABELS[detail.audience_size_range] ?? detail.audience_size_range}
                  />
                  <DetailRow
                    label="Conteúdo"
                    value={CONTENT_LABELS[detail.content_type] ?? detail.content_type}
                  />
                  <DetailRow label="Cidade/estado" value={detail.city_state} />
                  <DetailRow
                    label="Mídia kit"
                    value={
                      detail.media_kit_url ? (
                        <a href={detail.media_kit_url} target="_blank" rel="noreferrer">
                          {detail.media_kit_url}
                        </a>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailRow label="Source" value={detail.source} />
                </div>

                <div>
                  <div className="section-title">Como pretende divulgar</div>
                  <div className="code partner-application-long-text">{detail.promotion_plan || "—"}</div>
                </div>

                <div className="split">
                  <div>
                    <div className="section-title">Outras redes</div>
                    <div className="code partner-application-long-text">{detail.other_social_urls || "—"}</div>
                  </div>
                  <div>
                    <div className="section-title">Observações do candidato</div>
                    <div className="code partner-application-long-text">{detail.notes || "—"}</div>
                  </div>
                </div>

                <div>
                  <div className="section-title">Aceites</div>
                  <div className="partner-application-acceptances">
                    <span className="pill">Ferramenta auxiliar: {boolLabel(detail.accepted_responsible_disclosure)}</span>
                    <span className="pill">Sem promessa de lucro: {boolLabel(detail.accepted_no_profit_promises)}</span>
                    <span className="pill">Sem aprovação garantida: {boolLabel(detail.accepted_not_guaranteed_approval)}</span>
                    <span className="pill">Aceita contato: {boolLabel(detail.accepted_contact)}</span>
                  </div>
                </div>

                <hr className="sep" />

                <div className="form-row">
                  <div className="field w4">
                    <label>Status</label>
                    <select
                      value={reviewStatus}
                      onChange={(event) => setReviewStatus(event.target.value as PartnerApplicationStatus)}
                    >
                      {STATUS_OPTIONS.filter((item) => item.value).map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field w8">
                    <label>Notas internas</label>
                    <textarea
                      rows={4}
                      value={adminNotes}
                      onChange={(event) => setAdminNotes(event.target.value)}
                      placeholder="Ex.: perfil interessante, validar mídia kit, agendar contato..."
                    />
                  </div>
                </div>

                <div className="note">
                  Última revisão: {formatDate(detail.reviewed_at_utc)}
                  {detail.reviewed_by_email ? ` por ${detail.reviewed_by_email}` : ""}
                </div>

                <div className="actions">
                  <button className="btn primary" onClick={() => void handleSaveReview()} disabled={actionBusy}>
                    {actionBusy ? "Salvando..." : "Salvar revisão"}
                  </button>
                </div>
                <div className="partner-application-convert-box">
                  <div className="section-title">Converter em parceiro</div>

                  {detail.status === "converted" ? (
                    <div className="note">
                      Esta candidatura já foi convertida em parceiro
                      {detail.converted_partner_id ? ` #${detail.converted_partner_id}` : ""}.
                    </div>
                  ) : (
                    <>
                      <div className="note">
                        Antes de converter, marque a candidatura como <strong>Aprovado</strong>. Se o campo
                        owner_user_id ficar vazio, o backend tentará localizar uma conta prevIA usando o email da
                        candidatura.
                      </div>

                      <div className="form-row">
                        <div className="field w4">
                          <label>Owner user ID</label>
                          <input
                            value={convertOwnerUserId}
                            onChange={(event) => setConvertOwnerUserId(event.target.value)}
                            placeholder="Opcional: vazio usa o email"
                          />
                        </div>

                        <div className="field w4">
                          <label>Nome do parceiro</label>
                          <input
                            value={convertDisplayName}
                            onChange={(event) => setConvertDisplayName(event.target.value)}
                            placeholder="Nome público do parceiro"
                          />
                        </div>

                        <div className="field w4">
                          <label>Tier</label>
                          <select
                            value={convertTier}
                            onChange={(event) =>
                              setConvertTier(event.target.value as "founding" | "premium" | "standard" | "watchlist")
                            }
                          >
                            <option value="founding">Founding</option>
                            <option value="standard">Standard</option>
                            <option value="premium">Premium</option>
                            <option value="watchlist">Watchlist</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="field w4">
                          <label>Início do contrato</label>
                          <input
                            type="date"
                            value={convertStartsAt}
                            onChange={(event) => setConvertStartsAt(event.target.value)}
                          />
                        </div>

                        <div className="field w4">
                          <label>Fim do contrato</label>
                          <input
                            type="date"
                            value={convertEndsAt}
                            onChange={(event) => setConvertEndsAt(event.target.value)}
                          />
                        </div>

                        <div className="field w4">
                          <label>Comissão ativa?</label>
                          <select
                            value={convertCommissionEnabled ? "yes" : "no"}
                            onChange={(event) => setConvertCommissionEnabled(event.target.value === "yes")}
                          >
                            <option value="yes">Sim</option>
                            <option value="no">Não</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="field w3">
                          <label>Comissão (%)</label>
                          <input
                            value={convertCommissionRatePercent}
                            onChange={(event) => setConvertCommissionRatePercent(event.target.value)}
                            placeholder="Ex.: 50"
                          />
                        </div>

                        <div className="field w3">
                          <label>Meses com comissão</label>
                          <input
                            value={convertCommissionInvoiceLimit}
                            onChange={(event) => setConvertCommissionInvoiceLimit(event.target.value)}
                            placeholder="Ex.: 3"
                          />
                        </div>

                        <div className="field w3">
                          <label>Dias de validação</label>
                          <input
                            value={convertValidationDays}
                            onChange={(event) => setConvertValidationDays(event.target.value)}
                            placeholder="Ex.: 35"
                          />
                        </div>

                        <div className="field w3">
                          <label>Pagamento mínimo</label>
                          <input
                            value={convertPayoutMinimumAmount}
                            onChange={(event) => setConvertPayoutMinimumAmount(event.target.value)}
                            placeholder="Ex.: 100"
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="field w4">
                          <label>Frequência de pagamento</label>
                          <select
                            value={convertPayoutFrequency}
                            onChange={(event) =>
                              setConvertPayoutFrequency(event.target.value as "manual" | "monthly" | "quarterly")
                            }
                          >
                            <option value="manual">Manual/sob demanda</option>
                            <option value="monthly">Mensal</option>
                            <option value="quarterly">Trimestral</option>
                          </select>
                        </div>

                        <div className="field w4">
                          <label>Moeda</label>
                          <input
                            value={convertPayoutCurrency}
                            onChange={(event) => setConvertPayoutCurrency(event.target.value.toUpperCase())}
                            placeholder="BRL"
                            maxLength={3}
                          />
                        </div>

                        <div className="field w4">
                          <label>Método de pagamento</label>
                          <select
                            value={convertPayoutMethod}
                            onChange={(event) =>
                              setConvertPayoutMethod(
                                event.target.value as
                                  | "manual_pix"
                                  | "manual_bank_transfer"
                                  | "manual_other"
                                  | "platform_later"
                              )
                            }
                          >
                            <option value="manual_pix">PIX manual</option>
                            <option value="manual_bank_transfer">Transferência manual</option>
                            <option value="manual_other">Outro manual</option>
                            <option value="platform_later">Automatizar depois</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="field w3">
                          <label>Somente novos usuários?</label>
                          <select
                            value={convertOnlyNewUsers ? "yes" : "no"}
                            onChange={(event) => setConvertOnlyNewUsers(event.target.value === "yes")}
                          >
                            <option value="yes">Sim</option>
                            <option value="no">Não</option>
                          </select>
                        </div>

                        <div className="field w3">
                          <label>Exige pagamento confirmado?</label>
                          <select
                            value={convertRequiresPaidInvoice ? "yes" : "no"}
                            onChange={(event) => setConvertRequiresPaidInvoice(event.target.value === "yes")}
                          >
                            <option value="yes">Sim</option>
                            <option value="no">Não</option>
                          </select>
                        </div>

                        <div className="field w3">
                          <label>Exclui reembolso?</label>
                          <select
                            value={convertExcludesRefundedPayments ? "yes" : "no"}
                            onChange={(event) => setConvertExcludesRefundedPayments(event.target.value === "yes")}
                          >
                            <option value="yes">Sim</option>
                            <option value="no">Não</option>
                          </select>
                        </div>

                        <div className="field w3">
                          <label>Exclui disputa/chargeback?</label>
                          <select
                            value={convertExcludesDisputedPayments ? "yes" : "no"}
                            onChange={(event) => setConvertExcludesDisputedPayments(event.target.value === "yes")}
                          >
                            <option value="yes">Sim</option>
                            <option value="no">Não</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="field w4">
                          <label>Exige assinatura ativa?</label>
                          <select
                            value={convertRequiresActiveSubscription ? "yes" : "no"}
                            onChange={(event) => setConvertRequiresActiveSubscription(event.target.value === "yes")}
                          >
                            <option value="no">Não, basta fatura paga e validada</option>
                            <option value="yes">Sim</option>
                          </select>
                        </div>

                        <div className="field w8">
                          <label>Link do contrato assinado</label>
                          <input
                            value={convertContractFileUrl}
                            onChange={(event) => setConvertContractFileUrl(event.target.value)}
                            placeholder="Opcional: Google Drive, Clicksign, ZapSign..."
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="field w12">
                          <label>Observações comerciais internas</label>
                          <textarea
                            rows={3}
                            value={convertCommercialNotes}
                            onChange={(event) => setConvertCommercialNotes(event.target.value)}
                            placeholder="Ex.: regra padrão: 50% dos 3 primeiros meses pagos; pagamento mensal manual; comissão sujeita a validação."
                          />
                        </div>
                      </div>

                      <div className="actions">
                        <button
                          className="btn primary"
                          onClick={() => void handleConvertToPartner()}
                          disabled={convertBusy || detail.status !== "approved"}
                        >
                          {convertBusy ? "Convertendo..." : "Converter em parceiro"}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {detail.status === "converted" && detail.converted_partner_id ? (
                  <div className="partner-application-campaign-links-box">
                    <div className="section-title">Campanhas oficiais do parceiro</div>

                    {partnerLoading ? <div className="note">Carregando parceiro...</div> : null}

                    {partnerDetail ? (
                      <>
                        <div className="partner-application-campaign-links-summary">
                          <span className="pill">Parceiro #{partnerDetail.partner.partner_id}</span>
                          <span className="pill">{partnerDetail.partner.display_name}</span>
                          <span className="pill">Status: {partnerDetail.partner.status}</span>
                          {partnerDetail.active_contract ? (
                            <>
                              <span className="pill">
                                Contrato #{partnerDetail.active_contract.contract_id} ·{" "}
                                {partnerDetail.active_contract.commission_rate != null
                                  ? `${Math.round(partnerDetail.active_contract.commission_rate * 100)}%`
                                  : "—"}
                              </span>

                              <span className="pill">
                                Meses: {partnerDetail.active_contract.commission_invoice_limit ?? "—"}
                              </span>

                              <span className="pill">
                                Validação: {partnerDetail.active_contract.validation_days ?? "—"} dias
                              </span>

                              <span className="pill">
                                Pagamento: {partnerDetail.active_contract.payout_frequency || "—"} ·{" "}
                                {partnerDetail.active_contract.payout_currency || "BRL"}
                              </span>

                              {partnerDetail.active_contract.contract_file_url ? (
                                <span className="pill">Contrato assinado registrado</span>
                              ) : null}
                            </>
                          ) : (
                            <span className="pill">Sem contrato ativo</span>
                          )}
                        </div>

                        <div className="note">
                          Crie o link na tela <strong>Backoffice · Campanhas</strong> usando tipo{" "}
                          <strong>partner</strong> e depois informe aqui o campaign_id para oficializar
                          o vínculo com este parceiro.
                        </div>

                        <div className="form-row">
                          <div className="field w3">
                            <label>Campaign ID</label>
                            <input
                              value={campaignLinkCampaignId}
                              onChange={(event) => setCampaignLinkCampaignId(event.target.value)}
                              placeholder="Ex.: 12"
                            />
                          </div>

                          <div className="field w3">
                            <label>Tipo</label>
                            <select
                              value={campaignLinkAssociationType}
                              onChange={(event) =>
                                setCampaignLinkAssociationType(
                                  event.target.value as AdminPartnerCampaignLink["association_type"]
                                )
                              }
                            >
                              {ASSOCIATION_TYPE_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="field w4">
                            <label>Rótulo interno</label>
                            <input
                              value={campaignLinkLabel}
                              onChange={(event) => setCampaignLinkLabel(event.target.value)}
                              placeholder="Ex.: YouTube principal"
                            />
                          </div>

                          <div className="field w2" style={{ display: "flex", alignItems: "end" }}>
                            <button
                              className="btn primary"
                              onClick={() => void handleCreateCampaignLink()}
                              disabled={
                                campaignLinkBusy ||
                                partnerDetail.partner.status !== "active" ||
                                partnerDetail.active_contract?.status !== "active"
                              }
                              style={{ width: "100%" }}
                            >
                              Vincular
                            </button>
                          </div>
                        </div>

                        <table className="table">
                          <thead>
                            <tr>
                              <th>Campanha</th>
                              <th>Tipo</th>
                              <th>Status</th>
                              <th>Uso</th>
                              <th>Link</th>
                              <th>Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {partnerDetail.campaign_links.map((link) => (
                              <tr key={link.link_id}>
                                <td>
                                  <strong>{link.campaign_label || `Campanha #${link.campaign_id}`}</strong>
                                  <div className="note">
                                    #{link.campaign_id} · {link.campaign_slug}
                                  </div>
                                  {link.label ? <div className="note">{link.label}</div> : null}
                                </td>
                                <td>{link.association_type}</td>
                                <td>
                                  <span className="pill">{link.status}</span>
                                </td>
                                <td>
                                  {link.campaign_redeemed_count ?? 0}
                                  {link.campaign_max_redemptions != null
                                    ? `/${link.campaign_max_redemptions}`
                                    : ""}
                                </td>
                                <td>
                                  <span className="mono">{link.public_url_path || "—"}</span>
                                </td>
                                <td>
                                  <div className="actions">
                                    {link.status === "active" ? (
                                      <button
                                        className="btn ghost"
                                        disabled={campaignLinkBusy}
                                        onClick={() => void handleChangeCampaignLinkStatus(link, "pause")}
                                      >
                                        Pausar
                                      </button>
                                    ) : null}

                                    {link.status === "paused" ? (
                                      <button
                                        className="btn ghost"
                                        disabled={campaignLinkBusy}
                                        onClick={() => void handleChangeCampaignLinkStatus(link, "activate")}
                                      >
                                        Reativar
                                      </button>
                                    ) : null}

                                    {link.status !== "ended" ? (
                                      <button
                                        className="btn ghost"
                                        disabled={campaignLinkBusy}
                                        onClick={() => void handleChangeCampaignLinkStatus(link, "end")}
                                      >
                                        Encerrar
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ))}

                            {!partnerDetail.campaign_links.length ? (
                              <tr>
                                <td colSpan={6} className="note">
                                  Nenhuma campanha oficial vinculada ainda.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>

                        <hr className="sep" />

                        <div className="section-title">Atribuições do parceiro</div>

                        <div className="partner-application-campaign-links-summary">
                          <span className="pill">
                            Total: {partnerDetail.attribution_summary?.total ?? 0}
                          </span>
                          <span className="pill">
                            Ativas: {partnerDetail.attribution_summary?.active ?? 0}
                          </span>
                          <span className="pill">
                            Pendentes: {partnerDetail.attribution_summary?.pending ?? 0}
                          </span>
                          <span className="pill">
                            Sem comissão: {partnerDetail.attribution_summary?.non_commissionable ?? 0}
                          </span>
                        </div>

                        <table className="table">
                          <thead>
                            <tr>
                              <th>Usuário</th>
                              <th>Campanha</th>
                              <th>Regra</th>
                              <th>Status</th>
                              <th>Data</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(partnerDetail.attributions ?? []).map((attribution) => (
                              <tr key={attribution.attribution_id}>
                                <td>
                                  <strong>
                                    {attribution.user_full_name ||
                                      attribution.user_email ||
                                      `Usuário #${attribution.user_id}`}
                                  </strong>
                                  <div className="note">
                                    #{attribution.user_id}
                                    {attribution.user_email ? ` · ${attribution.user_email}` : ""}
                                  </div>
                                </td>

                                <td>
                                  <strong>
                                    {attribution.campaign_label ||
                                      attribution.campaign_slug ||
                                      `Campanha #${attribution.campaign_id}`}
                                  </strong>
                                  <div className="note">
                                    #{attribution.campaign_id}
                                    {attribution.campaign_slug ? ` · ${attribution.campaign_slug}` : ""}
                                  </div>
                                  {attribution.source_redemption_id ? (
                                    <div className="note">
                                      Resgate #{attribution.source_redemption_id}
                                      {attribution.source_redemption_status
                                        ? ` · ${attribution.source_redemption_status}`
                                        : ""}
                                    </div>
                                  ) : null}
                                </td>

                                <td>{attributionRuleLabel(attribution.attribution_rule)}</td>

                                <td>
                                  <span className="pill">
                                    {attributionStatusLabel(attribution.status)}
                                  </span>
                                </td>

                                <td>{formatDate(attribution.attributed_at)}</td>
                              </tr>
                            ))}

                            {!(partnerDetail.attributions ?? []).length ? (
                              <tr>
                                <td colSpan={5} className="note">
                                  Nenhuma atribuição registrada ainda.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </>
                    ) : (
                      <div className="note">
                        Parceiro convertido, mas não foi possível carregar os vínculos agora.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}