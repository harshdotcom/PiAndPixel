import type { ApiErrorBody } from "./types";

export const TOKEN_KEY = "pnp.token";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** Called when the Agent rejects the token, so the app can show the TokenGate. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

/**
 * Moves "#token=..." from the URL into sessionStorage and strips the hash,
 * so the token does not linger in the address bar, history or bookmarks.
 */
export function captureTokenFromHash(): string | null {
  const match = /(?:^#|&)token=([^&]*)/.exec(window.location.hash);
  if (match?.[1]) {
    setToken(decodeURIComponent(match[1]));
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", pathname + search);
  }
  return getToken();
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Adds the first field problem of a validation error, e.g. "…: quality: Input should be …". */
export function withFirstDetail(message: string, details: unknown): string {
  if (!Array.isArray(details)) return message;
  const first = details[0] as { loc?: unknown; msg?: unknown } | undefined;
  if (typeof first?.msg !== "string") return message;
  const field = Array.isArray(first.loc) ? first.loc.filter((part) => part !== "body").join(".") : "";
  return `${message}: ${field ? `${field}: ` : ""}${first.msg}`;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body.error) {
      const { code, message, details } = body.error;
      return new ApiError(res.status, code, withFirstDetail(message, details), details);
    }
  } catch {
    // Non-JSON body (e.g. a proxy error page): fall through to a generic message.
  }
  return new ApiError(res.status, "http_error", `Request failed (${res.status} ${res.statusText})`);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the Pi & Pixel agent.");
  }
  if (res.status === 401) {
    clearToken();
    unauthorizedListeners.forEach((listener) => listener());
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { headers });
  if (res.status === 401) {
    clearToken();
    unauthorizedListeners.forEach((listener) => listener());
  }
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

export function apiPost<T>(path: string, body: unknown, headers?: HeadersInit): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body), headers });
}

export function apiPut<T>(path: string, body: unknown, headers?: HeadersInit): Promise<T> {
  return apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body), headers });
}

export function apiDelete(path: string, headers?: HeadersInit): Promise<void> {
  return apiFetch<void>(path, { method: "DELETE", headers });
}

/** Project-relative file path as a URL path: each segment encoded, slashes kept. */
export function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * WebSocket URL on the same host. Browsers cannot send headers on a WebSocket, so the
 * token goes in the query; the Agent accepts that only on WS routes with an allowed Origin.
 */
export function wsUrl(path: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams({ ...params, token: getToken() ?? "" });
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}${path}?${query.toString()}`;
}
