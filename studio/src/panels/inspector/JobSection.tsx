import { useCancelExport, useCompositeJob, useExport, useRetryExport } from "../../api/exports";
import { outputLabel } from "../../api/geometry";
import { useJob } from "../../api/hooks";
import type { Export } from "../../api/types";
import { useRenders } from "../../state/renders";
import { useStudio } from "../../state/studio";
import { ErrorText } from "../../ui/ErrorText";
import { StatusPill } from "../../ui/StatusPill";
import { DownloadLink, JobActions, JobError, RenderJobDetails } from "./JobDetails";
import { Hint, Prop, Section } from "./Section";

const EXPORT_HINTS: Record<string, string> = {
  duration_exceeded: "An export may be at most 30 minutes long. Remove or shorten clips.",
  dependency_failed: "A clip failed to render. Fix it, then retry the export.",
};

/** Clips rendered so far, and the composite's measured percentage once it reports one. */
function ExportProgress({ exp }: { exp: Export }) {
  const composite = useCompositeJob(exp.status === "running" ? exp.composite_job_id : null);
  const pct = composite.data?.progress.pct ?? null;
  return (
    <Prop label="Clips">
      <span className="font-mono">
        {exp.units_done}/{exp.units_total}
      </span>
      {pct !== null && <span className="ml-2 font-mono">{pct.toFixed(0)}%</span>}
    </Prop>
  );
}

function ExportDetails({ eid }: { eid: string }) {
  const exp = useExport(eid);
  const cancel = useCancelExport();
  const retry = useRetryExport();
  const offline = !useStudio().connected;
  if (exp.error) return <ErrorText error={exp.error} />;
  if (!exp.data) return null;
  const e = exp.data;
  const hint = e.error_code ? EXPORT_HINTS[e.error_code] : undefined;
  return (
    <section aria-label="Export status" className="space-y-2.5">
      <StatusPill status={e.status} />
      <Prop label="Sequence">{e.composition}</Prop>
      <Prop label="Output">
        {e.format} · {outputLabel(e)}
      </Prop>
      <ExportProgress exp={e} />
      {e.error && <JobError code={e.error_code} message={e.error} hint={hint} />}
      <JobActions
        status={e.status}
        pending={cancel.isPending || retry.isPending}
        offline={offline}
        onCancel={() => cancel.mutate(e.id)}
        onRetry={() => retry.mutate(e.id)}
      />
      {e.status === "completed" && <DownloadLink artifactId={e.artifact_id} offline={offline} />}
    </section>
  );
}

function RenderDetails({ jid }: { jid: string }) {
  const job = useJob(jid);
  const { actions } = useRenders();
  const { connected } = useStudio();
  if (job.error) return <ErrorText error={job.error} />;
  if (!job.data) return null;
  return (
    <section aria-label="Render job" className="space-y-2.5">
      <RenderJobDetails
        job={job.data}
        pending={actions.pending}
        offline={!connected}
        onCancel={() => actions.cancel(jid)}
        onRetry={() => actions.retry(jid)}
      />
      {actions.error && <ErrorText error={actions.error} />}
    </section>
  );
}

/** Inspector ▸ Job: the render or export shown in the Program Monitor. */
export function JobSection() {
  const { source } = useRenders();
  return (
    <Section title="Job">
      {!source && <Hint>No render yet.</Hint>}
      {source?.kind === "job" && <RenderDetails key={source.id} jid={source.id} />}
      {source?.kind === "export" && <ExportDetails key={source.id} eid={source.id} />}
    </Section>
  );
}
