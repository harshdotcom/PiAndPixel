// Live elapsed time for running jobs (status bar, monitor overlay, Inspector).

import { useEffect, useState } from "react";

/** Re-renders every second while `live`, so an elapsed time stays current. */
export function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  return now;
}

/** Seconds from `started` to `finished` (or `now` while still running); null before it started. */
export function elapsedSeconds(started: string | null, finished: string | null, now: number): number | null {
  if (!started) return null;
  const end = finished ? Date.parse(finished) : now;
  return Math.max(0, (end - Date.parse(started)) / 1000);
}
