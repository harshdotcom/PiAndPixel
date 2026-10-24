import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Job, JobStatus } from "../api/types";
import { makeJob } from "../test/fixtures";
import { JobPanel } from "./JobPanel";

function renderPanel(job: Job, pending = false) {
  const onCancel = vi.fn();
  const onRetry = vi.fn();
  render(
    <JobPanel job={job} onCancel={onCancel} onRetry={onRetry} pending={pending} projectFiles={new Set()} />,
  );
  return { onCancel, onRetry };
}

describe("JobPanel", () => {
  it("shows a queued job as waiting with no elapsed time", () => {
    renderPanel(makeJob({ status: "queued" }));

    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("–")).toBeInTheDocument();
    expect(screen.getByLabelText("Render log")).toHaveTextContent("Waiting for the render slot");
  });

  it("shows a running job with measured progress and its log tail", () => {
    const job = makeJob({
      status: "running",
      started_at: new Date(Date.now() - 5000).toISOString(),
      log_tail: ["Animation 0 : Partial movie file written", "Animation 1 : Partial movie file written"],
      progress: { animations_done: 2, pct: null },
    });
    renderPanel(job);

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/0:0[4-6]/)).toBeInTheDocument();
    expect(screen.getByLabelText("Render log")).toHaveTextContent("Animation 1 : Partial movie");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error text for a failed job", () => {
    const job = makeJob({
      status: "failed",
      started_at: "2026-10-24T10:00:00Z",
      finished_at: "2026-10-24T10:00:12Z",
      error: "NameError: name 'Sqare' is not defined",
    });
    renderPanel(job);

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("NameError: name 'Sqare' is not defined");
    expect(screen.getByText("0:12")).toBeInTheDocument();
  });

  it("shows a completed job with its final elapsed time", () => {
    const job = makeJob({
      status: "completed",
      started_at: "2026-10-24T10:00:00Z",
      finished_at: "2026-10-24T10:01:05Z",
      progress: { animations_done: 7, pct: null },
      artifact_id: "a".repeat(32),
    });
    renderPanel(job);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("1:05")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each<JobStatus>(["queued", "running", "blocked"])("offers Cancel (not Retry) for %s jobs", (status) => {
    const { onCancel } = renderPanel(makeJob({ id: "j7", status }));

    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledWith("j7");
  });

  it.each<JobStatus>(["failed", "timed_out", "cancelled", "interrupted"])(
    "offers Retry (not Cancel) for %s jobs",
    (status) => {
      const { onRetry } = renderPanel(makeJob({ id: "j8", status }));

      expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(onRetry).toHaveBeenCalledWith("j8");
    },
  );

  it("offers neither action for a completed job and disables them while pending", () => {
    renderPanel(makeJob({ status: "completed" }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    cleanup();

    renderPanel(makeJob({ status: "running" }), true);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("shows the attempt number, the error code and a blocked job's state", () => {
    renderPanel(
      makeJob({
        status: "blocked",
        attempt: 2,
        error: "Blocked: dependency abc failed",
        error_code: "dependency_failed",
      }),
    );

    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("Attempt 2")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("[dependency_failed]");
    expect(screen.getByLabelText("Render log")).toHaveTextContent("Waiting on a failed dependency.");
  });
});
