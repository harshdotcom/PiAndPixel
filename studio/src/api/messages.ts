// WebSocket messages of /api/v1/events and /api/v1/terminal (see the shared contract).

import type { JobKind, JobStatus } from "./types";

// WS /api/v1/events messages (server -> client only).

export interface JobStatusEvent {
  type: "job.status";
  job_id: string;
  project: string;
  kind: JobKind;
  export_id: string | null;
  status: JobStatus;
  attempt: number;
  error: string | null;
  error_code: string | null;
  artifact_id: string | null;
}

export interface JobLogEvent {
  type: "job.log";
  job_id: string;
  project: string;
  attempt: number;
  line: string;
}

export type JobProgressEvent =
  | { type: "job.progress"; job_id: string; project: string; kind: "render"; animations_done: number }
  | { type: "job.progress"; job_id: string; project: string; kind: "composite"; pct: number };

export interface ExportStatusEvent {
  type: "export.status";
  export_id: string;
  project: string;
  status: JobStatus;
  units_done: number;
  units_total: number;
  artifact_id: string | null;
  error: string | null;
}

export type AgentEvent = JobStatusEvent | JobLogEvent | JobProgressEvent | ExportStatusEvent;

// WS /api/v1/terminal messages (JSON text frames).

export type TerminalClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

export type TerminalServerMessage =
  | { type: "output"; data: string }
  | { type: "exit"; code: number | null };
