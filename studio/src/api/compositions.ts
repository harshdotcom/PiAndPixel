import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPut } from "./client";
import { queryKeys } from "./queryKeys";
import type { Composition, CompositionsResponse, PutCompositionsBody } from "./types";

function compositionsUrl(pid: string): string {
  return `/api/v1/projects/${encodeURIComponent(pid)}/compositions`;
}

export function useCompositions(pid: string) {
  return useQuery({
    queryKey: queryKeys.compositions(pid),
    queryFn: () => apiFetch<CompositionsResponse>(compositionsUrl(pid)),
    refetchOnWindowFocus: true, // pnp.yaml may change outside the Studio
  });
}

export interface SaveCompositionsInput {
  compositions: Record<string, Composition>;
  /** The etag of the pnp.yaml these compositions were edited from. */
  etag: string;
}

/** Replaces every composition in pnp.yaml; a stale etag fails with 412 `conflict`. */
export function useSaveCompositions(pid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ compositions, etag }: SaveCompositionsInput) => {
      const body: PutCompositionsBody = { compositions };
      return apiPut<CompositionsResponse>(compositionsUrl(pid), body, { "If-Match": `"${etag}"` });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.compositions(pid), saved);
      return queryClient.invalidateQueries({ queryKey: queryKeys.project(pid) });
    },
  });
}
