import { useState } from "react";
import { useExport, useStartExport } from "../../api/exports";
import type { FormatInfo } from "../../api/types";
import { ErrorText, Panel } from "../Panel";
import { useOutputControls } from "../RenderControls";
import { ExportStatus } from "./ExportStatus";

interface Props {
  pid: string;
  composition: string | null;
  formats: Record<string, FormatInfo>;
  /** The composition editor has unsaved changes; an export would use the saved pnp.yaml. */
  unsaved?: boolean;
}

function StartedExport({ eid }: { eid: string }) {
  const exp = useExport(eid);
  if (exp.error) return <ErrorText error={exp.error} />;
  return exp.data ? <ExportStatus exp={exp.data} /> : null;
}

/** Format + resolution + fps + "Export" for the selected composition, and the running export's status. */
export function ExportPanel({ pid, composition, formats, unsaved = false }: Props) {
  const startExport = useStartExport(pid);
  const { format, choice, ready, controls } = useOutputControls(pid, "export", formats);
  const [exportId, setExportId] = useState<string | null>(null);

  function start() {
    if (!composition || !choice) return;
    startExport.mutate(
      { composition, format, ...choice },
      { onSuccess: ({ export_id }) => setExportId(export_id) },
    );
  }

  return (
    <Panel title="Export">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          {controls}
          <button
            type="button"
            disabled={!composition || !format || !ready || unsaved || startExport.isPending}
            onClick={start}
            className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-40"
          >
            Export
          </button>
        </div>
        {!composition && <p className="text-sm text-muted">Select a composition to export it.</p>}
        {composition && unsaved && (
          <p className="text-sm text-warning">
            Save the composition first: Export uses the saved version.
          </p>
        )}
        {startExport.error && <ErrorText error={startExport.error} />}
        {exportId && <StartedExport key={exportId} eid={exportId} />}
      </div>
    </Panel>
  );
}
