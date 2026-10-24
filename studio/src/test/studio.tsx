// A fake Agent API and a render helper that mounts panels inside the real Studio providers.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AgentInfo, Artifact, CompositionsResponse, Export, Job } from "../api/types";
import { LayoutProvider } from "../layout/LayoutContext";
import { OutputProviders } from "../ProjectWorkspace";
import { StudioProvider } from "../state/studio";
import { RENDER_OPTIONS, jsonResponse, makeScene, stubFetch, type FakeRequest } from "./fixtures";

export const SCENES = [makeScene("Intro"), makeScene("Proof"), makeScene("Outro")];
export const [INTRO, PROOF, OUTRO] = SCENES.map((s) => s.ref) as [string, string, string];

export const AGENT: AgentInfo = {
  version: "0.1.0",
  target: "local",
  os: "Linux",
  cpu_count: 8,
  ram_total_mb: 16384,
  ram_free_mb: 4096,
  disk_free_mb: 50000,
  python: "3.12.7",
  tools: {
    manim: { available: true, version: "Manim Community v0.19.0", path: "/x" },
    ffmpeg: { available: true, version: "7.1", path: "/x" },
    ffprobe: { available: true, version: "7.1", path: "/x" },
    latex: { available: false, version: null, path: null },
  },
  features: { terminal: false },
  render_options: RENDER_OPTIONS,
};

export function makeArtifact(id: string, duration_s: number): Artifact {
  return {
    id, kind: "scene_clip", project: "demo", width: 854, height: 480, fps: 15, duration_s, sha256: "s",
    created_at: "2026-10-24T10:00:00Z", meta: {}, stream_url: `/s/${id}`, download_url: `/d/${id}`,
  };
}

export interface FakeAgent {
  jobs: Job[];
  exports: Export[];
  compositions: CompositionsResponse;
  artifacts: Artifact[];
  files: string[];
  /** Status for PUT /compositions (412 to simulate a stale etag). */
  putStatus: number;
  requests: FakeRequest[];
}

function route(agent: FakeAgent, req: FakeRequest): Response {
  const { method, url } = req;
  const path = url.split("?")[0]!;
  const id = path.split("/")[4] ?? "";
  if (url === "/api/v1/agent") return jsonResponse(200, AGENT);
  if (path === "/api/v1/projects/demo") {
    return jsonResponse(200, { id: "demo", name: "Demo", description: "", formats: { landscape: { width: 1920, height: 1080, fps: 30 } }, compositions: agent.compositions.compositions });
  }
  if (path === "/api/v1/projects/demo/scenes") return jsonResponse(200, { scenes: SCENES, errors: [] });
  if (path === "/api/v1/projects/demo/files") return jsonResponse(200, { entries: agent.files.map((p) => ({ path: p, type: "file", size: 1 })) });
  if (path === "/api/v1/projects/demo/compositions") return compositions(agent, req);
  if (path === "/api/v1/projects/demo/exports") return jsonResponse(202, { export_id: "exp-new", job_ids: [], revision_id: "r" });
  if (path === "/api/v1/projects/demo/renders") return jsonResponse(202, { job_id: "job-new", revision_id: "r" });
  if (path === "/api/v1/jobs") return jsonResponse(200, agent.jobs);
  if (path === "/api/v1/exports") return jsonResponse(200, agent.exports);
  if (path.startsWith("/api/v1/jobs/")) return byId(agent.jobs, id, method, path);
  if (path.startsWith("/api/v1/exports/")) return byId(agent.exports, id, method, path);
  if (path.startsWith("/api/v1/artifacts/")) return jsonResponse(200, agent.artifacts.find((a) => a.id === id));
  return jsonResponse(404, { error: { code: "not_found", message: `No route ${method} ${url}`, details: null } });
}

function compositions(agent: FakeAgent, req: FakeRequest): Response {
  if (req.method !== "PUT") return jsonResponse(200, agent.compositions);
  if (agent.putStatus !== 200) return jsonResponse(agent.putStatus, { error: { code: "conflict", message: "Stale", details: null } });
  agent.compositions = { ...(req.body as Pick<CompositionsResponse, "compositions">), etag: `e${agent.requests.length}` };
  return jsonResponse(200, agent.compositions);
}

function byId<T extends { id: string; status: string; attempt?: number }>(list: T[], id: string, method: string, path: string): Response {
  const item = list.find((x) => x.id === id);
  if (!item) return jsonResponse(404, { error: { code: "not_found", message: "gone", details: null } });
  if (method !== "POST") return jsonResponse(200, item);
  const retried = path.endsWith("/retry");
  const next = { ...item, status: retried ? "queued" : "cancelled", attempt: (item.attempt ?? 0) + (retried ? 1 : 0) };
  list.splice(list.indexOf(item), 1, next);
  return jsonResponse(200, next);
}

/** Stubs fetch with a fake Agent for project "demo"; mutate the returned object to change answers. */
export function fakeAgent(overrides: Partial<FakeAgent> = {}): FakeAgent {
  const agent: FakeAgent = {
    jobs: [],
    exports: [],
    compositions: { compositions: {}, etag: "e1" },
    artifacts: [],
    files: ["pnp.yaml", ...SCENES.map((s) => s.file)],
    putStatus: 200,
    requests: [],
    ...overrides,
  };
  stubFetch((req) => {
    agent.requests.push(req);
    return route(agent, req);
  });
  return agent;
}

/** Renders `ui` inside the layout and the providers of project "demo" (connected). */
export function renderInStudio(ui: ReactElement, connected = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LayoutProvider>
        <StudioProvider pid="demo" connected={connected}>
          <OutputProviders>{ui}</OutputProviders>
        </StudioProvider>
      </LayoutProvider>
    </QueryClientProvider>,
  );
}
