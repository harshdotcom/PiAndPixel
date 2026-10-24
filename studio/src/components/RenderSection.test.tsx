import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../api/types";
import { jsonResponse, makeJob, renderWithClient, stubFetch, type FakeRequest } from "../test/fixtures";
import { RenderSection } from "./RenderSection";

const formats = { landscape: { width: 1920, height: 1080, fps: 30 } };

function stubJobs(jobs: Job[]) {
  const posts: FakeRequest[] = [];
  stubFetch((req) => {
    if (req.url.endsWith("/files")) {
      return jsonResponse(200, { entries: [{ path: "scenes/proof.py", type: "file", size: 10 }] });
    }
    const id = req.url.split("/")[4]?.split("?")[0] ?? "";
    const job = jobs.find((j) => j.id === id);
    if (req.method === "POST" && job) {
      posts.push(req);
      const queued = { ...job, status: "queued", attempt: job.attempt + 1 };
      return jsonResponse(200, req.url.endsWith("/retry") ? queued : { ...job, status: "cancelled" });
    }
    return jsonResponse(200, job ?? jobs);
  });
  return posts;
}

afterEach(() => vi.unstubAllGlobals());

describe("RenderSection", () => {
  it("retries the same job from the recent list instead of starting a new render", async () => {
    const jobs = [makeJob({ id: "new", status: "completed" }), makeJob({ id: "old", status: "failed", attempt: 1 })];
    const posts = stubJobs(jobs);
    renderWithClient(<RenderSection pid="demo" formats={formats} sceneRef="scenes/proof.py:Proof" />);

    const recent = await screen.findByRole("list", { name: "Recent renders" });
    fireEvent.click(within(recent).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(posts.map((p) => p.url)).toEqual(["/api/v1/jobs/old/retry"]));
    expect(await screen.findByText("Attempt 2")).toBeInTheDocument();
  });

  it("cancels the shown running job", async () => {
    const posts = stubJobs([makeJob({ id: "run", status: "running", attempt: 1 })]);
    renderWithClient(<RenderSection pid="demo" formats={formats} sceneRef="scenes/proof.py:Proof" />);

    const panel = await screen.findByRole("region", { name: "Render job" });
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(posts.map((p) => p.url)).toEqual(["/api/v1/jobs/run/cancel"]));
    expect(await within(panel).findByText("Cancelled")).toBeInTheDocument();
  });

  it("lists only standalone renders, so export units do not push them off the list", async () => {
    const units = Array.from({ length: 8 }, (_, i) => makeJob({ id: `u${i}`, export_id: "e1" }));
    stubJobs([...units, makeJob({ id: "solo", status: "failed", attempt: 1 })]);
    renderWithClient(<RenderSection pid="demo" formats={formats} sceneRef="scenes/proof.py:Proof" />);

    const recent = await screen.findByRole("list", { name: "Recent renders" });
    expect(within(recent).getAllByRole("listitem")).toHaveLength(1);
    expect(within(recent).getByText("Failed")).toBeInTheDocument();
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("links traceback references only to files in the project's file tree", async () => {
    const job = makeJob({
      id: "bad",
      status: "failed",
      attempt: 1,
      log_tail: ['  File "scenes/proof.py", line 7, in construct', "INFO  done  cairo_renderer.py:89"],
    });
    stubJobs([job]);
    renderWithClient(<RenderSection pid="demo" formats={formats} sceneRef="scenes/proof.py:Proof" />);

    const log = await screen.findByLabelText("Render log");
    expect(await within(log).findByRole("button", { name: /proof\.py", line 7/ })).toBeInTheDocument();
    expect(within(log).getAllByRole("button")).toHaveLength(1);
  });
});
