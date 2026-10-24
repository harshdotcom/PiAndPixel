import { ListOrdered } from "lucide-react";
import type { ReactNode } from "react";
import { useCompositeJob, useExport, useExports } from "../api/exports";
import { isActive, useJob } from "../api/hooks";
import { formatDuration } from "../panels/monitor/timecode";
import { elapsedSeconds, useNow } from "../state/clock";
import { useRenders } from "../state/renders";
import { sceneName, useStudio } from "../state/studio";
import { Tooltip } from "../ui/Tooltip";

/** Title bar "Queue N": renders and exports that are queued or running. */
export function QueueCount() {
  const { pid } = useStudio();
  const { jobs } = useRenders();
  const exports = useExports(pid);
  const count =
    (jobs.data?.filter((j) => isActive(j.status)).length ?? 0) + (exports.data?.filter((e) => isActive(e.status)).length ?? 0);
  return (
    <Tooltip label="Renders and exports queued or running">
      <span className={`tabular flex h-[26px] items-center gap-1.5 rounded-[4px] px-2 text-sm ${count > 0 ? "text-accent" : "text-fg-2"}`}>
        <ListOrdered size={14} strokeWidth={1.75} aria-hidden />
        Queue <span className="font-mono">{count}</span>
      </span>
    </Tooltip>
  );
}

/** "Exporting main · 2/3 clips" (or "· joining clips") for the active export, if any. */
function ExportActivity({ fallback }: { fallback: ReactNode }) {
  const { pid } = useStudio();
  const listed = useExports(pid).data?.find((e) => isActive(e.status)) ?? null;
  const exp = useExport(listed?.id ?? null).data ?? listed;
  const composite = useCompositeJob(exp?.composite_job_id ?? null).data;
  if (!exp || !isActive(exp.status)) return fallback;
  const step = composite?.status === "running" ? "joining clips" : `${exp.units_done}/${exp.units_total} clips`;
  return (
    <>
      <span className="text-accent">Exporting {exp.composition}</span> · {step}
    </>
  );
}

/** Status bar: "Rendering Proof · 3 animations · 0:04" for the running render, else the running export. */
export function RenderActivity() {
  const { jobs } = useRenders();
  const running = jobs.data?.find((j) => j.status === "running") ?? null;
  const job = useJob(running?.id ?? null).data ?? running;
  const now = useNow(job !== null);
  if (!job) {
    const queued = jobs.data?.filter((j) => j.status === "queued").length ?? 0;
    return <ExportActivity fallback={queued > 0 ? `${queued} queued` : null} />;
  }
  const elapsed = elapsedSeconds(job.started_at, null, now);
  const n = job.progress.animations_done;
  return (
    <>
      <span className="text-accent">Rendering {sceneName(job.request.scene)}</span> · {n} animation{n === 1 ? "" : "s"} ·{" "}
      {formatDuration(elapsed ?? 0)}
    </>
  );
}
