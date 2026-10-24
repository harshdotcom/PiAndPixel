// Mirrors the Agent's /api/v1 JSON exactly (see the shared contract).

export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown };
}

export type ToolName = "manim" | "ffmpeg" | "ffprobe" | "latex";

export interface ToolInfo {
  available: boolean;
  version: string | null;
  path: string | null;
}

export interface AgentInfo {
  version: string;
  target: "local" | "colab" | "docker";
  os: string;
  cpu_count: number;
  ram_total_mb: number;
  ram_free_mb: number;
  disk_free_mb: number;
  python: string;
  tools: Record<ToolName, ToolInfo>;
  features: { terminal: boolean };
  render_options: RenderOptions;
}

export interface ResolutionOption {
  id: string;
  /** Pixels of the format's short edge, e.g. 720 for "720p". */
  short_edge: number;
}

/** The output choices the Agent accepts (GET /agent → render_options). */
export interface RenderOptions {
  resolutions: ResolutionOption[];
  fps: number[];
  max_long_edge: number;
  default: { resolution: string; fps: number };
}

export type TemplateId = "pythagoras" | "blank";

export interface Template {
  id: TemplateId;
  name: string;
  description: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  error: string | null;
}

export interface CreateProjectBody {
  name: string;
  template: TemplateId;
  description: string | null;
}

export interface FormatInfo {
  width: number;
  height: number;
  fps: number;
}

export interface Clip {
  scene: string;
  params: Record<string, unknown>;
}

export interface Composition {
  title: string | null;
  clips: Clip[];
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string;
  formats: Record<string, FormatInfo>;
  compositions: Record<string, Composition>;
}

export interface SceneInfo {
  ref: string;
  file: string;
  class_name: string;
  line: number;
}

export interface DiscoveryError {
  file: string;
  line: number | null;
  message: string;
}

export interface ScenesResponse {
  scenes: SceneInfo[];
  errors: DiscoveryError[];
}

export type Quality = "draft" | "preview" | "final";

/** What the user picks for a render or export: the short edge and the frame rate. */
export interface OutputChoice {
  resolution: string;
  fps: number;
}

export interface RenderBody extends OutputChoice {
  scene: string;
  format: string;
  params: Record<string, unknown>;
}

export interface RenderAccepted {
  job_id: string;
  revision_id: string;
}

export type JobKind = "render" | "composite";

export type JobStatus =
  | "queued"
  | "blocked"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "interrupted";

export interface JobRequest {
  scene: string;
  format: string;
  quality: Quality;
  /** Missing on jobs queued before resolution/fps could be chosen. */
  resolution?: string;
  params: Record<string, unknown>;
  width: number;
  height: number;
  fps: number;
}

export interface CompositeClip {
  scene: string;
  params: Record<string, unknown>;
  unit_job_id: string;
}

export interface CompositeRequest {
  composition: string;
  format: string;
  quality: Quality;
  resolution?: string;
  width: number;
  height: number;
  fps: number;
  clips: CompositeClip[];
}

export interface JobAttempt {
  n: number;
  status: JobStatus;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  error: string | null;
}

interface JobFields {
  id: string;
  project: string;
  status: JobStatus;
  priority: number;
  revision_id: string | null;
  export_id: string | null;
  depends_on: string[];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  attempt: number;
  attempts: JobAttempt[];
  error: string | null;
  error_code: string | null;
  log_tail: string[];
  progress: { animations_done: number; pct: number | null };
  artifact_id: string | null;
}

/** A scene render (GET /jobs?kind=render). */
export interface Job extends JobFields {
  kind: "render";
  request: JobRequest;
}

export interface CompositeJob extends JobFields {
  kind: "composite";
  request: CompositeRequest;
}

export type AnyJob = Job | CompositeJob;

export interface Artifact {
  id: string;
  kind: "scene_clip" | "export";
  project: string;
  width: number;
  height: number;
  fps: number;
  duration_s: number;
  sha256: string;
  created_at: string;
  meta: Record<string, unknown>;
  stream_url: string;
  download_url: string;
}

export type FileType = "file" | "dir";

export interface FileEntry {
  path: string;
  type: FileType;
  size: number | null;
}

export interface FileTree {
  entries: FileEntry[];
}

export interface FileContent {
  path: string;
  content: string;
  etag: string;
}

export interface FileSaved {
  path: string;
  etag: string;
}

export interface CreateFileBody {
  path: string;
  content: string;
}

export interface SaveFileBody {
  content: string;
}

export interface RenameFileBody {
  from: string;
  to: string;
}

export interface Revision {
  id: string;
  created_at: string;
  file_count: number;
  total_bytes: number;
}

export interface CompositionsResponse {
  compositions: Record<string, Composition>;
  etag: string;
}

export interface PutCompositionsBody {
  compositions: Record<string, Composition>;
}

export interface ExportBody extends OutputChoice {
  composition: string;
  format: string;
}

export interface ExportAccepted {
  export_id: string;
  job_ids: string[];
  revision_id: string;
}

export interface Export {
  id: string;
  project: string;
  composition: string;
  format: string;
  quality: Quality;
  /** null on exports started before resolution/fps could be chosen. */
  resolution: string | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  status: JobStatus;
  revision_id: string;
  created_at: string;
  finished_at: string | null;
  units_total: number;
  units_done: number;
  unit_job_ids: string[];
  composite_job_id: string;
  artifact_id: string | null;
  error: string | null;
  error_code: string | null;
}
