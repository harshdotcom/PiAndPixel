import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { vi } from "vitest";
import type { Export, Job, RenderOptions, SceneInfo } from "../api/types";

/** A queued landscape draft render job; override what the test cares about. */
export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job1",
    project: "demo",
    kind: "render",
    status: "queued",
    priority: 0,
    revision_id: "r".repeat(64),
    export_id: null,
    depends_on: [],
    created_at: "2026-10-24T10:00:00Z",
    started_at: null,
    finished_at: null,
    attempt: 0,
    attempts: [],
    request: {
      scene: "scenes/proof.py:Proof",
      format: "landscape",
      quality: "draft",
      resolution: "480p",
      params: {},
      width: 854,
      height: 480,
      fps: 15,
    },
    error: null,
    error_code: null,
    log_tail: [],
    progress: { animations_done: 0, pct: null },
    artifact_id: null,
    ...overrides,
  };
}

/** A queued draft export of composition "main" with 2 clips. */
export function makeExport(overrides: Partial<Export> = {}): Export {
  return {
    id: "exp1",
    project: "demo",
    composition: "main",
    format: "landscape",
    quality: "draft",
    resolution: "480p",
    fps: 15,
    width: 854,
    height: 480,
    status: "queued",
    revision_id: "r".repeat(64),
    created_at: "2026-10-24T10:00:00Z",
    finished_at: null,
    units_total: 2,
    units_done: 0,
    unit_job_ids: ["u1", "u2"],
    composite_job_id: "c1",
    artifact_id: null,
    error: null,
    error_code: null,
    ...overrides,
  };
}

/** What GET /agent reports as render_options. */
export const RENDER_OPTIONS: RenderOptions = {
  resolutions: [
    { id: "480p", short_edge: 480 },
    { id: "720p", short_edge: 720 },
    { id: "1080p", short_edge: 1080 },
    { id: "1440p", short_edge: 1440 },
    { id: "2160p", short_edge: 2160 },
  ],
  fps: [15, 24, 30, 60],
  max_long_edge: 3840,
  default: { resolution: "480p", fps: 15 },
};

export function makeScene(className: string): SceneInfo {
  const file = `scenes/${className.toLowerCase()}.py`;
  return { ref: `${file}:${className}`, file, class_name: className, line: 4 };
}

export interface FakeRequest {
  method: string;
  url: string;
  headers: Headers;
  body: unknown;
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Replaces fetch; `handler` answers each request (unstub with vi.unstubAllGlobals). */
export function stubFetch(handler: (req: FakeRequest) => Response) {
  const fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const req = { method: init.method ?? "GET", url, headers: new Headers(init.headers), body };
    return Promise.resolve(handler(req));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Renders `ui` inside a fresh QueryClient without retries. */
export function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(createElement(QueryClientProvider, { client }, ui)) };
}
