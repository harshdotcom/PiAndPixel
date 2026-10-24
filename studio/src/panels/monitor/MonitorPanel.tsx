import { useEffect, useRef, useState } from "react";
import { useLayout } from "../../layout/LayoutContext";
import { PanelFrame } from "../../layout/PanelFrame";
import { isEditableTarget } from "../../layout/shortcuts";
import { useRenders } from "../../state/renders";
import { RenderFooter, SceneSelect } from "./RenderFooter";
import { Transport } from "./Transport";
import { useMonitorSource } from "./useMonitorSource";
import { useTransport, type Transport as TransportState } from "./useTransport";
import { Viewer } from "./Viewer";

const KEYS: Record<string, (t: TransportState) => void> = {
  " ": (t) => t.toggle(),
  k: (t) => t.toggle(),
  ArrowLeft: (t) => t.step(-1),
  ArrowRight: (t) => t.step(1),
  Home: (t) => t.toStart(),
  End: (t) => t.toEnd(),
};

/** Space, K, ←, →, Home and End drive the transport while the monitor is the focused panel. */
function useTransportKeys(transport: TransportState, enabled: boolean) {
  const { focused } = useLayout();
  const latest = useRef(transport);
  useEffect(() => {
    latest.current = transport;
  });
  useEffect(() => {
    if (focused !== "monitor" || !enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      const action = KEYS[e.key];
      if (!action || e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return;
      if (e.target instanceof HTMLButtonElement && e.key === " ") return;
      e.preventDefault();
      action(latest.current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused, enabled]);
}

/** The Program Monitor (Shift+4): the shown render or export with transport, and the render footer. */
export function MonitorPanel() {
  const { source, output } = useRenders();
  const view = useMonitorSource(source);
  const video = useRef<HTMLVideoElement>(null);
  const [safeAreas, setSafeAreas] = useState(false);
  const artifact = view.artifact;
  const fps = artifact?.fps ?? output.choice?.fps ?? 30;
  const transport = useTransport(video, source, fps, artifact?.id ?? null);
  useTransportKeys(transport, artifact !== null);
  const size = artifact ?? view.lastArtifact ?? output.size;
  const aspect = size ? size.width / size.height : 16 / 9;

  return (
    <PanelFrame frame="monitor" panel="monitor" subtitle={view.name} actions={<SceneSelect />}>
      <div className="flex h-full flex-col">
        <Viewer view={view} videoRef={video} aspect={aspect} loop={transport.loop} safeAreas={safeAreas} />
        <Transport transport={transport} fps={fps} disabled={artifact === null} safeAreas={safeAreas} onSafeAreas={setSafeAreas} />
        <RenderFooter />
      </div>
    </PanelFrame>
  );
}
