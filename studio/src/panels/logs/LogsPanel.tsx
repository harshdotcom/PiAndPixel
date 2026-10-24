import { ArrowDownToLine, Eraser, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCompositeJob, useExport } from "../../api/exports";
import { useFileTree } from "../../api/files";
import { useJob } from "../../api/hooks";
import type { JobStatus } from "../../api/types";
import { useRenders } from "../../state/renders";
import { useStudio } from "../../state/studio";
import { IconButton } from "../../ui/Button";
import { fieldClass } from "../../ui/Select";
import { LogLines } from "./LogLines";

/** The project's file paths, for deciding which traceback references are links. */
function useProjectFiles(pid: string): ReadonlySet<string> {
  const tree = useFileTree(pid);
  return useMemo(() => new Set(tree.data?.entries.filter((e) => e.type === "file").map((e) => e.path)), [tree.data]);
}

/** The log of what the monitor shows: the render job, or an export's composite job. */
function useShownLog() {
  const { source } = useRenders();
  const exp = useExport(source?.kind === "export" ? source.id : null).data;
  const render = useJob(source?.kind === "job" ? source.id : null).data;
  const composite = useCompositeJob(exp?.composite_job_id ?? null).data;
  const job = render ?? composite;
  return { id: job?.id ?? null, lines: job?.log_tail ?? [], status: job?.status ?? null };
}

function placeholder(status: JobStatus | null): string {
  if (status === null) return "Render a scene to see its log.";
  if (status === "queued") return "Waiting for the render slot…";
  if (status === "blocked") return "Waiting on a failed dependency.";
  return "No output yet.";
}

/** Lines after the one that was last when the user pressed Clear. */
function afterClear(lines: string[], clearedAfter: string | null): string[] {
  if (clearedAfter === null) return lines;
  const index = lines.lastIndexOf(clearedAfter);
  return index === -1 ? lines : lines.slice(index + 1);
}

/** Logs (bottom dock): the live job log with clickable tracebacks, a filter, Follow and Clear. */
export function LogsPanel({ active = true }: { active?: boolean }) {
  const { pid } = useStudio();
  const projectFiles = useProjectFiles(pid);
  const log = useShownLog();
  const [filter, setFilter] = useState("");
  const [follow, setFollow] = useState(true);
  const [cleared, setCleared] = useState<{ job: string | null; after: string | null }>({ job: null, after: null });
  const pre = useRef<HTMLPreElement>(null);
  const visible = afterClear(log.lines, cleared.job === log.id ? cleared.after : null);
  const query = filter.trim().toLowerCase();
  const shown = query ? visible.filter((l) => l.toLowerCase().includes(query)) : visible;

  // Also when the tab comes to the front or the box resizes: scrolling a `display: none` box does nothing.
  const lines = shown.length;
  useEffect(() => {
    const el = pre.current;
    if (!follow || !active || !el) return;
    const toBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    toBottom();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(toBottom);
    observer.observe(el);
    return () => observer.disconnect();
  }, [follow, active, lines, log.id]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2">
        <label className="relative flex items-center">
          <Search size={12} className="pointer-events-none absolute left-2 text-fg-3" aria-hidden />
          <input aria-label="Filter log" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} className={`${fieldClass} w-48 pl-6`} />
        </label>
        <span className="flex-1" />
        <IconButton icon={ArrowDownToLine} label="Follow" active={follow} onClick={() => setFollow(!follow)} />
        <IconButton icon={Eraser} label="Clear" onClick={() => setCleared({ job: log.id, after: log.lines.at(-1) ?? null })} />
      </div>
      <pre ref={pre} aria-label="Render log" className="min-h-0 flex-1 overflow-auto bg-sunken px-3 py-2 font-mono text-xs leading-[18px] whitespace-pre text-fg-2">
        {shown.length > 0 ? <LogLines lines={shown} projectFiles={projectFiles} /> : <span className="text-fg-3">{placeholder(log.status)}</span>}
      </pre>
    </div>
  );
}
