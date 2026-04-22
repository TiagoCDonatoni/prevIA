import React from "react";

import {
  adminCreateUser,
  adminGetUserDetail,
  adminGrantUserCredits,
  adminListUsers,
  adminSetUserPlan,
  adminSetUserStatus,
  adminUpsertUserRole,
} from "../api/client";
import type {
  AdminUserDetailResponse,
  AdminUsersListResponse,
} from "../api/contracts";

const PLAN_OPTIONS = ["FREE", "BASIC", "LIGHT", "PRO"];
const STATUS_OPTIONS = ["active", "pending_verification", "blocked", "deleted"];
const ROLE_OPTIONS = ["staff_viewer", "staff_ops", "staff_admin"];

export default function AdminUsers() {
  const [filters, setFilters] = React.useState({
    q: "",
    user_status: "",
    plan_code: "",
    role_key: "",
  });

  const [listData, setListData] = React.useState<AdminUsersListResponse | null>(null);
  const [listLoading, setListLoading] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState<number | null>(null);
  const [detail, setDetail] = React.useState<AdminUserDetailResponse | null>(null);

  const [statusDraft, setStatusDraft] = React.useState("active");
  const [planDraft, setPlanDraft] = React.useState("FREE");
  const [roleDraft, setRoleDraft] = React.useState("staff_viewer");
  const [roleActiveDraft, setRoleActiveDraft] = React.useState(true);
  const [creditsDraft, setCreditsDraft] = React.useState(5);
  const [notesDraft, setNotesDraft] = React.useState("");
  const [reasonDraft, setReasonDraft] = React.useState("");
  const [createEmailDraft, setCreateEmailDraft] = React.useState("");
  const [createPasswordDraft, setCreatePasswordDraft] = React.useState("");
  const [createReasonDraft, setCreateReasonDraft] = React.useState("");

  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  const reasonIsValid = reasonDraft.trim().length >= 3;
  const createReasonIsValid = createReasonDraft.trim().length >= 3;
  const createFormIsValid =
    createEmailDraft.trim().length > 3 &&
    createPasswordDraft.length >= 8 &&
    createReasonIsValid;

  async function loadUsers(nextSelectedUserId?: number | null) {
    setListLoading(true);
    setActionError(null);

    try {
      const data = await adminListUsers({
        q: filters.q || undefined,
        user_status: filters.user_status || undefined,
        plan_code: filters.plan_code || undefined,
        role_key: filters.role_key || undefined,
        limit: 20,
        offset: 0,
      });

      setListData(data);

      const desiredSelected =
        nextSelectedUserId ??
        selectedUserId ??
        data.items[0]?.user_id ??
        null;

      const exists = desiredSelected
        ? data.items.some((item) => item.user_id === desiredSelected)
        : false;

      setSelectedUserId(exists ? desiredSelected : data.items[0]?.user_id ?? null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao carregar usuários.");
    } finally {
      setListLoading(false);
    }
  }

  async function loadDetail(userId: number) {
    setDetailLoading(true);
    setActionError(null);

    try {
      const data = await adminGetUserDetail(userId);
      setDetail(data);
      setStatusDraft(data.user.status);
      setPlanDraft(data.subscription.plan_code || "FREE");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao carregar detalhe do usuário.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshSelected() {
    if (selectedUserId != null) {
      await loadDetail(selectedUserId);
    }
    await loadUsers(selectedUserId);
  }

  React.useEffect(() => {
    void loadUsers(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (selectedUserId != null) {
      void loadDetail(selectedUserId);
    } else {
      setDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  async function runAction(label: string, fn: () => Promise<void>) {
    if (!reasonIsValid) {
      setActionError("Informe um motivo com pelo menos 3 caracteres.");
      return;
    }

    setActionBusy(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await fn();
      setActionSuccess(label);
      setReasonDraft("");
      setNotesDraft("");
      await refreshSelected();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Ação falhou.");
    } finally {
      setActionBusy(false);
    }
  }

  async function runCreateUser() {
    if (!createFormIsValid) {
      setActionError("Preencha email, senha com pelo menos 8 caracteres e motivo da criação.");
      return;
    }

    setActionBusy(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const created = await adminCreateUser({
        email: createEmailDraft.trim(),
        password: createPasswordDraft,
        reason: createReasonDraft.trim(),
      });

      setActionSuccess(`Usuário ${created.user.email} criado com sucesso.`);
      setCreateEmailDraft("");
      setCreatePasswordDraft("");
      setCreateReasonDraft("");

      await loadUsers(created.user.user_id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao criar usuário.");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16 }}>
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Criar usuário</div>

          <div className="note" style={{ marginBottom: 10 }}>
            Cria uma conta manual com login por email e senha. O usuário nasce como
            <strong> active</strong> e no plano <strong>FREE</strong>.
          </div>

          <div className="grid-3" style={{ marginBottom: 10 }}>
            <input
              className="input"
              placeholder="Email"
              value={createEmailDraft}
              onChange={(e) => setCreateEmailDraft(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Senha inicial"
              value={createPasswordDraft}
              onChange={(e) => setCreatePasswordDraft(e.target.value)}
            />
            <input
              className="input"
              placeholder="Motivo administrativo"
              value={createReasonDraft}
              onChange={(e) => setCreateReasonDraft(e.target.value)}
            />
          </div>

          <div className="row">
            <button
              className="btn primary"
              disabled={actionBusy || !createFormIsValid}
              onClick={() => void runCreateUser()}
            >
              Criar usuário
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Usuários</div>

          <div className="grid-3" style={{ marginBottom: 10 }}>
            <input
              className="input"
              placeholder="Buscar por email ou nome"
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
            />
            <select
              className="select"
              value={filters.user_status}
              onChange={(e) => setFilters((prev) => ({ ...prev, user_status: e.target.value }))}
            >
              <option value="">Todos status</option>
              {STATUS_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={filters.plan_code}
              onChange={(e) => setFilters((prev) => ({ ...prev, plan_code: e.target.value }))}
            >
              <option value="">Todos planos</option>
              {PLAN_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="row" style={{ marginBottom: 10 }}>
            <select
              className="select"
              value={filters.role_key}
              onChange={(e) => setFilters((prev) => ({ ...prev, role_key: e.target.value }))}
            >
              <option value="">Todas roles</option>
              {ROLE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <button className="btn primary" onClick={() => void loadUsers(null)} disabled={listLoading}>
              {listLoading ? "Carregando..." : "Buscar"}
            </button>
          </div>

          <div className="note" style={{ marginBottom: 8 }}>
            {listData ? `${listData.count} usuário(s) encontrado(s)` : "Sem dados ainda."}
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Uso hoje</th>
                <th>Interno</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(listData?.items ?? []).map((item) => {
                const isSelected = selectedUserId === item.user_id;

                return (
                  <tr
                    key={item.user_id}
                    style={isSelected ? { background: "rgba(255,255,255,.06)" } : undefined}
                  >
                    <td>
                      <div><strong>{item.full_name || "Sem nome"}</strong></div>
                      <div className="note">{item.email}</div>
                      <div className="note mono">roles: {item.role_keys.join(", ") || "—"}</div>
                    </td>
                    <td>{item.subscription.plan_code}</td>
                    <td>{item.status}</td>
                    <td>
                      {item.usage_today.credits_used}/{item.usage_today.daily_limit}
                    </td>
                    <td>{item.is_internal ? `Sim (${item.billing_runtime})` : "Não"}</td>
                    <td>
                      <button className="btn" onClick={() => setSelectedUserId(item.user_id)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!listLoading && (listData?.items?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="note">Nenhum usuário encontrado.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-title">Detalhe do usuário</div>

          {detailLoading ? <div className="note">Carregando detalhe...</div> : null}
          {actionError ? <div className="note" style={{ color: "#ffb4b4" }}>{actionError}</div> : null}
          {actionSuccess ? <div className="note" style={{ color: "#b4ffcf" }}>{actionSuccess}</div> : null}

          {!detail && !detailLoading ? (
            <div className="note">Selecione um usuário na lista para abrir o detalhe.</div>
          ) : null}

          {detail ? (
            <>
              <div className="section-title">Perfil</div>
              <div className="card-body">
                <div><strong>{detail.user.full_name || "Sem nome"}</strong></div>
                <div className="note">{detail.user.email}</div>
                <div className="note">
                  status: {detail.user.status} • email_verified: {String(detail.user.email_verified)} • lang:{" "}
                  {detail.user.preferred_lang || "—"}
                </div>
                <div className="note">
                  created_at: {detail.user.created_at_utc || "—"} • last_login: {detail.user.last_login_at_utc || "—"}
                </div>
              </div>

              <div className="section-title">Plano e uso</div>
              <div className="card-body">
                <div className="note">
                  plano atual: <strong>{detail.subscription.plan_code}</strong> • provider:{" "}
                  {detail.subscription.provider || "—"} • status: {detail.subscription.status || "—"}
                </div>
                <div className="note">
                  uso hoje: {detail.usage_today.credits_used}/{detail.usage_today.daily_limit} • bônus disponíveis:{" "}
                  {detail.usage_today.bonus_credits_available}
                </div>
              </div>

              <div className="section-title">Acesso efetivo</div>
              <div className="card-body">
                <div className="note">
                  is_internal: {String(detail.effective_access.is_internal)} • billing_runtime:{" "}
                  {detail.effective_access.billing_runtime} • product_plan_code:{" "}
                  {detail.effective_access.product_plan_code || "—"}
                </div>
                <div className="code" style={{ marginTop: 8 }}>
                  capabilities: {detail.effective_access.capabilities.join(", ") || "—"}
                </div>
              </div>

              <div className="section-title">Roles atribuídas</div>
              <div className="card-body">
                {(detail.assigned_roles.length ?? 0) > 0 ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>role</th>
                        <th>active</th>
                        <th>source</th>
                        <th>notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.assigned_roles.map((role) => (
                        <tr key={`${role.role_key}-${role.created_at_utc}`}>
                          <td className="mono">{role.role_key}</td>
                          <td>{String(role.is_active)}</td>
                          <td>{role.grant_source}</td>
                          <td>{role.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="note">Nenhuma role atribuída manualmente.</div>
                )}
              </div>

              <div className="section-title">Motivo obrigatório</div>
              <div className="card-body">
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Descreva o motivo desta ação administrativa"
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value)}
                />
                <div className="note" style={{ marginTop: 8 }}>
                  Use este campo para status, plano, roles e créditos. Ele vai para a auditoria.
                </div>
              </div>

              <div className="section-title">Ações</div>

              <div className="grid-3">
                <div className="card">
                  <div className="card-title">Status</div>
                  <select
                    className="select"
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value)}
                  >
                    {STATUS_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn primary"
                      disabled={actionBusy || !reasonIsValid}
                      onClick={() =>
                        void runAction("Status atualizado.", async () => {
                          if (!selectedUserId) return;
                          await adminSetUserStatus(selectedUserId, {
                            status: statusDraft,
                            reason: reasonDraft.trim(),
                          });
                        })
                      }
                    >
                      Salvar status
                    </button>
                  </div>
                </div>

                <div className="card">
                  <div className="card-title">Plano manual</div>
                  <select
                    className="select"
                    value={planDraft}
                    onChange={(e) => setPlanDraft(e.target.value)}
                  >
                    {PLAN_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn primary"
                      disabled={actionBusy || !reasonIsValid}
                      onClick={() =>
                        void runAction("Plano atualizado.", async () => {
                          if (!selectedUserId) return;
                          await adminSetUserPlan(selectedUserId, {
                            plan_code: planDraft,
                            reason: reasonDraft.trim(),
                          });
                        })
                      }
                    >
                      Salvar plano
                    </button>
                  </div>
                </div>

                <div className="card">
                  <div className="card-title">Créditos bônus persistentes</div>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={creditsDraft}
                    onChange={(e) => setCreditsDraft(Number(e.target.value || 0))}
                  />
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn primary"
                      disabled={actionBusy || !reasonIsValid}
                      onClick={() =>
                        void runAction("Créditos concedidos.", async () => {
                          if (!selectedUserId) return;
                          await adminGrantUserCredits(selectedUserId, {
                            credits: creditsDraft,
                            reason: reasonDraft.trim(),
                          });
                        })
                      }
                    >
                      Conceder créditos
                    </button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-title">Acesso staff</div>

                <div className="note" style={{ marginBottom: 10 }}>
                  Emails verificados de <code>@previa.bet</code> recebem acesso interno base pelo domínio.
                  Use <code>staff_admin</code> apenas para owner/operação principal.
                </div>

                <div className="row" style={{ marginBottom: 10 }}>
                  <button
                    className="btn"
                    disabled={actionBusy || !reasonIsValid}
                    onClick={() =>
                      void runAction("Role staff_viewer aplicada.", async () => {
                        if (!selectedUserId) return;
                        await adminUpsertUserRole(selectedUserId, {
                          role_key: "staff_viewer",
                          is_active: true,
                          reason: reasonDraft.trim(),
                        });
                      })
                    }
                  >
                    Grant staff_viewer
                  </button>

                  <button
                    className="btn"
                    disabled={actionBusy || !reasonIsValid}
                    onClick={() =>
                      void runAction("Role staff_ops aplicada.", async () => {
                        if (!selectedUserId) return;
                        await adminUpsertUserRole(selectedUserId, {
                          role_key: "staff_ops",
                          is_active: true,
                          reason: reasonDraft.trim(),
                        });
                      })
                    }
                  >
                    Grant staff_ops
                  </button>

                  <button
                    className="btn primary"
                    disabled={actionBusy || !reasonIsValid}
                    onClick={() =>
                      void runAction("Role staff_admin aplicada.", async () => {
                        if (!selectedUserId) return;
                        await adminUpsertUserRole(selectedUserId, {
                          role_key: "staff_admin",
                          is_active: true,
                          reason: reasonDraft.trim(),
                        });
                      })
                    }
                  >
                    Grant staff_admin
                  </button>
                </div>

                <div className="row" style={{ marginBottom: 10 }}>
                  <select
                    className="select"
                    value={roleDraft}
                    onChange={(e) => setRoleDraft(e.target.value)}
                  >
                    {ROLE_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>

                  <select
                    className="select"
                    value={roleActiveDraft ? "active" : "inactive"}
                    onChange={(e) => setRoleActiveDraft(e.target.value === "active")}
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>

                <textarea
                  className="input"
                  rows={2}
                  placeholder="Observação opcional da role"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                />

                <div style={{ marginTop: 10 }}>
                  <button
                    className="btn primary"
                    disabled={actionBusy || !reasonIsValid}
                    onClick={() =>
                      void runAction("Role atualizada.", async () => {
                        if (!selectedUserId) return;
                        await adminUpsertUserRole(selectedUserId, {
                          role_key: roleDraft,
                          is_active: roleActiveDraft,
                          reason: reasonDraft.trim(),
                          notes: notesDraft.trim() || undefined,
                        });
                      })
                    }
                  >
                    Salvar role customizada
                  </button>
                </div>
              </div>

              <div className="section-title">Eventos de assinatura</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>quando</th>
                    <th>evento</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.recent_subscription_events.map((item, idx) => (
                    <tr key={`${item.event_type}-${idx}`}>
                      <td className="mono">{item.created_at_utc || "—"}</td>
                      <td>{item.event_type}</td>
                    </tr>
                  ))}
                  {detail.recent_subscription_events.length === 0 ? (
                    <tr>
                      <td colSpan={2}>
                        <div className="note">Sem eventos de assinatura.</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              <div className="section-title">Audit log recente</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>quando</th>
                    <th>ação</th>
                    <th>ator</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.recent_admin_audit.map((item, idx) => (
                    <tr key={`${item.action_key}-${idx}`}>
                      <td className="mono">{item.created_at_utc || "—"}</td>
                      <td>{item.action_key}</td>
                      <td>{item.actor_email || "—"}</td>
                    </tr>
                  ))}
                  {detail.recent_admin_audit.length === 0 ? (
                    <tr>
                      <td colSpan={3}>
                        <div className="note">Sem auditoria para este usuário ainda.</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}