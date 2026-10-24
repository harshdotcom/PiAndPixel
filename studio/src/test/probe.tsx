import { useEffect } from "react";
import { useRenders, type MonitorSource } from "../state/renders";

/** Puts `show` in the Program Monitor on mount, and prints what the monitor shows. */
export function MonitorProbe({ show }: { show?: MonitorSource }) {
  const renders = useRenders();
  const { show: setSource } = renders;
  useEffect(() => {
    if (show) setSource(show);
  }, [show, setSource]);
  const { source } = renders;
  return <output aria-label="monitor source">{source ? `${source.kind}:${source.id}` : "none"}</output>;
}
