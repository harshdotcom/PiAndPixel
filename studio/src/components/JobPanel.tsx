import { useEffect, useRef, useState } from "react";
import { resolutionLabel } from "../api/geometry";
import { canCancel, canRetry, isActive } from "../api/hooks";
import type { Job, JobStatus } from "../api/types";
import { LogLines } from "./editor/LogLines";

export const STATUS_STYLE: Record<JobStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-muted/15 text-muted" },
  blocked: { label: "Blocked", className: "bg-warning/15 text-warning" },
  running: { label: "Running", className: "bg-accent/15 text-accent" },
  completed: { label: "Completed", className: "bg-success/15 text-success" },
  failed: { label: "Failed", className: "bg-error/15 text-error" },
  timed_out: { label: "Timed out", className: "bg-error/15 text-error" },
  cancelled: { label: "Cancelled", className: "bg-warning/15 text-warning" },
  interrupted: { label: "Interrupted", className: "bg-warning/15 text-warning" },
};

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Re-renders every second while the job runs so the elapsed time stays live. */
function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  return now;
}

const actionButton =
  "rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40";

interface ActionProps {
  job: Job;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  /** True while a cancel or retry request is in flight. */
  pending: boolean;
}

function JobActions({ job, onCancel, onRetry, pending }: ActionProps) {
  return (
    <>
      {canCancel(job.status) && (
        <button
          type="button"
          disabled={pending}
          onClick={() => onCancel(job.id)}
          className={`${actionButton} border-error/50 text-error hover:bg-error/10`}
        >
          Cancel
        </button>
      )}
      {canRetry(job.status) && (
        <button
          type="button"
          disabled={pending}
          onClick={() => onRetry(job.id)}
          className={`${actionButton} border-accent/50 text-accent hover:bg-accent/10`}
        >
          Retry
        </button>
      )}
    </>
  );
}

function logPlaceholder(status: JobStatus): string {
  if (status === "queued") return "Waiting for the render slot…";
  if (status === "blocked") return "Waiting on a failed dependency.";
  return "No output yet.";
}

/** Status, attempt, elapsed time, measured progress, the request and the actions. */
function JobHeader(props: ActionProps) {
  const { job } = props;
  const now = useNow(isActive(job.status));
  const style = STATUS_STYLE[job.status];
  const end = job.finished_at ? Date.parse(job.finished_at) : now;
  const elapsed = job.started_at ? formatElapsed(end - Date.parse(job.started_at)) : "–";
  const { request } = job;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.className}`}>
        {style.label}
      </span>
      {job.attempt > 0 && <span className="text-muted">Attempt {job.attempt}</span>}
      <span className="text-muted">
        Elapsed <span className="font-mono text-white">{elapsed}</span>
      </span>
      <span className="text-muted">
        Animations done{" "}
        <span className="font-mono text-white">{job.progress.animations_done}</span>
      </span>
      <span className="font-mono text-xs text-muted">
        {request.scene} · {request.format} · {request.resolution ? resolutionLabel(request.resolution) : request.quality} ·{" "}
        {request.width}×{request.height}@
        {request.fps}
      </span>
      <span className="ml-auto flex gap-2">
        <JobActions {...props} />
      </span>
    </div>
  );
}

interface PanelProps extends ActionProps {
  /** Project-relative file paths; traceback references to these become links. */
  projectFiles: ReadonlySet<string>;
}

export function JobPanel({ projectFiles, ...props }: PanelProps) {
  const { job } = props;
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job.log_tail]);

  return (
    <section aria-label="Render job" className="space-y-3">
      <JobHeader {...props} />
      {job.error && (
        <p role="alert" className="rounded-md border border-error/40 bg-error/5 p-3 font-mono text-sm text-error">
          {job.error_code && <span className="mr-2 font-semibold">[{job.error_code}]</span>}
          {job.error}
        </p>
      )}
      <pre
        ref={logRef}
        aria-label="Render log"
        className="h-56 overflow-auto rounded-md border border-line bg-bg p-3 font-mono text-xs leading-relaxed text-muted"
      >
        {job.log_tail.length > 0 ? <LogLines lines={job.log_tail} projectFiles={projectFiles} /> : logPlaceholder(job.status)}
      </pre>
    </section>
  );
}
