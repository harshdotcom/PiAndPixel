import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Export } from "../../api/types";
import {
  jsonResponse,
  makeExport,
  makeJob,
  renderWithClient,
  stubFetch,
  type FakeRequest,
} from "../../test/fixtures";
import { RecentExports } from "./RecentExports";

const exportsList: Export[] = [
  makeExport({ id: "e3", status: "running", units_done: 1, composition: "teaser" }),
  makeExport({ id: "e2", status: "failed", error: "boom", error_code: "render_failed", resolution: null }),
  makeExport({ id: "e1", status: "completed", units_done: 2, artifact_id: "art1", format: "square", resolution: "2160p", fps: 60 }),
];

function stubExports(list: Export[]) {
  const posts: FakeRequest[] = [];
  stubFetch((req) => {
    if (req.method === "POST") {
      posts.push(req);
      const id = req.url.split("/")[4]!;
      return jsonResponse(200, { ...list.find((e) => e.id === id), status: "queued" });
    }
    if (req.url.startsWith("/api/v1/jobs/")) {
      return jsonResponse(200, { ...makeJob({ id: "c1" }), kind: "composite" });
    }
    if (req.url.startsWith("/api/v1/artifacts/")) {
      return jsonResponse(200, {
        id: "art1", kind: "export", project: "demo", width: 480, height: 480, fps: 15, duration_s: 4,
        sha256: "s", created_at: "x", meta: {}, stream_url: "/s/art1", download_url: "/d/art1",
      });
    }
    return jsonResponse(200, list);
  });
  return posts;
}

afterEach(() => vi.unstubAllGlobals());

describe("RecentExports", () => {
  it("lists exports with status and units, Cancel only when active, Retry only when failed", async () => {
    const posts = stubExports(exportsList);
    renderWithClient(<RecentExports pid="demo" />);

    expect(await screen.findByText("teaser")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("square · 4K @ 60 fps")).toBeInTheDocument();
    // Exports from before resolution/fps existed still show their quality.
    expect(screen.getByText("landscape · draft")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Cancel" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts.map((p) => p.url)).toEqual(["/api/v1/exports/e3/cancel", "/api/v1/exports/e2/retry"]);
  });

  it("shows the video of a completed export when clicked", async () => {
    stubExports(exportsList);
    renderWithClient(<RecentExports pid="demo" />);

    fireEvent.click(await screen.findByText("Completed"));
    expect(await screen.findByRole("link", { name: "Download MP4" })).toHaveAttribute("href", "/d/art1");
  });

  it("says so when there are no exports", async () => {
    stubExports([]);
    renderWithClient(<RecentExports pid="demo" />);
    expect(await screen.findByText("No exports yet.")).toBeInTheDocument();
  });
});
