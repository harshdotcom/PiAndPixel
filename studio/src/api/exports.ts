import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost } from "./client";
import { queryKeys } from "./queryKeys";
import type { CompositeJob, Export, ExportAccepted, ExportBody } from "./types";

/** Exports of one project, newest first; kept fresh by useAgentEvents. */
export function useExports(pid: string) {
  return useQuery({
    queryKey: queryKeys.exports(pid),
    queryFn: () => apiFetch<Export[]>(`/api/v1/exports?project=${encodeURIComponent(pid)}`),
  });
}

export function useExport(eid: string | null) {
  return useQuery({
    queryKey: queryKeys.export(eid),
    queryFn: () => apiFetch<Export>(`/api/v1/exports/${encodeURIComponent(eid ?? "")}`),
    enabled: eid !== null,
  });
}

/** The export's composite job, for its measured progress (patched by job.progress events). */
export function useCompositeJob(jid: string | null) {
  return useQuery({
    queryKey: queryKeys.job(jid),
    queryFn: () => apiFetch<CompositeJob>(`/api/v1/jobs/${encodeURIComponent(jid ?? "")}`),
    enabled: jid !== null,
  });
}

export function useStartExport(pid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // A fresh key per click: the Agent dedupes a resent request, never two separate clicks.
    mutationFn: (body: ExportBody) =>
      apiPost<ExportAccepted>(`/api/v1/projects/${encodeURIComponent(pid)}/exports`, body, {
        "Idempotency-Key": crypto.randomUUID(),
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.exports(pid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.jobs(pid) }),
      ]),
  });
}

function useExportAction(action: "cancel" | "retry") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eid: string) =>
      apiPost<Export>(`/api/v1/exports/${encodeURIComponent(eid)}/${action}`, {}),
    onSuccess: (exp) => {
      queryClient.setQueryData(queryKeys.export(exp.id), exp);
      return queryClient.invalidateQueries({ queryKey: queryKeys.exports(exp.project) });
    },
  });
}

export function useCancelExport() {
  return useExportAction("cancel");
}

export function useRetryExport() {
  return useExportAction("retry");
}
