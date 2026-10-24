import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job, JobStatus } from "../../api/types";
import { makeExport, makeJob, renderWithClient } from "../../test/fixtures";
import { MonitorProbe } from "../../test/probe";
import { fakeAgent, renderInStudio } from "../../test/studio";
import { RenderJobDetails } from "./JobDetails";
import { JobSection } from "./JobSection";

function renderDetails(job: Job, pending = false) {
  const onCancel = vi.fn();
  const onRetry = vi.fn();
  renderWithClient(<RenderJobDetails job={job} onCancel={onCancel} onRetry={onRetry} pending={pending} />);
  return { onCancel, onRetry };
}

afterEach(() => vi.unstubAllGlobals());

describe("RenderJobDetails", () => {
  it("shows a queued job with no elapsed time", () => {
    renderDetails(makeJob({ status: "queued" }));
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("shows a running job's measured progress and live elapsed time", () => {
    renderDetails(makeJob({ status: "running", started_at: new Date(Date.now() - 5000).toISOString(), progress: { animations_done: 2, pct: null } }));
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/0:0[4-6]/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error text and code of a failed job", () => {
    renderDetails(
      makeJob({ status: "failed", started_at: "2026-10-24T10:00:00Z", finished_at: "2026-10-24T10:00:12Z", error: "NameError: Sqare", error_code: "render_failed" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("[render_failed]NameError: Sqare");
    expect(screen.getByText("0:12")).toBeInTheDocument();
  });

  it("shows a completed job's final elapsed time, attempt and output", () => {
    renderDetails(makeJob({ status: "completed", attempt: 2, started_at: "2026-10-24T10:00:00Z", finished_at: "2026-10-24T10:01:05Z" }));
    expect(screen.getByText("1:05")).toBeInTheDocument();
    expect(screen.getByText("Attempt 2")).toBeInTheDocument();
    expect(screen.getByText("854×480 @ 15 fps")).toBeInTheDocument();
  });

  it.each<JobStatus>(["queued", "running", "blocked"])("offers Cancel (not Retry) for %s jobs", (status) => {
    const { onCancel } = renderDetails(makeJob({ status }));
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it.each<JobStatus>(["failed", "timed_out", "cancelled", "interrupted"])("offers Retry (not Cancel) for %s jobs", (status) => {
    const { onRetry } = renderDetails(makeJob({ status }));
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("disables the actions while one is pending", () => {
    renderDetails(makeJob({ status: "running" }), true);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});

describe("JobSection", () => {
  it("cancels the job shown in the monitor", async () => {
    const agent = fakeAgent({ jobs: [makeJob({ id: "run", status: "running", attempt: 1 })] });
    renderInStudio(<JobSection />);
    const panel = await screen.findByRole("region", { name: "Render job" });
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(agent.requests.some((r) => r.url === "/api/v1/jobs/run/cancel")).toBe(true));
    expect(await within(panel).findByText("Cancelled")).toBeInTheDocument();
  });

  it("explains a failed export that is longer than 30 minutes", async () => {
    const failed = makeExport({ id: "x", status: "failed", error: "Export is 1900.0 s; the limit is 1800 s", error_code: "duration_exceeded" });
    fakeAgent({ exports: [failed] });
    renderInStudio(
      <>
        <MonitorProbe show={{ kind: "export", id: "x" }} />
        <JobSection />
      </>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("1900.0 s");
    expect(alert).toHaveTextContent("at most 30 minutes");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
