import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Job, JobStatus } from "../api/types";
import { makeJob } from "../test/fixtures";
import { RecentJobs } from "./RecentJobs";

function makeSquareJob(id: string, status: JobStatus): Job {
  const job = makeJob({ id, status });
  return { ...job, request: { ...job.request, format: "square", width: 480, height: 480 } };
}

describe("RecentJobs", () => {
  it("lists jobs and offers retry only for jobs that did not finish", () => {
    const onRetry = vi.fn();
    const onSelect = vi.fn();
    const jobs = [
      makeSquareJob("a", "completed"),
      makeSquareJob("b", "interrupted"),
      makeSquareJob("c", "running"),
      makeSquareJob("d", "failed"),
    ];
    render(
      <RecentJobs jobs={jobs} selected="a" onSelect={onSelect} onRetry={onRetry} retryDisabled={false} />,
    );

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Interrupted")).toBeInTheDocument();
    expect(screen.getAllByText("square · 480p @ 15 fps")).toHaveLength(4);
    const retry = screen.getAllByRole("button", { name: "Retry" });
    expect(retry).toHaveLength(2);

    fireEvent.click(retry[0]!);
    expect(onRetry).toHaveBeenCalledWith("b");
    fireEvent.click(retry[1]!);
    expect(onRetry).toHaveBeenCalledWith("d");
    fireEvent.click(screen.getByText("Completed"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("pages older jobs in, so a failed job pushed down by newer ones can still be retried", () => {
    const onRetry = vi.fn();
    const newer = Array.from({ length: 8 }, (_, i) => makeJob({ id: `n${i}` }));
    const jobs = [...newer, makeJob({ id: "old", status: "failed" })];
    render(<RecentJobs jobs={jobs} selected={null} onSelect={vi.fn()} onRetry={onRetry} retryDisabled={false} />);

    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 1 more (1 older)" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledWith("old");
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("says so when there are no renders", () => {
    render(<RecentJobs jobs={[]} selected={null} onSelect={vi.fn()} onRetry={vi.fn()} retryDisabled />);
    expect(screen.getByText("No renders yet.")).toBeInTheDocument();
  });
});
