// The Renders bin's rows: scene renders and exports merged into one newest-first list.

import { outputBadge } from "../../api/geometry";
import type { Export, Job, JobStatus } from "../../api/types";
import type { MonitorSource } from "../../state/renders";
import { sceneName } from "../../state/studio";

export interface BinItem {
  kind: "render" | "export";
  id: string;
  name: string;
  /** Format and output, e.g. "landscape · 480p@15". */
  detail: string;
  badge: string;
  status: JobStatus;
  createdAt: string;
  artifactId: string | null;
  source: MonitorSource;
}

function fromJob(job: Job): BinItem {
  return {
    kind: "render",
    id: job.id,
    name: sceneName(job.request.scene),
    detail: job.request.format,
    badge: outputBadge(job.request),
    status: job.status,
    createdAt: job.created_at,
    artifactId: job.artifact_id,
    source: { kind: "job", id: job.id },
  };
}

function fromExport(exp: Export): BinItem {
  return {
    kind: "export",
    id: exp.id,
    name: exp.composition,
    detail: `${exp.format} · ${exp.units_done}/${exp.units_total} clips`,
    badge: outputBadge(exp),
    status: exp.status,
    createdAt: exp.created_at,
    artifactId: exp.artifact_id,
    source: { kind: "export", id: exp.id },
  };
}

/** Renders and exports, newest first (ISO timestamps sort as text). */
export function binItems(jobs: Job[], exports: Export[]): BinItem[] {
  const items = [...jobs.map(fromJob), ...exports.map(fromExport)];
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
