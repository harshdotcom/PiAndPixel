import type { CSSProperties, RefObject } from "react";
import { useLayout } from "../../layout/LayoutContext";
import { Button } from "../../ui/Button";
import type { MonitorView } from "./useMonitorSource";

interface Props {
  view: MonitorView;
  videoRef: RefObject<HTMLVideoElement>;
  /** Width / height of the picture: the video's, or the render settings' before there is one. */
  aspect: number;
  loop: boolean;
  safeAreas: boolean;
}

/** Action safe (90%) and title safe (80%) frames, plus a centre cross. */
function SafeAreas() {
  const frame = "pointer-events-none absolute border border-white/45";
  return (
    <div aria-label="Safe area guides" className="pointer-events-none absolute inset-0">
      <div className={`${frame} inset-[5%]`} />
      <div className={`${frame} inset-[10%] border-dashed`} />
      <div className="absolute top-1/2 left-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white/45" />
      <div className="absolute top-1/2 left-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-white/45" />
    </div>
  );
}

export function Placeholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 select-none">
      <span aria-hidden className="text-[72px] leading-none font-semibold tracking-tight text-fg opacity-10">
        π&amp;px
      </span>
      <span className="text-sm text-fg-3">Render a scene to preview it</span>
    </div>
  );
}

function ProgressEdge({ pct }: { pct: number | null }) {
  if (pct === null) return <div role="progressbar" aria-label="Render progress" className="progress-indeterminate absolute inset-x-0 bottom-0 h-0.5 bg-accent/20" />;
  return (
    <div role="progressbar" aria-label="Render progress" aria-valuenow={Math.round(pct)} className="absolute inset-x-0 bottom-0 h-0.5 bg-accent/20">
      <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Failure({ message }: { message: string }) {
  const layout = useLayout();
  return (
    <div role="alert" className="absolute inset-x-0 bottom-0 flex items-start gap-3 bg-black/75 p-3">
      <p className="line-clamp-3 min-w-0 flex-1 font-mono text-xs text-record">{message}</p>
      <Button onClick={() => layout.focus("logs")}>Show logs</Button>
    </div>
  );
}

/** The picture area: letterboxed on #000 inside the sunken surround, at the right aspect. */
export function Viewer({ view, videoRef, aspect, loop, safeAreas }: Props) {
  const box: CSSProperties = { width: `min(100cqw - 16px, (100cqh - 16px) * ${aspect})`, aspectRatio: String(aspect) };
  const dimmed = view.activity !== null ? view.lastArtifact : null;
  return (
    <div className="relative min-h-0 flex-1 bg-sunken [container-type:size]">
      <div className="absolute inset-0 flex items-center justify-center">
        <div style={box} className="relative overflow-hidden bg-black">
          {view.artifact ? (
            <video key={view.artifact.id} ref={videoRef} src={view.artifact.stream_url} loop={loop} preload="auto" playsInline aria-label="Program video" className="h-full w-full" />
          ) : dimmed ? (
            <video key={dimmed.id} src={`${dimmed.stream_url}#t=86400`} preload="metadata" muted aria-hidden className="h-full w-full opacity-35" />
          ) : (
            view.activity === null && !view.error && <Placeholder />
          )}
          {safeAreas && <SafeAreas />}
          {view.activity && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="tabular rounded-[4px] bg-black/60 px-3 py-1.5 text-sm text-fg">{view.activity}</span>
            </div>
          )}
          {view.error && !view.activity && <Failure message={view.error} />}
        </div>
      </div>
      {view.activity && <ProgressEdge pct={view.pct} />}
    </div>
  );
}
