// React Query hooks for the project file API (R-01, R-02).

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { apiDelete, apiFetch, apiPost, apiPut, encodePath } from "./client";
import { queryKeys } from "./queryKeys";
import type { CreateFileBody, FileContent, FileSaved, FileTree, RenameFileBody } from "./types";

function filesUrl(pid: string): string {
  return `/api/v1/projects/${encodeURIComponent(pid)}/files`;
}

function fileUrl(pid: string, path: string): string {
  return `${filesUrl(pid)}/${encodePath(path)}`;
}

export function fetchFile(pid: string, path: string): Promise<FileContent> {
  return apiFetch<FileContent>(fileUrl(pid, path));
}

/** Refresh whatever a change to these paths can affect (Car contract §7.3). */
function invalidateAfterChange(client: QueryClient, pid: string, paths: string[]): void {
  void client.invalidateQueries({ queryKey: queryKeys.files(pid) });
  if (paths.some((p) => p.endsWith(".py"))) {
    void client.invalidateQueries({ queryKey: queryKeys.scenes(pid) });
  }
  if (paths.includes("pnp.yaml")) {
    void client.invalidateQueries({ queryKey: queryKeys.project(pid) });
    void client.invalidateQueries({ queryKey: queryKeys.compositions(pid) });
    void client.invalidateQueries({ queryKey: queryKeys.scenes(pid) });
  }
}

export function useFileTree(pid: string) {
  return useQuery({
    queryKey: queryKeys.files(pid),
    queryFn: () => apiFetch<FileTree>(filesUrl(pid)),
    refetchOnWindowFocus: true, // files may change in another tab, the terminal or an editor
  });
}

export const REFRESH_DELAY_MS = 1000;

/**
 * A callback for "files may have changed outside the Studio" (e.g. terminal output): once
 * it has been quiet for REFRESH_DELAY_MS, the file tree, scenes and compositions are refetched.
 * Open editor tabs are left alone; their etag keeps a save from overwriting such changes.
 */
export function useRefreshProjectLists(pid: string): () => void {
  const client = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      for (const key of [queryKeys.files(pid), queryKeys.scenes(pid), queryKeys.compositions(pid)]) {
        void client.invalidateQueries({ queryKey: key });
      }
      void client.invalidateQueries({ queryKey: queryKeys.project(pid) });
    }, REFRESH_DELAY_MS);
  }, [client, pid]);
}

/**
 * One file as last loaded from disk. Never refetched behind the editor's back: the etag must
 * stay the one the user's edits are based on, or a save could silently overwrite disk changes.
 */
export function useFile(pid: string, path: string) {
  return useQuery({
    queryKey: queryKeys.file(pid, path),
    queryFn: () => fetchFile(pid, path),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useCreateFile(pid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFileBody) => apiPost<FileSaved>(filesUrl(pid), body),
    onSuccess: (saved, body) => {
      client.setQueryData<FileContent>(queryKeys.file(pid, saved.path), {
        path: saved.path,
        content: body.content,
        etag: saved.etag,
      });
      invalidateAfterChange(client, pid, [saved.path]);
    },
  });
}

export interface SaveFileVars {
  path: string;
  content: string;
  /** The etag the edits are based on; null overwrites whatever is on disk now. */
  etag: string | null;
}

/** PUT with If-Match; a stale etag fails with ApiError status 412, code "conflict". */
export function useSaveFile(pid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, content, etag }: SaveFileVars) => {
      const match = etag ?? (await fetchFile(pid, path)).etag;
      return apiPut<FileSaved>(fileUrl(pid, path), { content }, { "If-Match": `"${match}"` });
    },
    onSuccess: (saved, { content }) => {
      client.setQueryData<FileContent>(queryKeys.file(pid, saved.path), {
        path: saved.path,
        content,
        etag: saved.etag,
      });
      invalidateAfterChange(client, pid, [saved.path]);
    },
  });
}

export function useRenameFile(pid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RenameFileBody) => apiPost<FileSaved>(`${filesUrl(pid)}/rename`, body),
    onSuccess: (_saved, body) => {
      client.removeQueries({ queryKey: queryKeys.file(pid, body.from), exact: true });
      invalidateAfterChange(client, pid, [body.from, body.to]);
    },
  });
}

/** Reads the current etag first, so it deletes exactly the file the user confirmed. */
export function useDeleteFile(pid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const { etag } = await fetchFile(pid, path);
      await apiDelete(fileUrl(pid, path), { "If-Match": `"${etag}"` });
    },
    onSuccess: (_void, path) => {
      client.removeQueries({ queryKey: queryKeys.file(pid, path), exact: true });
      invalidateAfterChange(client, pid, [path]);
    },
  });
}
