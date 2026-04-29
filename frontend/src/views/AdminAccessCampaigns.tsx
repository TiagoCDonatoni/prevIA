import React from "react";

import {
  adminCreateAccessCampaign,
  adminGetAccessCampaign,
  adminListAccessCampaigns,
  adminPatchAccessCampaignStatus,
  adminUpdateAccessCampaign,
} from "../api/client";
import type {
  AdminAccessCampaign,
  AdminAccessCampaignDetailResponse,
  AdminAccessCampaignsListResponse,
  AdminAccessCampaignUpsertPayload,
} from "../api/contracts";
import { PUBLIC_SITE_ORIGIN } from "../config";

const PLAN_OPTIONS = ["BASIC", "LIGHT", "PRO"];
const KIND_OPTIONS = [
  "beta_open",
  "beta_private",
  "influencer",
  "partner",
  "founders",
  "early_access",
  "retention",
  "winback",
  "manual_campaign",
  "internal_testing",
];
const STATUS_OPTIONS = ["draft", "active", "paused", "closed", "archived"];
const GRANT_CATEGORY_OPTIONS = ["trial", "beta", "paid_upgrade_trial", "courtesy", "compensation", "partner", "internal"];
const BILLING_CYCLE_OPTIONS = ["monthly", "quarterly", "semiannual", "annual"];

type CampaignFormState = {
  slug: string;
  label: string;
  kind: string;
  status: string;

  trial_enabled: boolean;
  trial_plan_code: string;
  trial_duration_days: string;
  trial_grant_category: string;

  allow_existing_users: boolean;
  allow_previous_trial_users: boolean;
  allow_paid_upgrade_trial: boolean;
  requires_approval: boolean;

  starts_at_utc: string;
  expires_at_utc: string;
  max_redemptions: string;

  headline: string;
  subheadline: string;

  offer_enabled: boolean;
  discount_percent: string;
  discount_duration: "once" | "repeating" | "forever";
  discount_duration_months: string;
  eligible_plan_codes: string;
  eligible_billing_cycles: string;
  offer_valid_days_after_grant_end: string;
};

function makeDefaultForm(): CampaignFormState {
  return {
    slug: "",
    label: "",
    kind: "beta_open",
    status: "draft",

    trial_enabled: true,
    trial_plan_code: "PRO",
    trial_duration_days: "14",
    trial_grant_category: "beta",

    allow_existing_users: true,
    allow_previous_trial_users: false,
    allow_paid_upgrade_trial: true,
    requires_approval: false,

    starts_at_utc: "",
    expires_at_utc: "",
    max_redemptions: "50",

    headline: "",
    subheadline: "",

    offer_enabled: false,
    discount_percent: "10",
    discount_duration: "repeating",
    discount_duration_months: "3",
    eligible_plan_codes: "PRO",
    eligible_billing_cycles: "monthly,annual",
    offer_valid_days_after_grant_end: "7",
  };
}

function slugify(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toLocalDateTimeInput(raw: string | null | undefined) {
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalDateTimeInput(raw: string) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function nullableNumber(raw: string): number | null {
  const text = String(raw || "").trim();
  if (!text) return null;

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function csvToList(raw: string, upper = false) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (upper ? item.toUpperCase() : item.toLowerCase()))
    .filter((item, index, all) => all.indexOf(item) === index);
}

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

function campaignToForm(detail: AdminAccessCampaignDetailResponse): CampaignFormState {
  const campaign = detail.campaign;
  const offer = detail.offer;
  const metadata = campaign.metadata_json || {};

  return {
    slug: campaign.slug,
    label: campaign.label,
    kind: campaign.kind,
    status: campaign.status,

    trial_enabled: Boolean(campaign.trial_enabled),
    trial_plan_code: campaign.trial_plan_code || "PRO",
    trial_duration_days: String(campaign.trial_duration_days ?? 14),
    trial_grant_category: campaign.trial_grant_category || "beta",

    allow_existing_users: Boolean(campaign.allow_existing_users),
    allow_previous_trial_users: Boolean(campaign.allow_previous_trial_users),
    allow_paid_upgrade_trial: Boolean(campaign.allow_paid_upgrade_trial),
    requires_approval: Boolean(campaign.requires_approval),

    starts_at_utc: toLocalDateTimeInput(campaign.starts_at_utc),
    expires_at_utc: toLocalDateTimeInput(campaign.expires_at_utc),
    max_redemptions: campaign.max_redemptions == null ? "" : String(campaign.max_redemptions),

    headline: String(metadata.headline || ""),
    subheadline: String(metadata.subheadline || ""),

    offer_enabled: Boolean(offer && offer.status !== "closed" && offer.status !== "archived"),
    discount_percent: String(offer?.discount_percent ?? 10),
    discount_duration:
      offer?.discount_duration === "once" || offer?.discount_duration === "forever"
        ? offer.discount_duration
        : "repeating",
    discount_duration_months: String(offer?.discount_duration_months ?? 3),
    eligible_plan_codes: (offer?.eligible_plan_codes?.length ? offer.eligible_plan_codes : ["PRO"]).join(","),
    eligible_billing_cycles: (offer?.eligible_billing_cycles?.length
      ? offer.eligible_billing_cycles
      : ["monthly", "annual"]
    ).join(","),
    offer_valid_days_after_grant_end: String(offer?.offer_valid_days_after_grant_end ?? 7),
  };
}

function buildPayload(form: CampaignFormState): AdminAccessCampaignUpsertPayload {
  const metadata_json: Record<string, any> = {};

  if (form.headline.trim()) {
    metadata_json.headline = form.headline.trim();
  }

  if (form.subheadline.trim()) {
    metadata_json.subheadline = form.subheadline.trim();
  }

  return {
    slug: slugify(form.slug),
    label: form.label.trim(),
    kind: form.kind,
    status: form.status,

    trial_enabled: form.trial_enabled,
    trial_plan_code: form.trial_enabled ? form.trial_plan_code : null,
    trial_duration_days: form.trial_enabled ? nullableNumber(form.trial_duration_days) : null,
    trial_grant_category: form.trial_grant_category,

    allow_existing_users: form.allow_existing_users,
    allow_previous_trial_users: form.allow_previous_trial_users,
    allow_paid_upgrade_trial: form.allow_paid_upgrade_trial,
    requires_approval: form.requires_approval,

    starts_at_utc: fromLocalDateTimeInput(form.starts_at_utc),
    expires_at_utc: fromLocalDateTimeInput(form.expires_at_utc),
    max_redemptions: nullableNumber(form.max_redemptions),

    metadata_json,

    offer: {
      enabled: form.offer_enabled,
      status: "active",
      discount_type: "percent",
      discount_percent: form.offer_enabled ? nullableNumber(form.discount_percent) : null,
      discount_duration: form.discount_duration,
      discount_duration_months:
        form.discount_duration === "repeating"
          ? nullableNumber(form.discount_duration_months)
          : null,
      eligible_plan_codes: csvToList(form.eligible_plan_codes, true),
      eligible_billing_cycles: csvToList(form.eligible_billing_cycles, false),
      offer_valid_days_after_grant_end: nullableNumber(form.offer_valid_days_after_grant_end),
    },
  };
}

function publicCampaignUrl(slug: string) {
  return `${PUBLIC_SITE_ORIGIN}/pt/beta/${slugify(slug)}`;
}

export default function AdminAccessCampaigns() {
  const [listData, setListData] = React.useState<AdminAccessCampaignsListResponse | null>(null);
  const [detail, setDetail] = React.useState<AdminAccessCampaignDetailResponse | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<number | null>(null);
  const [form, setForm] = React.useState<CampaignFormState>(() => makeDefaultForm());

  const [listLoading, setListLoading] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  const isEditing = selectedCampaignId != null;

  async function loadList(nextSelectedId?: number | null) {
    setListLoading(true);
    setActionError(null);

    try {
      const data = await adminListAccessCampaigns(100);
      setListData(data);

      const desired = nextSelectedId ?? selectedCampaignId ?? data.campaigns[0]?.campaign_id ?? null;
      const exists = desired ? data.campaigns.some((item) => item.campaign_id === desired) : false;

      setSelectedCampaignId(exists ? desired : data.campaigns[0]?.campaign_id ?? null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao carregar campanhas.");
    } finally {
      setListLoading(false);
    }
  }

  async function loadDetail(campaignId: number) {
    setDetailLoading(true);
    setActionError(null);

    try {
      const data = await adminGetAccessCampaign(campaignId);
      setDetail(data);
      setForm(campaignToForm(data));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao carregar campanha.");
    } finally {
      setDetailLoading(false);
    }
  }

  React.useEffect(() => {
    void loadList(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (selectedCampaignId != null) {
      void loadDetail(selectedCampaignId);
    } else {
      setDetail(null);
      setForm(makeDefaultForm());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCampaignId]);

  function patchForm(next: Partial<CampaignFormState>) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  function startNewCampaign() {
    setSelectedCampaignId(null);
    setDetail(null);
    setForm(makeDefaultForm());
    setActionError(null);
    setActionSuccess(null);
  }

  async function saveCampaign() {
    const payload = buildPayload(form);

    if (!payload.slug || !payload.label) {
      setActionError("Informe nome e slug da campanha.");
      return;
    }

    setActionBusy(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const saved =
        selectedCampaignId != null
          ? await adminUpdateAccessCampaign(selectedCampaignId, payload)
          : await adminCreateAccessCampaign(payload);

      setDetail(saved);
      setForm(campaignToForm(saved));
      setSelectedCampaignId(saved.campaign.campaign_id);
      setActionSuccess("Campanha salva com sucesso.");
      await loadList(saved.campaign.campaign_id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao salvar campanha.");
    } finally {
      setActionBusy(false);
    }
  }

  async function changeStatus(status: string) {
    if (selectedCampaignId == null) return;

    setActionBusy(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const updated = await adminPatchAccessCampaignStatus(selectedCampaignId, status);
      setDetail(updated);
      setForm(campaignToForm(updated));
      setActionSuccess(`Status alterado para ${status}.`);
      await loadList(selectedCampaignId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao alterar status.");
    } finally {
      setActionBusy(false);
    }
  }

  async function copyPublicUrl() {
    const url = publicCampaignUrl(form.slug);

    try {
      await navigator.clipboard.writeText(url);
      setActionSuccess("Link copiado.");
    } catch {
      setActionSuccess(url);
    }
  }

  const campaigns = listData?.campaigns ?? [];
  const selectedCampaign = detail?.campaign ?? null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 16 }}>
      <div>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="card-title">Campanhas de Acesso</div>
              <div className="note">
                Crie links beta/trial com plano, duração, limite de vagas e oferta pós-teste.
              </div>
            </div>

            <button className="btn primary" onClick={startNewCampaign}>
              Nova campanha
            </button>
          </div>

          {actionError ? (
            <div className="note" style={{ color: "#fecaca", marginTop: 10 }}>
              {actionError}
            </div>
          ) : null}

          {actionSuccess ? (
            <div className="note" style={{ color: "#bbf7d0", marginTop: 10 }}>
              {actionSuccess}
            </div>
          ) : null}

          <div className="note" style={{ marginTop: 10 }}>
            {listLoading ? "Carregando..." : `${campaigns.length} campanha(s)`}
          </div>

          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Status</th>
                <th>Trial</th>
                <th>Uso</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr
                  key={campaign.campaign_id}
                  style={{
                    cursor: "pointer",
                    background:
                      selectedCampaignId === campaign.campaign_id
                        ? "rgba(255,255,255,0.06)"
                        : undefined,
                  }}
                  onClick={() => setSelectedCampaignId(campaign.campaign_id)}
                >
                  <td>
                    <div style={{ fontWeight: 700 }}>{campaign.label}</div>
                    <div className="mono" style={{ opacity: 0.7 }}>
                      {campaign.slug}
                    </div>
                  </td>
                  <td>
                    <span className="pill">{campaign.status}</span>
                  </td>
                  <td>
                    {campaign.trial_plan_code || "—"} · {campaign.trial_duration_days ?? "—"}d
                  </td>
                  <td>
                    {campaign.redeemed_count}
                    {campaign.max_redemptions != null ? `/${campaign.max_redemptions}` : ""}
                  </td>
                </tr>
              ))}

              {!campaigns.length ? (
                <tr>
                  <td colSpan={4} className="note">
                    Nenhuma campanha encontrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {detail ? (
          <div className="card">
            <div className="card-title">Últimos resgates</div>

            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Grant</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {detail.redemptions.map((item) => (
                  <tr key={item.redemption_id}>
                    <td>
                      <div>{item.email || item.email_normalized}</div>
                      {item.full_name ? <div className="note">{item.full_name}</div> : null}
                    </td>
                    <td>{item.status}</td>
                    <td>
                      {item.grant ? (
                        <>
                          {item.grant.plan_code} · {item.grant.grant_category}
                          <div className="note">até {formatDate(item.grant.ends_at_utc)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatDate(item.redeemed_at_utc)}</td>
                  </tr>
                ))}

                {!detail.redemptions.length ? (
                  <tr>
                    <td colSpan={4} className="note">
                      Nenhum resgate ainda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="card-title">
                {isEditing ? `Editar campanha #${selectedCampaignId}` : "Nova campanha"}
              </div>
              <div className="note">
                Condições do link ficam congeladas no grant individual quando o usuário resgata.
              </div>
            </div>

            {selectedCampaign ? (
              <button className="btn" onClick={() => void copyPublicUrl()}>
                Copiar link
              </button>
            ) : null}
          </div>

          <div className="section-title">Identidade</div>

          <div className="grid-3">
            <div>
              <label>Nome interno</label>
              <input
                className="input"
                value={form.label}
                onChange={(event) => {
                  const label = event.target.value;
                  patchForm({
                    label,
                    slug: form.slug ? form.slug : slugify(label),
                  });
                }}
                placeholder="Beta WhatsApp Maio"
              />
            </div>

            <div>
              <label>Slug</label>
              <input
                className="input mono"
                value={form.slug}
                onChange={(event) => patchForm({ slug: slugify(event.target.value) })}
                placeholder="whatsapp-maio"
              />
            </div>

            <div>
              <label>Tipo</label>
              <select
                className="select"
                value={form.kind}
                onChange={(event) => patchForm({ kind: event.target.value })}
              >
                {KIND_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-3" style={{ marginTop: 10 }}>
            <div>
              <label>Status</label>
              <select
                className="select"
                value={form.status}
                onChange={(event) => patchForm({ status: event.target.value })}
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Início do link</label>
              <input
                className="input"
                type="datetime-local"
                value={form.starts_at_utc}
                onChange={(event) => patchForm({ starts_at_utc: event.target.value })}
              />
            </div>

            <div>
              <label>Expiração do link</label>
              <input
                className="input"
                type="datetime-local"
                value={form.expires_at_utc}
                onChange={(event) => patchForm({ expires_at_utc: event.target.value })}
              />
            </div>
          </div>

          <div className="section-title">Trial / Acesso temporário</div>

          <div className="grid-3">
            <div>
              <label>Plano liberado</label>
              <select
                className="select"
                value={form.trial_plan_code}
                onChange={(event) => patchForm({ trial_plan_code: event.target.value })}
              >
                {PLAN_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Duração em dias</label>
              <input
                className="input"
                type="number"
                min={1}
                value={form.trial_duration_days}
                onChange={(event) => patchForm({ trial_duration_days: event.target.value })}
              />
            </div>

            <div>
              <label>Categoria</label>
              <select
                className="select"
                value={form.trial_grant_category}
                onChange={(event) => patchForm({ trial_grant_category: event.target.value })}
              >
                {GRANT_CATEGORY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-3" style={{ marginTop: 10 }}>
            <label className="row">
              <input
                type="checkbox"
                checked={form.allow_existing_users}
                onChange={(event) => patchForm({ allow_existing_users: event.target.checked })}
              />
              Aceita usuários antigos
            </label>

            <label className="row">
              <input
                type="checkbox"
                checked={form.allow_previous_trial_users}
                onChange={(event) => patchForm({ allow_previous_trial_users: event.target.checked })}
              />
              Aceita quem já teve trial
            </label>

            <label className="row">
              <input
                type="checkbox"
                checked={form.allow_paid_upgrade_trial}
                onChange={(event) => patchForm({ allow_paid_upgrade_trial: event.target.checked })}
              />
              Permite upgrade de pagantes
            </label>
          </div>

          <div className="grid-3" style={{ marginTop: 10 }}>
            <label className="row">
              <input
                type="checkbox"
                checked={form.requires_approval}
                onChange={(event) => patchForm({ requires_approval: event.target.checked })}
              />
              Exige aprovação manual
            </label>

            <div>
              <label>Limite de resgates</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.max_redemptions}
                onChange={(event) => patchForm({ max_redemptions: event.target.value })}
              />
            </div>
          </div>

          <div className="section-title">Texto público</div>

          <div className="grid-3">
            <div style={{ gridColumn: "span 3" }}>
              <label>Headline</label>
              <input
                className="input"
                value={form.headline}
                onChange={(event) => patchForm({ headline: event.target.value })}
                placeholder="Teste o prevIA PRO por 14 dias"
              />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label>Subheadline</label>
              <input
                className="input"
                value={form.subheadline}
                onChange={(event) => patchForm({ subheadline: event.target.value })}
                placeholder="Sem cartão. Sem cobrança automática."
              />
            </div>
          </div>

          <div className="section-title">Oferta pós-trial</div>

          <div className="grid-3">
            <label className="row">
              <input
                type="checkbox"
                checked={form.offer_enabled}
                onChange={(event) => patchForm({ offer_enabled: event.target.checked })}
              />
              Ativar oferta
            </label>

            <div>
              <label>Desconto %</label>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={form.discount_percent}
                onChange={(event) => patchForm({ discount_percent: event.target.value })}
                disabled={!form.offer_enabled}
              />
            </div>

            <div>
              <label>Duração do desconto</label>
              <select
                className="select"
                value={form.discount_duration}
                onChange={(event) =>
                  patchForm({
                    discount_duration: event.target.value as CampaignFormState["discount_duration"],
                  })
                }
                disabled={!form.offer_enabled}
              >
                <option value="once">primeira cobrança</option>
                <option value="repeating">por X meses</option>
                <option value="forever">para sempre</option>
              </select>
            </div>
          </div>

          <div className="grid-3" style={{ marginTop: 10 }}>
            <div>
              <label>Meses de desconto</label>
              <input
                className="input"
                type="number"
                min={1}
                value={form.discount_duration_months}
                onChange={(event) => patchForm({ discount_duration_months: event.target.value })}
                disabled={!form.offer_enabled || form.discount_duration !== "repeating"}
              />
            </div>

            <div>
              <label>Planos elegíveis</label>
              <input
                className="input mono"
                value={form.eligible_plan_codes}
                onChange={(event) => patchForm({ eligible_plan_codes: event.target.value })}
                disabled={!form.offer_enabled}
                placeholder="PRO"
              />
            </div>

            <div>
              <label>Ciclos elegíveis</label>
              <input
                className="input mono"
                value={form.eligible_billing_cycles}
                onChange={(event) => patchForm({ eligible_billing_cycles: event.target.value })}
                disabled={!form.offer_enabled}
                placeholder="monthly,annual"
              />
            </div>
          </div>

          <div className="grid-3" style={{ marginTop: 10 }}>
            <div>
              <label>Dias após fim do trial</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.offer_valid_days_after_grant_end}
                onChange={(event) =>
                  patchForm({ offer_valid_days_after_grant_end: event.target.value })
                }
                disabled={!form.offer_enabled}
              />
            </div>
          </div>

          <div className="section-title">Link público</div>

          <div className="code">{publicCampaignUrl(form.slug || "slug-da-campanha")}</div>

          <div className="actions" style={{ marginTop: 14 }}>
            {selectedCampaignId != null ? (
              <>
                <button className="btn" disabled={actionBusy} onClick={() => void changeStatus("active")}>
                  Ativar
                </button>
                <button className="btn" disabled={actionBusy} onClick={() => void changeStatus("paused")}>
                  Pausar
                </button>
                <button className="btn" disabled={actionBusy} onClick={() => void changeStatus("closed")}>
                  Encerrar
                </button>
              </>
            ) : null}

            <button className="btn ghost" disabled={actionBusy} onClick={startNewCampaign}>
              Limpar
            </button>

            <button className="btn primary" disabled={actionBusy || detailLoading} onClick={() => void saveCampaign()}>
              {actionBusy ? "Salvando..." : "Salvar campanha"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}