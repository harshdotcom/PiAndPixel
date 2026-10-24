import { useCompositeJob } from "../../api/exports";
import { outputLabel } from "../../api/geometry";
import { useArtifact } from "../../api/hooks";
import type { Export } from "../../api/types";
import { STATUS_STYLE } from "../JobPanel";
import { ErrorText } from "../Panel";
import { VideoPlayer } from "../VideoPlayer";

const ERROR_HINTS: Record<string, string> = {
  duration_exceeded: "An export may be at most 30 minutes long. Remove or shorten clips.",
  dependency_failed: "A clip failed to render. Fix it, then retry the export.",
};

export function ExportBadge({ exp }: { exp: Export }) {
  const style = STATUS_STYLE[exp.status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.className}`}>
      {style.label}
    </span>
  );
}

/** Rendered clips so far, and the composite's measured progress once it reports one. */
export function ExportProgress({ exp }: { exp: Export }) {
  const composite = useCompositeJob(exp.status === "running" ? exp.composite_job_id : null);
  const pct = composite.data?.progress.pct ?? null;
  return (
    <span className="text-muted">
      Clips{" "}
      <span className="font-mono text-white">
        {exp.units_done}/{exp.units_total}
      </span>
      {pct !== null && <span className="ml-2 font-mono text-white">{pct.toFixed(0)}%</span>}
    </span>
  );
}

export function ExportVideo({ artifactId }: { artifactId: string }) {
  const artifact = useArtifact(artifactId);
  if (artifact.error) return <ErrorText error={artifact.error} />;
  return artifact.data ? <VideoPlayer artifact={artifact.data} /> : null;
}

/** Status, progress, error and (when completed) the video of one export. */
export function ExportStatus({ exp }: { exp: Export }) {
  const hint = exp.error_code ? ERROR_HINTS[exp.error_code] : undefined;
  return (
    <section aria-label="Export status" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <ExportBadge exp={exp} />
        <span className="font-mono text-xs text-muted">
          {exp.composition} · {exp.format} · {outputLabel(exp)}
        </span>
        <ExportProgress exp={exp} />
      </div>
      {exp.error && (
        <div role="alert" className="space-y-1 rounded-md border border-error/40 bg-error/5 p-3 text-sm text-error">
          <p className="font-mono">{exp.error}</p>
          {hint && <p>{hint}</p>}
        </div>
      )}
      {exp.status === "completed" && exp.artifact_id && <ExportVideo artifactId={exp.artifact_id} />}
    </section>
  );
}
