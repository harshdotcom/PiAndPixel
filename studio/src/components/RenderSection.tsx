import { useMemo, useState } from "react";
import { useFileTree } from "../api/files";
import {
  useArtifact,
  useCancelJob,
  useJob,
  useJobs,
  useRetryJob,
  useStartRender,
} from "../api/hooks";
import type { FormatInfo, OutputChoice, RenderBody } from "../api/types";
import { JobPanel } from "./JobPanel";
import { ErrorText, Panel } from "./Panel";
import { RecentJobs } from "./RecentJobs";
import { RenderControls } from "./RenderControls";
import { VideoPlayer } from "./VideoPlayer";

interface JobActions {
  cancel: (jobId: string) => void;
  retry: (jobId: string) => void;
  pending: boolean;
  error: Error | null;
}

/** The project's file paths, for deciding which traceback references are links. */
function useProjectFiles(pid: string): ReadonlySet<string> {
  const tree = useFileTree(pid);
  return useMemo(
    () => new Set(tree.data?.entries.filter((e) => e.type === "file").map((e) => e.path)),
    [tree.data],
  );
}

function JobDetails({ pid, jobId, actions }: { pid: string; jobId: string; actions: JobActions }) {
  const job = useJob(jobId);
  const projectFiles = useProjectFiles(pid);
  const completed = job.data?.status === "completed" ? job.data.artifact_id : null;
  const artifact = useArtifact(completed);

  // The video comes first so a finished render is not pushed below the log.
  return (
    <>
      {artifact.data && (
        <Panel title="Video">
          <VideoPlayer artifact={artifact.data} />
        </Panel>
      )}
      {artifact.error && <ErrorText error={artifact.error} />}
      {job.data && (
        <Panel title="Job">
          <JobPanel
            job={job.data}
            onCancel={actions.cancel}
            onRetry={actions.retry}
            pending={actions.pending}
            projectFiles={projectFiles}
          />
        </Panel>
      )}
      {job.error && <ErrorText error={job.error} />}
    </>
  );
}

/** Cancel / retry of one job; a retried job is shown, since its new attempt is what matters. */
function useJobActions(show: (jobId: string) => void): JobActions {
  const cancelJob = useCancelJob();
  const retryJob = useRetryJob();
  return {
    cancel: (jobId) => cancelJob.mutate(jobId),
    retry: (jobId) => retryJob.mutate(jobId, { onSuccess: () => show(jobId) }),
    pending: cancelJob.isPending || retryJob.isPending,
    error: cancelJob.error ?? retryJob.error,
  };
}

/** The project's jobs, the one being shown, and a way to start a new render. */
function useRenderJobs(pid: string) {
  const jobs = useJobs(pid);
  const startRender = useStartRender(pid);
  const [pickedJob, setPickedJob] = useState<string | null>(null);
  // Without a pick, show the newest job so its video is back after a reload.
  const jobId = pickedJob ?? jobs.data?.[0]?.id ?? null;
  const actions = useJobActions(setPickedJob);

  // Renders queue in the Agent, so only a request in flight blocks another click.
  function start(body: RenderBody) {
    startRender.mutate(body, { onSuccess: ({ job_id }) => setPickedJob(job_id) });
  }
  const busy = startRender.isPending;
  return { jobs, startError: startRender.error, jobId, setPickedJob, busy, start, actions };
}

interface Props {
  pid: string;
  formats: Record<string, FormatInfo>;
  sceneRef: string | null;
}

export function RenderSection({ pid, formats, sceneRef }: Props) {
  const { jobs, startError, jobId, setPickedJob, busy, start, actions } = useRenderJobs(pid);

  function renderScene(format: string, choice: OutputChoice) {
    if (sceneRef) start({ scene: sceneRef, format, ...choice, params: {} });
  }

  return (
    <>
      <Panel title="Render">
        <RenderControls pid={pid} formats={formats} disabled={!sceneRef} busy={busy} onRender={renderScene} />
        {startError && (
          <div className="mt-3">
            <ErrorText error={startError} />
          </div>
        )}
      </Panel>
      {actions.error && <ErrorText error={actions.error} />}
      {jobId && <JobDetails key={jobId} pid={pid} jobId={jobId} actions={actions} />}
      <Panel title="Recent renders">
        {jobs.error && <ErrorText error={jobs.error} />}
        {jobs.data && (
          <RecentJobs
            jobs={jobs.data}
            selected={jobId}
            onSelect={setPickedJob}
            onRetry={actions.retry}
            retryDisabled={actions.pending}
          />
        )}
      </Panel>
    </>
  );
}
