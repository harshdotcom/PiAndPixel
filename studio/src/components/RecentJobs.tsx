import { useState } from "react";
import { outputLabel } from "../api/geometry";
import { canRetry } from "../api/hooks";
import type { Job } from "../api/types";
import { STATUS_STYLE } from "./JobPanel";

interface Props {
  jobs: Job[];
  selected: string | null;
  onSelect: (jobId: string) => void;
  /** Retries the same job (next attempt), it does not start a new render. */
  onRetry: (jobId: string) => void;
  retryDisabled: boolean;
}

// Jobs are added a page at a time, so an older failed job can still be opened and retried.
const PAGE = 8;

function sceneName(ref: string): string {
  return ref.split(":").pop() ?? ref;
}

interface RowProps extends Omit<Props, "jobs" | "selected"> {
  job: Job;
  isSelected: boolean;
}

function JobRow({ job, isSelected, onSelect, onRetry, retryDisabled }: RowProps) {
  const style = STATUS_STYLE[job.status];
  const { request } = job;
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onSelect(job.id)}
        aria-current={isSelected ? "true" : undefined}
        className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-1.5 text-left text-sm transition ${
          isSelected ? "bg-accent/15" : "hover:bg-raised"
        }`}
      >
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.className}`}>
          {style.label}
        </span>
        <span className="truncate font-medium">{sceneName(request.scene)}</span>
        <span className="truncate font-mono text-xs text-muted">
          {request.format} · {outputLabel(request)}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted">
          {new Date(job.created_at).toLocaleString()}
        </span>
      </button>
      {canRetry(job.status) && (
        <button
          type="button"
          disabled={retryDisabled}
          onClick={() => onRetry(job.id)}
          className="rounded-md border border-accent/50 px-2.5 py-1 text-xs font-medium text-accent transition hover:bg-accent/10 disabled:opacity-40"
        >
          Retry
        </button>
      )}
    </li>
  );
}

export function RecentJobs({ jobs, selected, ...actions }: Props) {
  const [shown, setShown] = useState(PAGE);
  if (jobs.length === 0) return <p className="text-sm text-muted">No renders yet.</p>;

  const hidden = jobs.length - shown;
  return (
    <>
      <ul aria-label="Recent renders" className="space-y-1">
        {jobs.slice(0, shown).map((job) => (
          <JobRow key={job.id} job={job} isSelected={job.id === selected} {...actions} />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-2 text-xs text-muted hover:text-white"
        >
          Show {Math.min(hidden, PAGE)} more ({hidden} older)
        </button>
      )}
    </>
  );
}
