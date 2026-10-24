import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "../../api/client";
import { useAllRenderJobs } from "../../api/hooks";
import { queryKeys } from "../../api/queryKeys";
import type { Artifact, Job } from "../../api/types";

/** The newest completed render of each scene (jobs come newest first), as scene → artifact id. */
export function latestArtifacts(jobs: Job[], scenes: string[]): Map<string, string> {
  const wanted = new Set(scenes);
  const found = new Map<string, string>();
  for (const job of jobs) {
    const scene = job.request.scene;
    if (wanted.has(scene) && !found.has(scene) && job.status === "completed" && job.artifact_id) {
      found.set(scene, job.artifact_id);
    }
  }
  return found;
}

/**
 * Each scene's last-known rendered duration in seconds, from existing data: the newest completed
 * render job of the scene (standalone or an export unit) and its artifact's duration.
 */
export function useSceneDurations(pid: string, scenes: string[]): ReadonlyMap<string, number> {
  const jobs = useAllRenderJobs(pid);
  const key = scenes.join("\n");
  const artifacts = useMemo(
    () => latestArtifacts(jobs.data ?? [], key ? key.split("\n") : []),
    [jobs.data, key],
  );
  const entries = [...artifacts];
  const results = useQueries({
    queries: entries.map(([, aid]) => ({
      queryKey: queryKeys.artifact(aid),
      queryFn: () => apiFetch<Artifact>(`/api/v1/artifacts/${encodeURIComponent(aid)}`),
      staleTime: Infinity, // an artifact never changes
    })),
  });
  const durations = new Map<string, number>();
  entries.forEach(([scene], i) => {
    const artifact = results[i]?.data;
    if (artifact) durations.set(scene, artifact.duration_s);
  });
  return durations;
}
