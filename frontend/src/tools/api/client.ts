import { API_BASE_URL } from "../../config";

export class ToolsApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, details: Record<string, unknown> = {}) {
    super(code);
    this.name = "ToolsApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function toolsRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const outer = asObject(payload);
    const detail = asObject(outer.detail);
    const error = Object.keys(detail).length ? detail : outer;
    const code = typeof error.code === "string" ? error.code : `HTTP_${response.status}`;
    throw new ToolsApiError(response.status, code, error);
  }

  return payload as T;
}
