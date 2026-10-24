import type { JobStatus } from "../api/types";

export const STATUS_STYLE: Record<JobStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-warn/15 text-warn" },
  blocked: { label: "Blocked", className: "bg-warn/15 text-warn" },
  running: { label: "Running", className: "bg-accent/15 text-accent" },
  completed: { label: "Completed", className: "bg-ok/15 text-ok" },
  failed: { label: "Failed", className: "bg-record/15 text-record" },
  timed_out: { label: "Timed out", className: "bg-record/15 text-record" },
  cancelled: { label: "Cancelled", className: "bg-fg-3/20 text-fg-2" },
  interrupted: { label: "Interrupted", className: "bg-warn/15 text-warn" },
};

/** A job or export status as a small coloured pill. */
export function StatusPill({ status }: { status: JobStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex h-[18px] shrink-0 items-center rounded-[4px] px-1.5 text-2xs font-semibold tracking-wide uppercase ${style.className}`}>
      {style.label}
    </span>
  );
}

/** "480p@15", the output badge used on renders and exports. */
export function OutputBadge({ text }: { text: string }) {
  return (
    <span className="tabular inline-flex h-[18px] shrink-0 items-center rounded-[4px] border border-line px-1.5 font-mono text-2xs text-fg-2">
      {text}
    </span>
  );
}
