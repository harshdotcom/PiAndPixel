import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { wsUrl } from "./client";
import { queryKeys } from "./queryKeys";
import type { AgentEvent } from "./messages";
import type { AnyJob } from "./types";

export const MIN_RECONNECT_MS = 1000;
export const MAX_RECONNECT_MS = 10_000;
const LOG_TAIL = 50;

/** The fields each event type must carry as strings; anything else is ignored. */
const REQUIRED_STRINGS: Record<AgentEvent["type"], string[]> = {
  "job.status": ["job_id", "project", "status"],
  "job.log": ["job_id", "project", "line"],
  "job.progress": ["job_id", "project", "kind"],
  "export.status": ["export_id", "project", "status"],
};

/** Parses one text frame; null for invalid JSON, unknown types or missing fields. */
export function parseEvent(data: unknown): AgentEvent | null {
  if (typeof data !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string" || !Object.hasOwn(REQUIRED_STRINGS, type)) return null;
  const fields = REQUIRED_STRINGS[type as AgentEvent["type"]];
  if (!fields.every((field) => typeof record[field] === "string")) return null;
  if (type === "job.log" && typeof record.attempt !== "number") return null;
  return record as unknown as AgentEvent;
}

function patchJob(client: QueryClient, jid: string, patch: (job: AnyJob) => AnyJob): void {
  client.setQueryData<AnyJob>(queryKeys.job(jid), (job) => (job ? patch(job) : job));
}

/** Applies one event to the React Query cache. */
export function applyEvent(client: QueryClient, event: AgentEvent): void {
  switch (event.type) {
    case "job.log":
      // A line of another attempt belongs to a log this cache entry does not show.
      patchJob(client, event.job_id, (job) =>
        job.attempt === event.attempt
          ? { ...job, log_tail: [...job.log_tail, event.line].slice(-LOG_TAIL) }
          : job,
      );
      return;
    case "job.progress":
      patchJob(client, event.job_id, (job) => ({
        ...job,
        progress:
          event.kind === "render"
            ? { ...job.progress, animations_done: event.animations_done }
            : { ...job.progress, pct: event.pct },
      }));
      return;
    case "job.status":
      void client.invalidateQueries({ queryKey: queryKeys.job(event.job_id) });
      void client.invalidateQueries({ queryKey: queryKeys.jobs(event.project) });
      return;
    case "export.status":
      void client.invalidateQueries({ queryKey: queryKeys.export(event.export_id) });
      void client.invalidateQueries({ queryKey: queryKeys.exports(event.project) });
      return;
  }
}

/** Events may have been missed while disconnected, so refetch everything job-related. */
function resync(client: QueryClient): void {
  for (const prefix of ["jobs", "job", "exports", "export"]) {
    void client.invalidateQueries({ queryKey: [prefix] });
  }
}

/**
 * One WebSocket to /api/v1/events for the whole Studio; applies events to the React Query
 * cache (see queryKeys) and reconnects with backoff. Mounted once, in Studio.
 */
export function useAgentEvents(): { connected: boolean } {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = MIN_RECONNECT_MS;
    let stopped = false;

    function connect() {
      socket = new WebSocket(wsUrl("/api/v1/events"));
      socket.onopen = () => {
        delay = MIN_RECONNECT_MS;
        setConnected(true);
        resync(queryClient);
      };
      socket.onmessage = (message: MessageEvent) => {
        const event = parseEvent(message.data);
        if (event) applyEvent(queryClient, event);
      };
      socket.onclose = () => {
        if (stopped) return;
        setConnected(false);
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, MAX_RECONNECT_MS);
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [queryClient]);

  return { connected };
}
