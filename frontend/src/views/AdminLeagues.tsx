import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminOpsApproveLeagueMap,
  adminOpsAutoResolveLeagues,
  adminOpsListLeagues,
  adminOpsToggleLeague,
} from "../api/client";

type LeagueItem = {
  sport_key: string;
  official_name: string | null;
  sport_title: string | null;
  sport_group: string | null;
  league_id: number;
  season_policy: "current" | "fixed";
  fixed_season: number | null;
  regions: string | null;
  hours_ahead: number | null;
  tol_hours: number | null;
  enabled: boolean;
  mapping_status: string | null;
  computed_status: "approved" | "incomplete" | "pending" | "disabled";
  confidence: number | null;
  notes: string | null;
  updated_at_utc: string | null;
};

export default function AdminLeagues() {
  const [items, setItems] = useState<LeagueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySportKey, setBusySportKey] = useState<string | null>(null);
  const [resolveMessage, setResolveMessage] = useState<string | null>(null);

  const [draftOfficialNames, setDraftOfficialNames] = useState<Record<string, string>>({});
  const [approveMessage, setApproveMessage] = useState<string | null>(null);  

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await adminOpsListLeagues();
      const nextItems = Array.isArray(out?.items) ? out.items : [];
      setItems(nextItems);

      setDraftOfficialNames((prev) => {
        const next = { ...prev };
        for (const item of nextItems) {
          if (!(item.sport_key in next)) {
            next[item.sport_key] = String(item.official_name ?? item.sport_title ?? "").trim();
          }
        }
        return next;
      });
    } catch (err: any) {
      setError(err?.message ?? "Falha ao carregar ligas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onToggle(item: LeagueItem) {
    try {
      setBusySportKey(item.sport_key);
      await adminOpsToggleLeague({
        sport_key: item.sport_key,
        enabled: !item.enabled,
      });
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Falha ao atualizar status da liga");
    } finally {
      setBusySportKey(null);
    }
  }

  async function onAutoResolve() {
    try {
      setLoading(true);
      setError(null);
      setResolveMessage(null);

      const out = await adminOpsAutoResolveLeagues({ only_unresolved: true });

      setResolveMessage(
        `Auto-resolve concluído: ${out.resolved_count} resolvidas, ${out.failed_count} pendentes, ${out.already_resolved_count} já resolvidas.`
      );

      await load();
    } catch (err: any) {
      setError(err?.message ?? "Falha ao auto-resolver ligas");
    } finally {
      setLoading(false);
    }
  }

  async function onApprove(item: LeagueItem) {
    const officialName = String(draftOfficialNames[item.sport_key] ?? "").trim();

    if (!officialName) {
      setError("Informe o nome oficial da liga antes de aprovar.");
      return;
    }

    if (!item.league_id || item.league_id <= 0) {
      setError("league_id inválido para aprovação.");
      return;
    }

    try {
      setBusySportKey(item.sport_key);
      setError(null);
      setApproveMessage(null);

      await adminOpsApproveLeagueMap({
        sport_key: item.sport_key,
        league_id: item.league_id,
        official_name: officialName,
        regions: item.regions ?? "eu",
        hours_ahead: item.hours_ahead ?? 720,
        tol_hours: item.tol_hours ?? 6,
        season_policy: item.season_policy ?? "current",
        fixed_season: item.fixed_season ?? null,
        enabled: item.enabled,
      });

      setApproveMessage(`Liga aprovada com nome oficial: ${officialName}`);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Falha ao aprovar liga");
    } finally {
      setBusySportKey(null);
    }
  }

  const counts = useMemo(() => {
    const approved = items.filter((x) => x.computed_status === "approved").length;
    const incomplete = items.filter((x) => x.computed_status === "incomplete").length;
    const pending = items.filter((x) => x.computed_status === "pending").length;
    const disabled = items.filter((x) => x.computed_status === "disabled").length;

    return {
      total: items.length,
      approved,
      incomplete,
      pending,
      disabled,
    };
  }, [items]);

  return (
    <div className="stack">
      <div>
        <div className="section-title">Ligas</div>
        <div className="muted">
          Visualize as ligas do banco e controle quais ficam ativas no produto.
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">total</div>
          <div className="kpi-value">{counts.total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">aprovadas</div>
          <div className="kpi-value">{counts.approved}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">incompletas</div>
          <div className="kpi-value">{counts.incomplete}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">pendentes</div>
          <div className="kpi-value">{counts.pending}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">desativadas</div>
          <div className="kpi-value">{counts.disabled}</div>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="nav-btn" onClick={load} disabled={loading}>
            {loading ? "Carregando..." : "Atualizar lista"}
          </button>

          <button className="nav-btn" onClick={onAutoResolve} disabled={loading}>
            {loading ? "Processando..." : "Auto-resolver IDs"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="muted" style={{ color: "#ff9b9b" }}>
          {error}
        </div>
      ) : null}

      {resolveMessage ? (
        <div className="muted" style={{ color: "#9fd3a8" }}>
          {resolveMessage}
        </div>
      ) : null}

      {approveMessage ? (
        <div className="muted" style={{ color: "#9fd3a8" }}>
          {approveMessage}
        </div>
      ) : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Nome oficial</th>
              <th align="left">Nome bruto</th>
              <th align="left">sport_key</th>
              <th align="left">league_id</th>
              <th align="left">região</th>
              <th align="left">temporada</th>
              <th align="left">status</th>
              <th align="left">ação</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const active = !!item.enabled;

              return (
                <tr key={item.sport_key}>
                  <td style={{ padding: "10px 6px", minWidth: 240 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <input
                        className="input"
                        value={draftOfficialNames[item.sport_key] ?? ""}
                        onChange={(e) =>
                          setDraftOfficialNames((prev) => ({
                            ...prev,
                            [item.sport_key]: e.target.value,
                          }))
                        }
                        placeholder="Nome oficial da liga"
                        disabled={busySportKey === item.sport_key}
                      />
                      <div className="muted" style={{ fontSize: 12 }}>
                        {item.sport_group || "-"}
                      </div>
                    </div>
                  </td>

                  <td style={{ padding: "10px 6px" }}>
                    <span className="mono">{item.sport_title ?? "—"}</span>
                  </td>

                  <td style={{ padding: "10px 6px" }}>{item.sport_key}</td>
                  <td style={{ padding: "10px 6px" }}>{item.league_id}</td>
                  <td style={{ padding: "10px 6px" }}>{item.regions || "-"}</td>

                  <td style={{ padding: "10px 6px" }}>
                    {item.season_policy === "fixed"
                      ? `fixed (${item.fixed_season ?? "-"})`
                      : "current"}
                  </td>

                  <td style={{ padding: "10px 6px" }}>
                    <span className="pill">
                      {item.computed_status === "approved" && "Aprovada"}
                      {item.computed_status === "incomplete" && "Incompleta"}
                      {item.computed_status === "pending" && "Pendente"}
                      {item.computed_status === "disabled" && "Desativada"}
                    </span>
                  </td>

                  <td style={{ padding: "10px 6px" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="nav-btn"
                        onClick={() => onToggle(item)}
                        disabled={busySportKey === item.sport_key}
                      >
                        {busySportKey === item.sport_key
                          ? "Salvando..."
                          : active
                          ? "Desligar"
                          : "Ligar"}
                      </button>

                      <button
                        className="nav-btn"
                        onClick={() => onApprove(item)}
                        disabled={
                          busySportKey === item.sport_key ||
                          !item.league_id ||
                          item.league_id <= 0
                        }
                      >
                        Aprovar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} style={{ padding: "14px 6px" }}>
                  <span className="muted">Nenhuma liga encontrada.</span>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}