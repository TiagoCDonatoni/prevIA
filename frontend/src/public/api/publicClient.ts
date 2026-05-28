import { API_BASE_URL } from "../../config";

async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}${txt ? ` | ${txt}` : ""}`);
  }
  return (await res.json()) as T;
}

export type BetaLeadPayload = {
  name: string;
  email: string;
  lang: "pt" | "en" | "es";
  country?: string;
  bettor_profile?: string;
  experience_level?: string;
  uses_tipsters?: boolean;
  interest_note?: string;
  source?: string;
};

export type BetaLeadResponse = {
  ok: boolean;
  id: number;
  created_at_utc: string;
  email_notification_sent: boolean;
};

export async function submitBetaLead(payload: BetaLeadPayload): Promise<BetaLeadResponse> {
  const url = new URL("/public/beta-leads", API_BASE_URL);

  return fetchJson<BetaLeadResponse>(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export type ContactMessagePayload = {
  name: string;
  email: string;
  lang: "pt" | "en" | "es";
  subject: string;
  message: string;
  source?: string;
};

export type ContactMessageResponse = {
  ok: boolean;
  id: number;
  created_at_utc: string;
  email_notification_sent: boolean;
};

export async function submitContactMessage(
  payload: ContactMessagePayload
): Promise<ContactMessageResponse> {
  const url = new URL("/public/contact-messages", API_BASE_URL);

  return fetchJson<ContactMessageResponse>(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export type PartnerApplicationPayload = {
  full_name: string;
  public_name: string;
  email: string;
  whatsapp: string;
  lang: "pt" | "en" | "es";
  main_social_platform: string;
  main_social_url: string;
  audience_size_range: "up_to_5k" | "5k_20k" | "20k_50k" | "50k_100k" | "100k_plus";
  content_type:
    | "football_analysis"
    | "responsible_sports_betting"
    | "sports_data_stats"
    | "fantasy_trading"
    | "sports_community"
    | "other";
  promotion_plan: string;
  other_social_urls?: string;
  city_state?: string;
  media_kit_url?: string;
  notes?: string;
  accepted_responsible_disclosure: boolean;
  accepted_no_profit_promises: boolean;
  accepted_not_guaranteed_approval: boolean;
  accepted_contact: boolean;
  source?: string;
  website?: string;
};

export type PartnerApplicationResponse = {
  ok: boolean;
  id: number;
  created_at_utc: string;
  email_notification_sent: boolean;
};

export async function submitPartnerApplication(
  payload: PartnerApplicationPayload
): Promise<PartnerApplicationResponse> {
  const url = new URL("/public/partner-applications", API_BASE_URL);

  return fetchJson<PartnerApplicationResponse>(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export type WorldCupPoolLang = "pt" | "en" | "es";
export type WorldCupPoolScoringMode = "classic" | "weighted_by_stage";

export type WorldCupPoolStatusCopy = {
  title: string;
  subtitle: string;
  cta_label: string;
  scoring_summary: string;
};

export type WorldCupPoolScoringConfig = {
  exact_score_points: number;
  outcome_points: number;
  exact_team_score_bonus: number;
  max_points_per_match: number;
};

export type WorldCupPoolScoringPhaseConfig = WorldCupPoolScoringConfig & {
  phase_key: string;
  phase_label: Record<WorldCupPoolLang, string>;
};

export type WorldCupPoolScoringModeConfig = {
  mode: WorldCupPoolScoringMode;
  title: Record<WorldCupPoolLang, string>;
  summary: Record<WorldCupPoolLang, string>;
  phases: WorldCupPoolScoringPhaseConfig[];
};

export type WorldCupPoolStatusResponse = {
  ok: boolean;
  enabled: boolean;
  public_create_enabled: boolean;
  join_enabled: boolean;
  predictions_enabled: boolean;
  readonly_enabled: boolean;
  supported_langs: WorldCupPoolLang[];
  scoring: WorldCupPoolScoringConfig;
  scoring_mode_default: WorldCupPoolScoringMode;
  scoring_modes: WorldCupPoolScoringModeConfig[];
  copy: Record<WorldCupPoolLang, WorldCupPoolStatusCopy>;
};

export async function fetchWorldCupPoolStatus(): Promise<WorldCupPoolStatusResponse> {
  const url = new URL("/public/worldcup-pool/status", API_BASE_URL);

  return fetchJson<WorldCupPoolStatusResponse>(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
}

export type WorldCupPoolCreatePayload = {
  name: string;
  organizer_name: string;
  organizer_email: string;
  organizer_pin: string;
  lang: WorldCupPoolLang;
  scoring_mode?: WorldCupPoolScoringMode;
  marketing_opt_in: boolean;
  terms_accepted: boolean;
};

export type WorldCupPoolCreatedPool = {
  id: number;
  slug: string;
  name: string;
  lang: WorldCupPoolLang;
  scoring_mode: WorldCupPoolScoringMode;
  invite_token: string;
  invite_url: string;
  admin_url: string;
};

export type WorldCupPoolCreatedParticipant = {
  id: number;
  display_name: string;
  email: string;
  status: string;
};

export type WorldCupPoolCreateResponse = {
  ok: boolean;
  pool: WorldCupPoolCreatedPool;
  creator_participant?: WorldCupPoolCreatedParticipant | null;
  organizer_session_created: boolean;
  participant_session_created?: boolean;
};

export async function createWorldCupPool(
  payload: WorldCupPoolCreatePayload
): Promise<WorldCupPoolCreateResponse> {
  const url = new URL("/public/worldcup-pool/pools", API_BASE_URL);

  return fetchJson<WorldCupPoolCreateResponse>(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export type WorldCupPoolInvitePool = {
  id: number;
  slug: string;
  name: string;
  lang: WorldCupPoolLang;
  scoring_mode: WorldCupPoolScoringMode;
  status: string;
  participant_count: number;
};

export type WorldCupPoolInviteResponse = {
  ok: boolean;
  join_enabled: boolean;
  pool: WorldCupPoolInvitePool;
};

export type WorldCupPoolJoinPayload = {
  display_name: string;
  email: string;
  pin: string;
  marketing_opt_in: boolean;
  terms_accepted: boolean;
};

export type WorldCupPoolParticipantLoginPayload = {
  email: string;
  pin: string;
};

export type WorldCupPoolPinResetPayload = {
  email: string;
  pool_slug?: string | null;
  invite_token?: string | null;
};

export type WorldCupPoolPinResetResponse = {
  ok: boolean;
};

export type WorldCupPoolJoinedParticipant = {
  id: number;
  display_name: string;
  email: string;
  status: string;
  joined_existing: boolean;
};

export type WorldCupPoolJoinResponse = {
  ok: boolean;
  pool: WorldCupPoolInvitePool;
  participant: WorldCupPoolJoinedParticipant;
  participant_session_created: boolean;
};

export type WorldCupPoolDashboardParticipant = {
  id: number;
  display_name: string;
  email: string;
  status: string;
  joined_at_utc?: string | null;
  last_seen_at_utc?: string | null;
};

export type WorldCupPoolParticipantDashboardResponse = {
  ok: boolean;
  pool: WorldCupPoolInvitePool;
  participant: WorldCupPoolDashboardParticipant;
  scoring: WorldCupPoolScoringConfig;
  scoring_mode: WorldCupPoolScoringMode;
  scoring_rules: WorldCupPoolScoringModeConfig;
};

export type WorldCupPoolMatchFilter = "all" | "pending" | "predicted" | "locked";
export type WorldCupPoolRoundFilter = "all" | "1" | "2" | "3";

export type WorldCupPoolPagination = {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
};

export type WorldCupPoolPredictionSummary = {
  total_matches: number;
  predicted_matches: number;
  pending_matches: number;
  locked_matches: number;
};

export type WorldCupPoolMatchPrediction = {
  match_id: number;
  home_score?: number | null;
  away_score?: number | null;
  updated_at_utc?: string | null;
  locked_at_utc?: string | null;
};

export type WorldCupPoolParticipantMatch = {
  id: number;
  match_key: string;
  official_match_no?: number | null;
  display_order: number;
  phase: string;
  group_code?: string | null;
  bracket_label?: string | null;
  home_label: string;
  away_label: string;
  kickoff_utc?: string | null;
  lock_at_utc?: string | null;
  status: string;
  is_locked: boolean;
  prediction?: WorldCupPoolMatchPrediction | null;
};

export type WorldCupPoolParticipantMatchesResponse = {
  ok: boolean;
  pool: WorldCupPoolInvitePool;
  participant: WorldCupPoolDashboardParticipant;
  items: WorldCupPoolParticipantMatch[];
  summary: WorldCupPoolPredictionSummary;
  pagination: WorldCupPoolPagination;
};

export type WorldCupPoolPredictionPayload = {
  home_score: number;
  away_score: number;
};

export type WorldCupPoolSavedPrediction = {
  id: number;
  match_id: number;
  home_score: number;
  away_score: number;
  points: number;
  updated_at_utc?: string | null;
  locked_at_utc?: string | null;
};

export type WorldCupPoolPredictionUpsertResponse = {
  ok: boolean;
  prediction: WorldCupPoolSavedPrediction;
};

export type WorldCupPoolRankingItem = {
  rank: number;
  participant_id: number;
  display_name: string;
  points: number;
  predictions_count: number;
  last_prediction_at_utc?: string | null;
  is_me: boolean;
};

export type WorldCupPoolRankingResponse = {
  ok: boolean;
  pool: WorldCupPoolInvitePool;
  participant: WorldCupPoolDashboardParticipant;
  me: WorldCupPoolRankingItem;
  items: WorldCupPoolRankingItem[];
  pagination: WorldCupPoolPagination;
};

export async function fetchWorldCupPoolInvite(
  inviteToken: string
): Promise<WorldCupPoolInviteResponse> {
  const url = new URL(
    `/public/worldcup-pool/invites/${encodeURIComponent(inviteToken)}`,
    API_BASE_URL
  );

  return fetchJson<WorldCupPoolInviteResponse>(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
}

export async function joinWorldCupPool(
  inviteToken: string,
  payload: WorldCupPoolJoinPayload
): Promise<WorldCupPoolJoinResponse> {
  const url = new URL(
    `/public/worldcup-pool/invites/${encodeURIComponent(inviteToken)}/participants`,
    API_BASE_URL
  );

  return fetchJson<WorldCupPoolJoinResponse>(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function requestWorldCupPoolPinReset(
  payload: WorldCupPoolPinResetPayload
): Promise<WorldCupPoolPinResetResponse> {
  const url = new URL("/public/worldcup-pool/access/pin-reset", API_BASE_URL);

  return fetchJson<WorldCupPoolPinResetResponse>(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function loginWorldCupPoolParticipant(
  inviteToken: string,
  payload: WorldCupPoolParticipantLoginPayload
): Promise<WorldCupPoolJoinResponse> {
  const url = new URL(
    `/public/worldcup-pool/invites/${encodeURIComponent(inviteToken)}/participant-login`,
    API_BASE_URL
  );

  return fetchJson<WorldCupPoolJoinResponse>(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function logoutWorldCupPoolParticipant(
  inviteToken: string
): Promise<WorldCupPoolLogoutResponse> {
  const url = new URL(
    `/public/worldcup-pool/invites/${encodeURIComponent(inviteToken)}/participant/logout`,
    API_BASE_URL
  );

  return fetchJson<WorldCupPoolLogoutResponse>(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });
}

export async function fetchWorldCupPoolParticipantDashboard(
  inviteToken: string
): Promise<WorldCupPoolParticipantDashboardResponse> {
  const url = new URL(
    `/public/worldcup-pool/invites/${encodeURIComponent(inviteToken)}/participant/me`,
    API_BASE_URL
  );

  return fetchJson<WorldCupPoolParticipantDashboardResponse>(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });
}

export async function fetchWorldCupPoolParticipantMatches(
  inviteToken: string,
  options?: {
    page?: number;
    pageSize?: number;
    filter?: WorldCupPoolMatchFilter;
    round?: WorldCupPoolRoundFilter;
  }
): Promise<WorldCupPoolParticipantMatchesResponse> {
  const url = new URL(
    `/public/worldcup-pool/invites/${encodeURIComponent(inviteToken)}/participant/matches`,
    API_BASE_URL
  );

  url.searchParams.set("page", String(options?.page || 1));
  url.searchParams.set("page_size", String(options?.pageSize || 10));
  url.searchParams.set("filter", options?.filter || "all");
  url.searchParams.set("round", options?.round || "all");

  return fetchJson<WorldCupPoolParticipantMatchesResponse>(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });
}

export async function saveWorldCupPoolPrediction(
  inviteToken: string,
  matchId: number,
  payload: WorldCupPoolPredictionPayload
): Promise<WorldCupPoolPredictionUpsertResponse> {
  const url = new URL(
    `/public/worldcup-pool/invites/${encodeURIComponent(inviteToken)}/participant/predictions/${encodeURIComponent(
      String(matchId)
    )}`,
    API_BASE_URL
  );

  return fetchJson<WorldCupPoolPredictionUpsertResponse>(url.toString(), {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchWorldCupPoolParticipantRanking(
  inviteToken: string,
  options?: {
    page?: number;
    pageSize?: number;
  }
): Promise<WorldCupPoolRankingResponse> {
  const url = new URL(
    `/public/worldcup-pool/invites/${encodeURIComponent(inviteToken)}/participant/ranking`,
    API_BASE_URL
  );

  url.searchParams.set("page", String(options?.page || 1));
  url.searchParams.set("page_size", String(options?.pageSize || 10));

  return fetchJson<WorldCupPoolRankingResponse>(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });
}

export type WorldCupPoolOrganizerPool = {
  id: number;
  slug: string;
  name: string;
  lang: WorldCupPoolLang;
  scoring_mode: WorldCupPoolScoringMode;
  status: string;
  invite_token: string;
  invite_url: string;
  admin_url: string;
  participant_count: number;
};

export type WorldCupPoolOrganizerSummary = {
  active_participants: number;
  filtered_participants: number;
  available_matches: number;
};

export type WorldCupPoolOrganizerParticipant = {
  id: number;
  rank: number;
  display_name: string;
  email: string;
  status: string;
  points: number;
  predictions_count: number;
  available_matches: number;
  joined_at_utc?: string | null;
  last_seen_at_utc?: string | null;
  last_prediction_at_utc?: string | null;
  removed_at_utc?: string | null;
  is_organizer: boolean;
};

export type WorldCupPoolOrganizerDashboardResponse = {
  ok: boolean;
  pool: WorldCupPoolOrganizerPool;
  summary: WorldCupPoolOrganizerSummary;
  participants: WorldCupPoolOrganizerParticipant[];
  pagination: WorldCupPoolPagination;
};

export type WorldCupPoolOrganizerLoginPayload = {
  email: string;
  pin: string;
};

export type WorldCupPoolOrganizerLoginResponse = {
  ok: boolean;
  pool: WorldCupPoolOrganizerPool;
  organizer_session_created: boolean;
};

export type WorldCupPoolOrganizerSessionStatusResponse = {
  ok: boolean;
  authenticated: boolean;
  pool?: WorldCupPoolOrganizerPool | null;
};

export type WorldCupPoolOrganizerParticipantSessionResponse = {
  ok: boolean;
  participant_url: string;
  invite_url: string;
  participant: WorldCupPoolDashboardParticipant;
  participant_session_created: boolean;
};

export type WorldCupPoolRemoveParticipantResponse = {
  ok: boolean;
  participant_id: number;
  status: string;
};

export type WorldCupPoolLogoutResponse = {
  ok: boolean;
};

export async function fetchWorldCupPoolOrganizerSessionStatus(
  slug: string
): Promise<WorldCupPoolOrganizerSessionStatusResponse> {
  const url = new URL(
    `/public/worldcup-pool/pools/${encodeURIComponent(slug)}/organizer/session`,
    API_BASE_URL
  );

  return fetchJson<WorldCupPoolOrganizerSessionStatusResponse>(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });
}

export async function loginWorldCupPoolOrganizer(
  slug: string,
  payload: WorldCupPoolOrganizerLoginPayload
): Promise<WorldCupPoolOrganizerLoginResponse> {
  const url = new URL(
    `/public/worldcup-pool/pools/${encodeURIComponent(slug)}/organizer-login`,
    API_BASE_URL
  );

  return fetchJson<WorldCupPoolOrganizerLoginResponse>(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function logoutWorldCupPoolOrganizer(
  slug: string
): Promise<WorldCupPoolLogoutResponse> {
  const url = new URL(
    `/public/worldcup-pool/pools/${encodeURIComponent(slug)}/organizer/logout`,
    API_BASE_URL
  );

  return fetchJson<WorldCupPoolLogoutResponse>(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });
}

export async function createWorldCupPoolOrganizerParticipantSession(
  slug: string
): Promise<WorldCupPoolOrganizerParticipantSessionResponse> {
  const url = new URL(
    `/public/worldcup-pool/pools/${encodeURIComponent(slug)}/organizer/participant-session`,
    API_BASE_URL
  );

  return fetchJson<WorldCupPoolOrganizerParticipantSessionResponse>(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });
}

export async function fetchWorldCupPoolOrganizerDashboard(
  slug: string,
  options?: {
    page?: number;
    pageSize?: number;
    q?: string;
  }
): Promise<WorldCupPoolOrganizerDashboardResponse> {
  const url = new URL(
    `/public/worldcup-pool/pools/${encodeURIComponent(slug)}/organizer`,
    API_BASE_URL
  );

  url.searchParams.set("page", String(options?.page || 1));
  url.searchParams.set("page_size", String(options?.pageSize || 10));

  const query = (options?.q || "").trim();
  if (query) {
    url.searchParams.set("q", query);
  }

  return fetchJson<WorldCupPoolOrganizerDashboardResponse>(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });
}

export async function removeWorldCupPoolParticipant(
  slug: string,
  participantId: number,
  reason?: string
): Promise<WorldCupPoolRemoveParticipantResponse> {
  const url = new URL(
    `/public/worldcup-pool/pools/${encodeURIComponent(slug)}/organizer/participants/${participantId}/remove`,
    API_BASE_URL
  );

  return fetchJson<WorldCupPoolRemoveParticipantResponse>(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: reason || null,
    }),
  });
}