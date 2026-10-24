import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeExport, makeJob } from "../../test/fixtures";
import { MonitorProbe } from "../../test/probe";
import { fakeAgent, makeArtifact, renderInStudio } from "../../test/studio";
import { binItems } from "./binItems";
import { RenderBin } from "./RenderBin";

const rows = async () => within(await screen.findByRole("list", { name: "Renders" })).getAllByRole("listitem");

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("RenderBin", () => {
  it("lists renders and exports newest first with status, output badge and duration", async () => {
    fakeAgent({
      jobs: [makeJob({ id: "j1", status: "completed", artifact_id: "a1", created_at: "2026-10-24T10:02:00Z" })],
      exports: [makeExport({ id: "e1", status: "running", units_done: 1, created_at: "2026-10-24T10:05:00Z" })],
      artifacts: [makeArtifact("a1", 6.4)],
    });
    renderInStudio(<RenderBin view="list" />);
    const [first, second] = await rows();
    expect(first).toHaveTextContent("main");
    expect(first).toHaveTextContent("Running");
    expect(second).toHaveTextContent("Proof");
    expect(second).toHaveTextContent("480p@15");
    await waitFor(() => expect(second).toHaveTextContent("6.4s"));
  });

  it("retries the same job (a new attempt), not a new render, and cancels a running export", async () => {
    const agent = fakeAgent({
      jobs: [makeJob({ id: "new", status: "completed" }), makeJob({ id: "old", status: "failed", attempt: 1 })],
      exports: [makeExport({ id: "e1", status: "running" })],
    });
    renderInStudio(<RenderBin view="list" />);
    await rows();
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(agent.requests.filter((r) => r.method === "POST").map((r) => r.url)).toEqual([
        "/api/v1/jobs/old/retry",
        "/api/v1/exports/e1/cancel",
      ]),
    );
  });

  it("lists only standalone renders, so export units do not push them off the list", async () => {
    const units = Array.from({ length: 8 }, (_, i) => makeJob({ id: `u${i}`, export_id: "e1" }));
    fakeAgent({ jobs: [...units, makeJob({ id: "solo", status: "failed", attempt: 1 })] });
    renderInStudio(<RenderBin view="list" />);
    expect(await rows()).toHaveLength(1);
  });

  it("pages older items in, so a failed render pushed down by newer ones can still be retried", async () => {
    const newer = Array.from({ length: 12 }, (_, i) => makeJob({ id: `n${i}`, status: "completed", created_at: `2026-10-24T11:${10 + i}:00Z` }));
    fakeAgent({ jobs: [...newer, makeJob({ id: "old", status: "failed" })] });
    renderInStudio(<RenderBin view="list" />);
    expect(await rows()).toHaveLength(12);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 1 more (1 older)" }));
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows a clicked item in the Program Monitor, in grid view too", async () => {
    fakeAgent({ jobs: [makeJob({ id: "j1", status: "completed", artifact_id: "a1" })], artifacts: [makeArtifact("a1", 3)] });
    renderInStudio(
      <>
        <RenderBin view="grid" />
        <MonitorProbe />
      </>,
    );
    const [card] = await rows();
    fireEvent.click(within(card!).getByText("Proof"));
    expect(screen.getByLabelText("monitor source")).toHaveTextContent("job:j1");
  });

  it("says so when there are no renders", async () => {
    fakeAgent();
    renderInStudio(<RenderBin view="list" />);
    expect(await screen.findByText("No renders yet.")).toBeInTheDocument();
  });
});

describe("binItems", () => {
  it("merges renders and exports newest first", () => {
    const items = binItems(
      [makeJob({ id: "j", created_at: "2026-10-24T10:01:00Z" })],
      [makeExport({ id: "x", created_at: "2026-10-24T10:02:00Z", resolution: null })],
    );
    expect(items.map((i) => [i.kind, i.id, i.badge])).toEqual([
      ["export", "x", "draft"],
      ["render", "j", "480p@15"],
    ]);
  });
});
