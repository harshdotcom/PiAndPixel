// Test helpers for the editor and explorer: a fresh React Query client and a scripted fetch.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

export function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

export interface Call {
  method: string;
  url: string;
  body: unknown;
  ifMatch: string | null;
}

type Reply = { status: number; body?: unknown };

/** Replies to each request with the next reply queued for "METHOD url"; records every call. */
export function scriptFetch(replies: Record<string, Reply[]>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body: unknown = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ method, url, body, ifMatch: headers.get("If-Match") });
    const reply = replies[`${method} ${url}`]?.shift();
    if (!reply) return Promise.reject(new Error(`unexpected ${method} ${url}`));
    const text = reply.body === undefined ? null : JSON.stringify(reply.body);
    return Promise.resolve(
      new Response(text, { status: reply.status, headers: { "Content-Type": "application/json" } }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

export function apiError(status: number, code: string, message: string): Reply {
  return { status, body: { error: { code, message, details: null } } };
}
