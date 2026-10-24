import { useState } from "react";
import { outputLabel } from "../../api/geometry";
import { canCancel, canRetry } from "../../api/hooks";
import { useCancelExport, useExports, useRetryExport } from "../../api/exports";
import type { Export } from "../../api/types";
import { ErrorText, Panel } from "../Panel";
import { ExportBadge, ExportProgress, ExportVideo } from "./ExportStatus";

interface Props {
  pid: string;
}

const SHOWN = 8;
const actionButton =
  "rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40";

interface RowProps {
  exp: Export;
  selected: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onRetry: () => void;
  pending: boolean;
}

function ExportRow({ exp, selected, onSelect, onCancel, onRetry, pending }: RowProps) {
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-1.5 text-left text-sm transition ${
          selected ? "bg-accent/15" : "hover:bg-raised"
        }`}
      >
        <ExportBadge exp={exp} />
        <span className="truncate font-medium">{exp.composition}</span>
        <span className="truncate font-mono text-xs text-muted">
          {exp.format} · {outputLabel(exp)}
        </span>
        <ExportProgress exp={exp} />
        <span className="ml-auto shrink-0 text-xs text-muted">
          {new Date(exp.created_at).toLocaleString()}
        </span>
      </button>
      {canCancel(exp.status) && (
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className={`${actionButton} border-error/50 text-error hover:bg-error/10`}
        >
          Cancel
        </button>
      )}
      {canRetry(exp.status) && (
        <button
          type="button"
          disabled={pending}
          onClick={onRetry}
          className={`${actionButton} border-accent/50 text-accent hover:bg-accent/10`}
        >
          Retry
        </button>
      )}
    </li>
  );
}

/** The project's exports, newest first, with status, cancel/retry and the video when done. */
export function RecentExports({ pid }: Props) {
  const exports = useExports(pid);
  const cancelExport = useCancelExport();
  const retryExport = useRetryExport();
  const [selected, setSelected] = useState<string | null>(null);
  const pending = cancelExport.isPending || retryExport.isPending;
  const actionError = cancelExport.error ?? retryExport.error;
  const shown = exports.data?.find((e) => e.id === selected);

  return (
    <Panel title="Recent exports">
      {exports.error && <ErrorText error={exports.error} />}
      {exports.data?.length === 0 && <p className="text-sm text-muted">No exports yet.</p>}
      {exports.data && exports.data.length > 0 && (
        <ul aria-label="Recent exports" className="space-y-1">
          {exports.data.slice(0, SHOWN).map((exp) => (
            <ExportRow
              key={exp.id}
              exp={exp}
              selected={exp.id === selected}
              onSelect={() => setSelected(exp.id)}
              onCancel={() => cancelExport.mutate(exp.id)}
              onRetry={() => retryExport.mutate(exp.id)}
              pending={pending}
            />
          ))}
        </ul>
      )}
      {actionError && <ErrorText error={actionError} />}
      {shown?.status === "completed" && shown.artifact_id && (
        <div className="mt-4">
          <ExportVideo artifactId={shown.artifact_id} />
        </div>
      )}
    </Panel>
  );
}
