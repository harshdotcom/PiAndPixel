import type { UseQueryResult } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useCancelJob, useJobs, useRetryJob, useStartRender } from "../api/hooks";
import type { FormatInfo, Job } from "../api/types";
import { useOutputControls, type OutputControls } from "../components/OutputControls";
import { useStudio } from "./studio";

/** What the Program Monitor shows: a scene render or an export. */
export type MonitorSource = { kind: "job"; id: string } | { kind: "export"; id: string };

export interface JobActions {
  cancel: (jobId: string) => void;
  retry: (jobId: string) => void;
  pending: boolean;
  error: Error | null;
}

export interface RenderValue {
  jobs: UseQueryResult<Job[]>;
  source: MonitorSource | null;
  /** The scene of the render in the monitor; null when it shows an export or nothing. */
  sourceScene: string | null;
  /** The render job in the monitor, if the monitor shows one. */
  jobId: string | null;
  show: (source: MonitorSource) => void;
  output: OutputControls;
  /** Queues a render of `scene` with the monitor's output settings. */
  start: (scene: string) => void;
  busy: boolean;
  startError: Error | null;
  actions: JobActions;
}

const RenderContext = createContext<RenderValue | null>(null);

export function useRenders(): RenderValue {
  const value = useContext(RenderContext);
  if (!value) throw new Error("useRenders needs a RenderProvider");
  return value;
}

/** Cancel / retry of one job; a retried job is shown, since its new attempt is what matters. */
function useJobActions(showJob: (jobId: string) => void): JobActions {
  const cancelJob = useCancelJob();
  const retryJob = useRetryJob();
  return {
    cancel: (jobId) => cancelJob.mutate(jobId),
    retry: (jobId) => retryJob.mutate(jobId, { onSuccess: () => showJob(jobId) }),
    pending: cancelJob.isPending || retryJob.isPending,
    error: cancelJob.error ?? retryJob.error,
  };
}

/**
 * The monitor's source, kept in step with the Scene select (what ● Render renders): a picked
 * render selects its scene, and without a pick (or after the select changes) the monitor shows
 * the newest render of the selected scene. An export stays on screen until something else is picked.
 */
function useMonitorPick(jobs: Job[] | undefined) {
  const { sceneRef, selectScene } = useStudio();
  const [picked, setPicked] = useState<MonitorSource | null>(null);
  const pickedJob = picked?.kind === "job" ? jobs?.find((j) => j.id === picked.id) : undefined;
  const latestOfScene = jobs?.find((j) => j.request.scene === sceneRef);
  // Jobs are newest first; with no render of the selected scene, keep the pick or the newest.
  // A just-queued pick that the job list does not have yet stays on screen as it is.
  let shown = pickedJob ?? (picked ? undefined : jobs?.[0]);
  const stale = picked === null || (pickedJob !== undefined && pickedJob.request.scene !== sceneRef);
  if (stale && latestOfScene) shown = latestOfScene;
  const source: MonitorSource | null = shown ? { kind: "job", id: shown.id } : picked;
  function show(next: MonitorSource, scene?: string) {
    const jobScene = next.kind === "job" ? (scene ?? jobs?.find((j) => j.id === next.id)?.request.scene) : undefined;
    if (jobScene) selectScene(jobScene);
    setPicked(next);
  }
  // Null for an export: the select then names the next render's scene, not what is on screen.
  const sourceScene = source?.kind === "job" ? (shown?.request.scene ?? null) : null;
  return { source, sourceScene, show };
}

interface Props {
  pid: string;
  formats: Record<string, FormatInfo>;
  children: ReactNode;
}

/** The project's render jobs, the monitor's source and starting new renders. */
export function RenderProvider({ pid, formats, children }: Props) {
  const jobs = useJobs(pid);
  const startRender = useStartRender(pid);
  const output = useOutputControls(pid, "render", formats);
  const { source, sourceScene, show } = useMonitorPick(jobs.data);
  const actions = useJobActions((id) => show({ kind: "job", id }));

  // Renders queue in the Agent, so only a request in flight blocks another click.
  function start(scene: string) {
    const { format, choice } = output;
    if (!choice) return;
    startRender.mutate({ scene, format, ...choice, params: {} }, { onSuccess: ({ job_id }) => show({ kind: "job", id: job_id }, scene) });
  }

  const value: RenderValue = {
    jobs,
    source,
    sourceScene,
    jobId: source?.kind === "job" ? source.id : null,
    show: (next) => show(next),
    output,
    start,
    busy: startRender.isPending,
    startError: startRender.error,
    actions,
  };
  return <RenderContext.Provider value={value}>{children}</RenderContext.Provider>;
}
