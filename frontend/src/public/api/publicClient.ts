const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

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