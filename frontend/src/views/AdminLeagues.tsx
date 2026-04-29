import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminOpsApproveLeagueMap,
  adminOpsAutoResolveLeagues,
  adminOpsDiscoverLeagueCandidates,
  adminOpsLeagueSuggestions,
  adminOpsListLeagues,
  adminOpsToggleLeague,
} from "../api/client";
import { getAdminCountryOptionsPt } from "../product/i18n/countryCatalog";

type LeagueItem = {
  sport_key: string;
  official_name: string | null;
  official_country_code: string | null;
  sport_title: string | null;
  sport_group: string | null;
  league_id: number | null;
  season_policy: "current" | "fixed" | null;
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

type LeagueCandidate = {
  league_id: number;
  name?: string | null;
  country_name?: string | null;
  country_code?: string | null;
  match_reason?: string | null;
  rank?: number | null;
};

type LeagueResolvePreview = {
  ok: boolean;
  sport_key: string;
  sport_title?: string | null;
  sport_group?: string | null;
  current_league_id: number;
  current_mapping_status?: string | null;
  competition_candidates: string[];
  country_hint?: string | null;
  reason: string;
  can_auto_resolve: boolean;
  suggested_candidate?: LeagueCandidate | null;
  candidates: LeagueCandidate[];
};

function formatMatchReason(value?: string | null) {
  switch (value) {
    case "exact_name_country":
      return "nome + país exatos";
    case "unique_name":
      return "nome único";
    case "already_resolved":
      return "já resolvida";
    default:
      return value || "sugestão";
  }
}

function formatPreviewReason(value?: string | null) {
  switch (value) {
    case "already_resolved":
      return "liga já resolvida";
    case "exact_name_country":
      return "match exato por nome + país";
    case "unique_name":
      return "match único por nome";
    case "ambiguous_exact_matches":
      return "múltiplos matches exatos; escolha manualmente";
    case "ambiguous_name_matches":
      return "nome ambíguo; escolha manualmente";
    case "no_match":
      return "sem match automático";
    default:
      return value || "análise disponível";
  }
}

export default function AdminLeagues() {
  const [items, setItems] = useState<LeagueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySportKey, setBusySportKey] = useState<string | null>(null);
  const [suggestionLoadingKey, setSuggestionLoadingKey] = useState<string | null>(null);
  const [resolveMessage, setResolveMessage] = useState<string | null>(null);
  const [discoverMessage, setDiscoverMessage] = useState<string | null>(null);

  const [draftLeagueIds, setDraftLeagueIds] = useState<Record<string, string>>({});
  const [draftOfficialNames, setDraftOfficialNames] = useState<Record<string, string>>({});
  const [draftOfficialCountryCodes, setDraftOfficialCountryCodes] = useState<Record<string, string>>({});
  const [approveMessage, setApproveMessage] = useState<string | null>(null);
  const [suggestionsBySportKey, setSuggestionsBySportKey] = useState<Record<string, LeagueResolvePreview>>({});

  const countryOptions = useMemo(() => getAdminCountryOptionsPt(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await adminOpsListLeagues();
      const nextItems = Array.isArray(out?.items) ? out.items : [];
      setItems(nextItems);

      setDraftLeagueIds((prev) => {
        const next = { ...prev };
        for (const item of nextItems) {
          if (!(item.sport_key in next)) {
            next[item.sport_key] = item.league_id != null && item.league_id > 0 ? String(item.league_id) : "";
          }
        }
        return next;
      });

      setDraftOfficialNames((prev) => {
        const next = { ...prev };
        for (const item of nextItems) {
          if (!(item.sport_key in next)) {
            next[item.sport_key] = String(item.official_name ?? item.sport_title ?? "").trim();
          }
        }
        return next;
      });

      setDraftOfficialCountryCodes((prev) => {
        const next = { ...prev };
        for (const item of nextItems) {
          if (!(item.sport_key in next)) {
            next[item.sport_key] = String(item.official_country_code ?? "").trim().toUpperCase();
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
    void load();
  }, [load]);

  async function loadSuggestions(sportKey: string, force = false) {
    if (!force && suggestionsBySportKey[sportKey]) return;

    try {
      setSuggestionLoadingKey(sportKey);
      setError(null);

      const out = await adminOpsLeagueSuggestions({ sport_key: sportKey, limit: 6 });
      setSuggestionsBySportKey((prev) => ({
        ...prev,
        [sportKey]: out,
      }));

      if (out.suggested_candidate?.league_id) {
        setDraftLeagueIds((prev) => ({
          ...prev,
          [sportKey]: String(out.suggested_candidate?.league_id ?? ""),
        }));
      }

      if (out.suggested_candidate?.name) {
        setDraftOfficialNames((prev) => ({
          ...prev,
          [sportKey]: String(out.suggested_candidate?.name ?? ""),
        }));
      }

      if (out.suggested_candidate?.country_code) {
        setDraftOfficialCountryCodes((prev) => ({
          ...prev,
          [sportKey]: String(out.suggested_candidate?.country_code ?? "").toUpperCase(),
        }));
      }
    } catch (err: any) {
      setError(err?.message ?? "Falha ao carregar sugestões da liga");
    } finally {
      setSuggestionLoadingKey(null);
    }
  }

  function applyCandidate(item: LeagueItem, candidate: LeagueCandidate) {
    setDraftLeagueIds((prev) => ({
      ...prev,
      [item.sport_key]: String(candidate.league_id),
    }));
    setDraftOfficialNames((prev) => ({
      ...prev,
      [item.sport_key]: String(candidate.name ?? item.sport_title ?? "").trim(),
    }));
    if (candidate.country_code) {
      setDraftOfficialCountryCodes((prev) => ({
        ...prev,
        [item.sport_key]: String(candidate.country_code ?? "").trim().toUpperCase(),
      }));
    }
    setApproveMessage(
      `Sugestão aplicada para ${item.sport_title ?? item.sport_key}: league_id ${candidate.league_id}. Revise e clique em Aprovar.`
    );
  }

  async function onToggle(item: LeagueItem) {
    try {
      setBusySportKey(item.sport_key);
      setError(null);
      await adminOpsToggleLeague({
        sport_key: item.sport_key,
        enabled: !item.enabled,
      });
      await load();
    } catch (err: any) {
      if (!item.enabled) {
        await loadSuggestions(item.sport_key, true);
        setError(
          "Não foi possível ativar automaticamente esta liga. Revise as sugestões, escolha o league_id correto e aprove manualmente."
        );
      } else {
        setError(err?.message ?? "Falha ao atualizar status da liga");
      }
    } finally {
      setBusySportKey(null);
    }
  }

  async function onDiscoverCandidates() {
    try {
      setLoading(true);
      setError(null);
      setResolveMessage(null);
      setApproveMessage(null);
      setDiscoverMessage(null);

      const out = await adminOpsDiscoverLeagueCandidates({
        default_enabled: false,
        auto_resolve: true,
        all_sports: true,
      });

      setDiscoverMessage(
        [
          `Descoberta concluída: catálogo ${out.summary.catalog_upserted}/${out.summary.sports_seen}`,
          `${out.summary.inserted_pending} novas pendentes`,
          `${out.summary.inserted_ignored} ignoradas`,
          `${out.summary.resolved_count} resolvidas automaticamente`,
          `${out.summary.failed_count} ainda pendentes`,
        ].join(" · ")
      );

      await load();
    } catch (err: any) {
      setError(err?.message ?? "Falha ao buscar novas ligas");
    } finally {
      setLoading(false);
    }
  }

  async function onAutoResolve() {
    try {
      setLoading(true);
      setError(null);
      setDiscoverMessage(null);
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
    const officialCountryCode = String(draftOfficialCountryCodes[item.sport_key] ?? "").trim().toUpperCase();
    const chosenLeagueId = Number(draftLeagueIds[item.sport_key] ?? item.league_id ?? 0);

    if (!officialName) {
      setError("Informe o nome oficial da liga antes de aprovar.");
      return;
    }

    if (!officialCountryCode) {
      setError("Informe o país oficial da liga antes de aprovar.");
      return;
    }

    if (!chosenLeagueId || chosenLeagueId <= 0) {
      setError("Informe um league_id válido antes de aprovar.");
      return;
    }

    try {
      setBusySportKey(item.sport_key);
      setError(null);
      setApproveMessage(null);

      await adminOpsApproveLeagueMap({
        sport_key: item.sport_key,
        league_id: chosenLeagueId,
        official_name: officialName,
        official_country_code: officialCountryCode,
        regions: item.regions ?? "eu",
        hours_ahead: item.hours_ahead ?? 720,
        tol_hours: item.tol_hours ?? 6,
        season_policy: item.season_policy ?? "current",
        fixed_season: item.fixed_season ?? null,
        enabled: item.enabled,
      });

      setApproveMessage(`Liga aprovada: ${officialName} / ${officialCountryCode} (league_id ${chosenLeagueId})`);
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
          Tela gestora das ligas: descubra candidatas novas, resolva ambiguidades, aprove o mapeamento oficial e só então ative no produto.
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

          <button className="nav-btn" onClick={onDiscoverCandidates} disabled={loading}>
            {loading ? "Processando..." : "Buscar novas ligas"}
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

      {discoverMessage ? (
        <div className="muted" style={{ color: "#9fd3a8" }}>
          {discoverMessage}
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
              <th align="left">País oficial</th>
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
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: "14px 6px" }}>
                  <span className="muted">{loading ? "Carregando..." : "Nenhuma liga encontrada."}</span>
                </td>
              </tr>
            ) : null}

            {items.map((item) => {
              const preview = suggestionsBySportKey[item.sport_key];
              const isBusy = busySportKey === item.sport_key;
              const isLoadingSuggestion = suggestionLoadingKey === item.sport_key;

              return (
                <React.Fragment key={item.sport_key}>
                  <tr style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: "10px 6px", minWidth: 220 }}>
                      <input
                        className="input"
                        value={draftOfficialNames[item.sport_key] ?? ""}
                        onChange={(e) =>
                          setDraftOfficialNames((prev) => ({
                            ...prev,
                            [item.sport_key]: e.target.value,
                          }))
                        }
                        placeholder="Nome oficial"
                        disabled={isBusy}
                      />
                    </td>

                    <td style={{ padding: "10px 6px", minWidth: 220 }}>
                      <select
                        className="input"
                        value={draftOfficialCountryCodes[item.sport_key] ?? ""}
                        onChange={(e) =>
                          setDraftOfficialCountryCodes((prev) => ({
                            ...prev,
                            [item.sport_key]: e.target.value,
                          }))
                        }
                        disabled={isBusy}
                      >
                        <option value="">Selecione o país</option>
                        {countryOptions.map((opt) => (
                          <option key={opt.code} value={opt.code}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={{ padding: "10px 6px" }}>{item.sport_title ?? "—"}</td>
                    <td style={{ padding: "10px 6px", fontFamily: "monospace" }}>{item.sport_key}</td>
                    <td style={{ padding: "10px 6px", minWidth: 140 }}>
                      <input
                        className="input"
                        inputMode="numeric"
                        value={draftLeagueIds[item.sport_key] ?? ""}
                        onChange={(e) =>
                          setDraftLeagueIds((prev) => ({
                            ...prev,
                            [item.sport_key]: e.target.value.replace(/[^0-9]/g, ""),
                          }))
                        }
                        placeholder="league_id"
                        disabled={isBusy}
                      />
                    </td>
                    <td style={{ padding: "10px 6px" }}>{item.regions ?? "—"}</td>
                    <td style={{ padding: "10px 6px" }}>
                      {item.season_policy === "fixed" ? `fixed ${item.fixed_season ?? "—"}` : "current"}
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      <div>{item.computed_status}</div>
                      {item.confidence != null ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          conf. {item.confidence.toFixed(2)}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "10px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="nav-btn" onClick={() => onApprove(item)} disabled={isBusy}>
                        Aprovar
                      </button>

                      <button
                        className="nav-btn"
                        onClick={() => void loadSuggestions(item.sport_key, true)}
                        disabled={isBusy || isLoadingSuggestion}
                      >
                        {isLoadingSuggestion ? "Sugestões..." : "Sugerir"}
                      </button>

                      <button className="nav-btn" onClick={() => onToggle(item)} disabled={isBusy}>
                        {item.enabled ? "Desativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>

                  {preview ? (
                    <tr style={{ borderTop: "1px dashed rgba(255,255,255,0.06)" }}>
                      <td colSpan={9} style={{ padding: "0 6px 14px 6px" }}>
                        <div
                          style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 10,
                            padding: 12,
                            display: "grid",
                            gap: 10,
                          }}
                        >
                          <div>
                            <strong>Resolver liga</strong>
                            <div className="muted" style={{ marginTop: 4 }}>
                              {formatPreviewReason(preview.reason)}
                              {preview.country_hint ? ` · país detectado: ${preview.country_hint}` : ""}
                            </div>
                            {preview.competition_candidates?.length ? (
                              <div className="muted" style={{ marginTop: 4 }}>
                                candidatos de nome: {preview.competition_candidates.join(", ")}
                              </div>
                            ) : null}
                          </div>

                          {preview.suggested_candidate?.league_id ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <span className="muted">
                                sugestão principal: #{preview.suggested_candidate.league_id}
                                {preview.suggested_candidate.name ? ` · ${preview.suggested_candidate.name}` : ""}
                                {preview.suggested_candidate.country_name
                                  ? ` · ${preview.suggested_candidate.country_name}`
                                  : ""}
                                {preview.suggested_candidate.match_reason
                                  ? ` · ${formatMatchReason(preview.suggested_candidate.match_reason)}`
                                  : ""}
                              </span>
                              <button
                                className="nav-btn"
                                onClick={() => applyCandidate(item, preview.suggested_candidate as LeagueCandidate)}
                                disabled={isBusy}
                              >
                                Usar sugestão principal
                              </button>
                            </div>
                          ) : null}

                          {preview.candidates?.length ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              {preview.candidates.map((candidate) => (
                                <div
                                  key={`${item.sport_key}_${candidate.league_id}`}
                                  style={{
                                    display: "flex",
                                    gap: 10,
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                    background: "rgba(255,255,255,0.02)",
                                  }}
                                >
                                  <span>
                                    <strong>#{candidate.league_id}</strong> · {candidate.name}
                                    {candidate.country_name ? ` · ${candidate.country_name}` : ""}
                                    {candidate.country_code ? ` (${candidate.country_code})` : ""}
                                  </span>
                                  <span className="muted">{formatMatchReason(candidate.match_reason)}</span>
                                  <button className="nav-btn" onClick={() => applyCandidate(item, candidate)} disabled={isBusy}>
                                    Usar este candidato
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="muted">Nenhum candidato automático encontrado para esta liga.</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}