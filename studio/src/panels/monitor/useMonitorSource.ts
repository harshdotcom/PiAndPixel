import { useState } from "react";
import { useCompositeJob, useExport } from "../../api/exports";
import { isActive, useArtifact, useJob } from "../../api/hooks";
import type { Artifact, JobStatus } from "../../api/types";
import { elapsedSeconds, useNow } from "../../state/clock";
import type { MonitorSource } from "../../state/renders";
import { sceneName } from "../../state/studio";
import { formatDuration } from "./timecode";

export interface MonitorView {
  /** Scene or composition name, for the header. */
  name: string | null;
  status: JobStatus | null;
  /** The video to play: the source's own once it completed. */
  artifact: Artifact | null;
  /** The last video this monitor showed, dimmed behind a running render. */
  lastArtifact: Artifact | null;
  /** "Rendering… 3 animations · 0:04" while queued or running, else null. */
  activity: string | null;
  /** Measured progress 0–100, or null while the total is unknown (indeterminate bar). */
  pct: number | null;
  error: string | null;
}

/** Remembers the most recent artifact shown, so a new render can dim it instead of a blank frame. */
function useLastArtifact(artifact: Artifact | null): Artifact | null {
  const [last, setLast] = useState<Artifact | null>(artifact);
  if (artifact && artifact.id !== last?.id) setLast(artifact);
  return last;
}

function renderActivity(status: JobStatus, animations: number, elapsed: number | null): string {
  if (status === "queued") return "Queued… waiting for the render slot";
  if (status === "blocked") return "Blocked on a failed dependency";
  return `Rendering… ${animations} animation${animations === 1 ? "" : "s"} · ${formatDuration(elapsed ?? 0)}`;
}

/** Everything the Program Monitor shows for its source (a scene render or an export). */
export function useMonitorSource(source: MonitorSource | null): MonitorView {
  const job = useJob(source?.kind === "job" ? source.id : null).data;
  const exp = useExport(source?.kind === "export" ? source.id : null).data;
  const composite = useCompositeJob(exp && isActive(exp.status) ? exp.composite_job_id : null).data;
  const status = job?.status ?? exp?.status ?? null;
  const now = useNow(status !== null && isActive(status));
  const artifactId = status === "completed" ? (job?.artifact_id ?? exp?.artifact_id ?? null) : null;
  const artifact = useArtifact(artifactId).data ?? null;
  const lastArtifact = useLastArtifact(artifact);

  let activity: string | null = null;
  let pct: number | null = null;
  if (job && (isActive(job.status) || job.status === "blocked")) {
    const elapsed = elapsedSeconds(job.started_at, null, now);
    activity = renderActivity(job.status, job.progress.animations_done, elapsed);
  } else if (exp && isActive(exp.status)) {
    const joining = composite?.status === "running";
    pct = joining ? composite.progress.pct : exp.units_total > 0 ? (exp.units_done / exp.units_total) * 100 : null;
    activity = joining ? "Joining clips…" : `Exporting… ${exp.units_done}/${exp.units_total} clips rendered`;
  }
  return {
    name: job ? sceneName(job.request.scene) : (exp?.composition ?? null),
    status,
    artifact,
    lastArtifact,
    activity,
    pct,
    error: job?.error ?? exp?.error ?? null,
  };
}
