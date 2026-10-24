// Toasts when a render or export finishes (docs/ui-design.md §3, Motion ▸ Toasts).

import { useEffect, useRef } from "react";
import { useExports } from "../api/exports";
import type { JobStatus } from "../api/types";
import { showToast } from "../ui/Toast";
import type { MonitorSource } from "./renders";
import { useRenders } from "./renders";
import { sceneName } from "./studio";

const UNFINISHED: JobStatus[] = ["queued", "running", "blocked"];
const FAILED: JobStatus[] = ["failed", "timed_out"];

export interface Watched {
  key: string;
  status: JobStatus;
  title: string;
  source: MonitorSource;
}

/** Items that just went from unfinished to completed or failed, given their previous statuses. */
export function finished(previous: ReadonlyMap<string, JobStatus>, current: Watched[]): Watched[] {
  return current.filter((item) => {
    const before = previous.get(item.key);
    return before !== undefined && UNFINISHED.includes(before) && (item.status === "completed" || FAILED.includes(item.status));
  });
}

/** Shows a toast with a "Show" action (open it in the Program Monitor) when one finishes. */
export function useCompletionToasts(pid: string) {
  const { jobs, show } = useRenders();
  const exports = useExports(pid);
  const seen = useRef(new Map<string, JobStatus>());
  useEffect(() => {
    const items: Watched[] = [
      ...(jobs.data ?? []).map((j) => ({ key: `job:${j.id}`, status: j.status, title: sceneName(j.request.scene), source: { kind: "job" as const, id: j.id } })),
      ...(exports.data ?? []).map((e) => ({ key: `export:${e.id}`, status: e.status, title: e.composition, source: { kind: "export" as const, id: e.id } })),
    ];
    for (const item of finished(seen.current, items)) {
      const ok = item.status === "completed";
      const what = item.source.kind === "job" ? "Render" : "Export";
      showToast({
        kind: ok ? "success" : "error",
        title: `${what} ${ok ? "completed" : "failed"}: ${item.title}`,
        action: { label: "Show", onClick: () => show(item.source) },
      });
    }
    seen.current = new Map(items.map((i) => [i.key, i.status]));
  }, [jobs.data, exports.data, show]);
}
