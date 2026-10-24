import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { useExport } from "../../api/exports";
import { moveClipTo } from "../../state/compositionDraft";
import { useComposition } from "../../state/composition";
import { useExportSettings } from "../../state/exports";
import { requestOpenFile } from "../../state/openFile";
import { requestSeek, usePlayback } from "../../state/playback";
import { useLayout } from "../../layout/LayoutContext";
import { useStudio } from "../../state/studio";
import { Button } from "../../ui/Button";
import { EmptyState, ErrorText } from "../../ui/ErrorText";
import { NewComposition } from "./CompositionTabs";
import { layoutClips, zoomToPxPerSecond } from "./timelineMath";
import { TimelineToolbar } from "./TimelineToolbar";
import { TimelineTrack } from "./TimelineTrack";
import { useSceneDurations } from "./useSceneDurations";

/** Seconds of the monitor's export when it is an export of `composition`, else null. */
function useLinkedPlayhead(composition: string | null): number | null {
  const playback = usePlayback();
  const exportId = playback.source?.kind === "export" ? playback.source.id : null;
  const exp = useExport(exportId).data;
  return exp && exp.composition === composition ? playback.time : null;
}

/** Ctrl/Cmd+S saves the composition while the Timeline is the focused panel. */
function useSaveShortcut(save: () => void) {
  const { focused } = useLayout();
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  });
  useEffect(() => {
    if (focused !== "timeline") return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        latest.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused]);
}

function SaveError({ error, onReload }: { error: Error; onReload: () => void }) {
  if (!(error instanceof ApiError && error.status === 412)) return <ErrorText error={error} />;
  return (
    <p role="alert" className="flex items-center gap-3 text-sm text-warn">
      pnp.yaml changed on disk.
      <Button onClick={onReload}>Reload</Button>
    </p>
  );
}

function NoComposition() {
  const [adding, setAdding] = useState(false);
  const { connected } = useStudio();
  const create = (
    <Button icon={Plus} disabled={!connected} title={connected ? undefined : "Waiting for the agent"} onClick={() => setAdding(true)}>
      Create one
    </Button>
  );
  return (
    <EmptyState>
      <span>No composition.</span>
      {adding ? <NewComposition onDone={() => setAdding(false)} /> : create}
    </EmptyState>
  );
}

/** The Timeline (Shift+3): one composition's clips on V1, laid out by their rendered length. */
export function TimelinePanel() {
  const { pid, scenes } = useStudio();
  const c = useComposition();
  const exports = useExportSettings();
  const [zoom, setZoom] = useState(40);
  const clips = c.draft?.clips ?? [];
  const pps = zoomToPxPerSecond(zoom);
  const boxes = layoutClips(clips.map((clip) => clip.scene), useSceneDurations(pid, clips.map((clip) => clip.scene)), pps);
  const playhead = useLinkedPlayhead(c.selected);
  useSaveShortcut(() => c.dirty && c.save());
  const error = c.saveError ?? c.createError ?? exports.error ?? c.query.error;

  return (
    <div data-timeline className="flex h-full flex-col">
      <TimelineToolbar zoom={zoom} onZoom={setZoom} />
      {error && (
        <div className="shrink-0 border-b border-line px-2 py-1.5">
          <SaveError error={error} onReload={c.reload} />
        </div>
      )}
      {c.query.data && c.names.length === 0 && <NoComposition />}
      {c.draft && clips.length === 0 && <EmptyState>Add at least one clip.</EmptyState>}
      {c.draft && clips.length > 0 && (
        <TimelineTrack
          clips={clips}
          boxes={boxes}
          pxPerSecond={pps}
          selectedClip={c.selectedClip}
          onSelect={c.selectClip}
          onRemove={(id) => {
            c.update({ clips: clips.filter((clip) => clip.id !== id) });
            c.selectClip(null);
          }}
          onReorder={(from, to) => c.update({ clips: moveClipTo(clips, from, to) })}
          onOpen={(clip) => {
            const scene = scenes.find((s) => s.ref === clip.scene);
            if (scene) requestOpenFile({ path: scene.file, line: scene.line });
          }}
          playhead={playhead}
          onSeek={(seconds) => playhead !== null && requestSeek(seconds)}
        />
      )}
    </div>
  );
}
