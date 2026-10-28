import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiPut } from "./client";
import type { NarrationAudioClip, NarrationDocument, ProviderStatus } from "./types";

function narrationUrl(pid: string, composition: string): string {
  const query = new URLSearchParams({ composition });
  return `/api/v1/projects/${encodeURIComponent(pid)}/narration?${query}`;
}

export function useProviderStatus() {
  return useQuery({ queryKey: ["providers"], queryFn: () => apiFetch<ProviderStatus>("/api/v1/providers") });
}

export function useNarration(pid: string, composition: string | null) {
  return useQuery({
    queryKey: ["narration", pid, composition],
    queryFn: () => apiFetch<NarrationDocument>(narrationUrl(pid, composition ?? "")),
    enabled: Boolean(composition),
  });
}

export function useDraftNarration(pid: string) {
  return useMutation({
    mutationFn: (body: { composition: string; context: string; target_seconds: number }) =>
      apiPost<{ text: string }>(
        `/api/v1/projects/${encodeURIComponent(pid)}/narration/draft`, body,
      ),
  });
}

export function useSaveNarration(pid: string, composition: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      apiPut<NarrationDocument>(`${narrationUrl(pid, composition)}`, { text }),
    onSuccess: (data) => client.setQueryData(["narration", pid, composition], data),
  });
}

export function useSynthesizeNarration(pid: string, composition: string) {
  const client = useQueryClient();
  const query = new URLSearchParams({ composition });
  return useMutation({
    mutationFn: (voice: string) =>
      apiPost<NarrationDocument>(
        `/api/v1/projects/${encodeURIComponent(pid)}/narration/synthesize?${query}`,
        { voice },
      ),
    onSuccess: (data) => client.setQueryData(["narration", pid, composition], data),
  });
}

export function useAlignNarration(pid: string, composition: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (segmentId: string) => {
      const query = new URLSearchParams({ composition, segment_id: segmentId });
      return apiPost<NarrationDocument>(
        `/api/v1/projects/${encodeURIComponent(pid)}/narration/align?${query}`,
        {},
      );
    },
    onSuccess: (data) => client.setQueryData(["narration", pid, composition], data),
  });
}

export function useSaveNarrationTiming(pid: string, composition: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ segmentId, words }: { segmentId: string; words: { text: string; start: number; end: number }[] }) => {
      const query = new URLSearchParams({ composition, segment_id: segmentId });
      return apiPut<NarrationDocument>(
        `/api/v1/projects/${encodeURIComponent(pid)}/narration/timing?${query}`,
        { words },
      );
    },
    onSuccess: (data) => client.setQueryData(["narration", pid, composition], data),
  });
}

export function useSaveNarrationOffset(pid: string, composition: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ segmentId, start_offset_s }: { segmentId: string; start_offset_s: number }) => {
      const query = new URLSearchParams({ composition, segment_id: segmentId });
      return apiPut<NarrationDocument>(
        `/api/v1/projects/${encodeURIComponent(pid)}/narration/offset?${query}`,
        { start_offset_s },
      );
    },
    onSuccess: (data) => client.setQueryData(["narration", pid, composition], data),
  });
}

export function useSaveNarrationTimeline(pid: string, composition: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (clips: NarrationAudioClip[]) => {
      const query = new URLSearchParams({ composition });
      return apiPut<NarrationDocument>(
        `/api/v1/projects/${encodeURIComponent(pid)}/narration/timeline?${query}`,
        { clips },
      );
    },
    onSuccess: (data) => client.setQueryData(["narration", pid, composition], data),
  });
}
