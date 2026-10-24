import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Artifact, Export } from "../../api/types";
import {
  RENDER_OPTIONS,
  jsonResponse,
  makeExport,
  makeJob,
  renderWithClient,
  stubFetch,
  type FakeRequest,
} from "../../test/fixtures";
import { ExportPanel } from "./ExportPanel";

const formats = {
  landscape: { width: 1920, height: 1080, fps: 30 },
  square: { width: 1080, height: 1080, fps: 30 },
};

const artifact: Artifact = {
  id: "art1", kind: "export", project: "demo", width: 854, height: 480, fps: 15, duration_s: 9,
  sha256: "s", created_at: "2026-10-24T10:05:00Z", meta: {},
  stream_url: "/api/v1/artifacts/art1/stream", download_url: "/api/v1/artifacts/art1/download",
};

/** Accepts POST /exports and serves `exp` plus its composite job at `pct`. */
function stubExport(exp: Export, pct: number | null = null) {
  const posts: FakeRequest[] = [];
  stubFetch((req) => {
    if (req.method === "POST") {
      posts.push(req);
      return jsonResponse(202, { export_id: exp.id, job_ids: ["u1", "u2", "c1"], revision_id: "r" });
    }
    if (req.url.startsWith("/api/v1/jobs/")) {
      return jsonResponse(200, { ...makeJob({ id: "c1" }), kind: "composite", progress: { animations_done: 0, pct } });
    }
    if (req.url.startsWith("/api/v1/artifacts/")) return jsonResponse(200, artifact);
    if (req.url === "/api/v1/agent") return jsonResponse(200, { render_options: RENDER_OPTIONS });
    return jsonResponse(200, exp);
  });
  return posts;
}

async function startExport(composition: string | null = "main") {
  renderWithClient(<ExportPanel pid="demo" composition={composition} formats={formats} />);
  if (composition) await waitFor(() => expect(screen.getByRole("button", { name: "Export" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("ExportPanel", () => {
  it("is disabled without a composition", async () => {
    stubExport(makeExport());
    await startExport(null);
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(screen.getByText("Select a composition to export it.")).toBeInTheDocument();
  });

  it("is disabled while the composition has unsaved edits", () => {
    stubExport(makeExport());
    renderWithClient(<ExportPanel pid="demo" composition="main" formats={formats} unsaved />);
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(screen.getByText(/Save the composition first/)).toBeInTheDocument();
  });

  it("starts an export with the chosen format, resolution and fps and a fresh Idempotency-Key", async () => {
    const posts = stubExport(makeExport());
    renderWithClient(<ExportPanel pid="demo" composition="main" formats={formats} />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Resolution" })).toBeEnabled());
    fireEvent.change(screen.getByRole("combobox", { name: "Format" }), { target: { value: "square" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Resolution" }), { target: { value: "720p" } });
    fireEvent.change(screen.getByRole("combobox", { name: "FPS" }), { target: { value: "24" } });
    expect(screen.getByRole("option", { name: "square · 720×720" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(posts).toHaveLength(2));

    expect(posts[0]!.url).toBe("/api/v1/projects/demo/exports");
    expect(posts[0]!.body).toEqual({ composition: "main", format: "square", resolution: "720p", fps: 24 });
    expect(JSON.parse(localStorage.getItem("pnp.output.export.demo")!)).toEqual({ resolution: "720p", fps: 24 });
    const keys = posts.map((p) => p.headers.get("Idempotency-Key"));
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[0]).not.toBe(keys[1]);
    expect(await screen.findByText("Queued")).toBeInTheDocument();
  });

  it("shows clips done and the composite's measured percentage while running", async () => {
    stubExport(makeExport({ status: "running", units_done: 2 }), 41);
    await startExport();

    expect(await screen.findByText("Running")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(await screen.findByText("41%")).toBeInTheDocument();
  });

  it("explains a failed export that is longer than 30 minutes", async () => {
    stubExport(
      makeExport({ status: "failed", error: "Export is 1900.0 s; the limit is 1800 s", error_code: "duration_exceeded" }),
    );
    await startExport();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("1900.0 s");
    expect(alert).toHaveTextContent("at most 30 minutes");
    expect(screen.queryByText("%", { exact: false })).not.toBeInTheDocument();
  });

  it("plays and offers the download of a completed export", async () => {
    stubExport(makeExport({ status: "completed", units_done: 2, artifact_id: "art1" }));
    await startExport();

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    const download = await screen.findByRole("link", { name: "Download MP4" });
    expect(download).toHaveAttribute("href", "/api/v1/artifacts/art1/download");
    expect(screen.getByLabelText("Rendered video").querySelector("video")).toHaveAttribute(
      "src",
      "/api/v1/artifacts/art1/stream",
    );
  });

  it("shows why the Agent refused the export", async () => {
    stubFetch((req) =>
      req.url === "/api/v1/agent"
        ? jsonResponse(200, { render_options: RENDER_OPTIONS })
        : jsonResponse(404, { error: { code: "scene_not_found", message: "Scene not found: X", details: null } }),
    );
    await startExport();
    expect(await screen.findByText("Scene not found: X")).toBeInTheDocument();
  });
});
