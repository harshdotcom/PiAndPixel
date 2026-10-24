import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost } from "./client";
import { queryKeys } from "./queryKeys";
import type {
  AgentInfo,
  Artifact,
  CreateProjectBody,
  Job,
  JobStatus,
  ProjectDetail,
  ProjectSummary,
  RenderAccepted,
  RenderBody,
  ScenesResponse,
  Template,
} from "./types";

export function isActive(status: JobStatus): boolean {
  return status === "queued" || status === "running";
}

export function canCancel(status: JobStatus): boolean {
  return status === "queued" || status === "running" || status === "blocked";
}

export function canRetry(status: JobStatus): boolean {
  return ["failed", "timed_out", "cancelled", "interrupted"].includes(status);
}

export function useAgent() {
  return useQuery({ queryKey: queryKeys.agent, queryFn: () => apiFetch<AgentInfo>("/api/v1/agent") });
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: () => apiFetch<Template[]>("/api/v1/templates"),
  });
}

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => apiFetch<ProjectSummary[]>("/api/v1/projects"),
  });
}

export function useProject(pid: string | null) {
  return useQuery({
    queryKey: queryKeys.project(pid),
    queryFn: () => apiFetch<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(pid ?? "")}`),
    enabled: pid !== null,
  });
}

export function useScenes(pid: string | null) {
  return useQuery({
    queryKey: queryKeys.scenes(pid),
    queryFn: () =>
      apiFetch<ScenesResponse>(`/api/v1/projects/${encodeURIComponent(pid ?? "")}/scenes`),
    enabled: pid !== null,
    refetchOnWindowFocus: true, // scene files may change outside the Studio
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProjectBody) => apiPost<ProjectSummary>("/api/v1/projects", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useStartRender(pid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RenderBody) =>
      apiPost<RenderAccepted>(`/api/v1/projects/${encodeURIComponent(pid)}/renders`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.jobs(pid) }),
  });
}

function renderJobsQuery(pid: string) {
  return {
    queryKey: queryKeys.jobs(pid),
    queryFn: () => apiFetch<Job[]>(`/api/v1/jobs?project=${encodeURIComponent(pid)}&kind=render`),
  };
}

/** Standalone render jobs of one project (not export units), newest first; kept fresh by useAgentEvents. */
export function useJobs(pid: string) {
  return useQuery({
    ...renderJobsQuery(pid),
    // The API has no filter for this; export units are listed with their export.
    select: (jobs: Job[]) => jobs.filter((job) => job.export_id === null),
  });
}

/** Every render job of the project, export units included (the timeline reads clip durations from them). */
export function useAllRenderJobs(pid: string) {
  return useQuery(renderJobsQuery(pid));
}

export function useJob(jid: string | null) {
  return useQuery({
    queryKey: queryKeys.job(jid),
    queryFn: () => apiFetch<Job>(`/api/v1/jobs/${encodeURIComponent(jid ?? "")}`),
    enabled: jid !== null,
  });
}

/** POST /jobs/{jid}/{action}; the response is the job as it is now. */
function useJobAction(action: "cancel" | "retry") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jid: string) => apiPost<Job>(`/api/v1/jobs/${encodeURIComponent(jid)}/${action}`, {}),
    onSuccess: (job) => {
      queryClient.setQueryData(queryKeys.job(job.id), job);
      return queryClient.invalidateQueries({ queryKey: queryKeys.jobs(job.project) });
    },
  });
}

export function useCancelJob() {
  return useJobAction("cancel");
}

/** Runs the same job again (next attempt, same revision), not a new render. */
export function useRetryJob() {
  return useJobAction("retry");
}

export function useArtifact(aid: string | null) {
  return useQuery({
    queryKey: queryKeys.artifact(aid),
    queryFn: () => apiFetch<Artifact>(`/api/v1/artifacts/${encodeURIComponent(aid ?? "")}`),
    enabled: aid !== null,
  });
}
