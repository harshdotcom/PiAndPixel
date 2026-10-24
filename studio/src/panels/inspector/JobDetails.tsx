import { Download, RotateCcw, Square } from "lucide-react";
import { resolutionLabel } from "../../api/geometry";
import { canCancel, canRetry, isActive, useArtifact } from "../../api/hooks";
import type { Job, JobStatus } from "../../api/types";
import { elapsedSeconds, useNow } from "../../state/clock";
import { Button } from "../../ui/Button";
import { StatusPill } from "../../ui/StatusPill";
import { formatDuration } from "../monitor/timecode";
import { Prop } from "./Section";

export interface ActionProps {
  status: JobStatus;
  onCancel: () => void;
  onRetry: () => void;
  /** True while a cancel or retry request is in flight. */
  pending: boolean;
  /** The agent is unreachable: the actions are shown but disabled. */
  offline?: boolean;
}

const WAITING = "Waiting for the agent";

export function JobActions({ status, onCancel, onRetry, pending, offline = false }: ActionProps) {
  if (!canCancel(status) && !canRetry(status)) return null;
  const title = offline ? WAITING : undefined;
  return (
    <div className="flex gap-2">
      {canCancel(status) && (
        <Button variant="danger" icon={Square} title={title} disabled={pending || offline} onClick={onCancel}>
          Cancel
        </Button>
      )}
      {canRetry(status) && (
        <Button icon={RotateCcw} title={title} disabled={pending || offline} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** "Download MP4" for a completed job or export. */
export function DownloadLink({ artifactId, offline = false }: { artifactId: string | null; offline?: boolean }) {
  const artifact = useArtifact(artifactId).data;
  if (!artifact) return null;
  if (offline) {
    return (
      <span title={WAITING} className="inline-flex h-[26px] items-center gap-1.5 rounded-[4px] border border-line px-2.5 text-sm font-medium text-fg opacity-40">
        <Download size={14} strokeWidth={1.75} aria-hidden />
        Download MP4
      </span>
    );
  }
  return (
    <a
      href={artifact.download_url}
      download
      className="press inline-flex h-[26px] items-center gap-1.5 rounded-[4px] border border-line bg-raised px-2.5 text-sm font-medium text-fg hover:border-line-strong"
    >
      <Download size={14} strokeWidth={1.75} aria-hidden />
      Download MP4
    </a>
  );
}

/** The error of a failed job or export, in --record, with its code. */
export function JobError({ code, message, hint }: { code: string | null; message: string; hint?: string }) {
  return (
    <div role="alert" className="space-y-1 rounded-[4px] border border-record/40 bg-record/5 p-2 text-sm text-record">
      <p className="font-mono text-xs break-words">
        {code && <span className="mr-1.5 font-semibold">[{code}]</span>}
        {message}
      </p>
      {hint && <p>{hint}</p>}
    </div>
  );
}

/** Status, attempt, elapsed time, measured progress, the request and the actions of a render job. */
export function RenderJobDetails({ job, ...actions }: { job: Job } & Omit<ActionProps, "status">) {
  const now = useNow(isActive(job.status));
  const elapsed = elapsedSeconds(job.started_at, job.finished_at, now);
  const { request } = job;
  return (
    <>
      <div className="flex items-center gap-2">
        <StatusPill status={job.status} />
        {job.attempt > 0 && <span className="text-sm text-fg-2">Attempt {job.attempt}</span>}
      </div>
      <Prop label="Elapsed">
        <span className="font-mono">{elapsed === null ? "–" : formatDuration(elapsed)}</span>
      </Prop>
      <Prop label="Animations">
        <span className="font-mono">{job.progress.animations_done}</span>
      </Prop>
      <Prop label="Format">
        {request.format} · {request.resolution ? resolutionLabel(request.resolution) : request.quality}
      </Prop>
      <Prop label="Frame">
        {request.width}×{request.height} @ {request.fps} fps
      </Prop>
      {job.error && <JobError code={job.error_code} message={job.error} />}
      <JobActions status={job.status} {...actions} />
      {job.status === "completed" && <DownloadLink artifactId={job.artifact_id} offline={actions.offline} />}
    </>
  );
}
