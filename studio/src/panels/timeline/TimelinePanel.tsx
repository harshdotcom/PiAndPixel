import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { useNarration, useSaveNarrationTimeline } from "../../api/narration";
import type { NarrationAudioClip } from "../../api/types";
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
import { AudioClipControls } from "./AudioClipControls";
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
  const narration = useNarration(pid, c.selected);
  const saveAudioTimeline = useSaveNarrationTimeline(pid, c.selected ?? "");
  const [zoom, setZoom] = useState(40);
  const [selectedAudioClip, setSelectedAudioClip] = useState<string | null>(null);
  const [timelinePlayhead, setTimelinePlayhead] = useState(0);
  const clips = c.draft?.clips ?? [];
  const audioClips = narration.data?.audio_clips ?? [];
  const pps = zoomToPxPerSecond(zoom);
  const boxes = layoutClips(clips.map((clip) => clip.scene), useSceneDurations(pid, clips.map((clip) => clip.scene)), pps);
  const linkedPlayhead = useLinkedPlayhead(c.selected);
  const playhead = linkedPlayhead ?? timelinePlayhead;
  const selectedVoice = audioClips.find((clip) => clip.id === selectedAudioClip) ?? null;
  useSaveShortcut(() => c.dirty && c.save());
  useEffect(() => setSelectedAudioClip(null), [c.selected]);
  useEffect(() => {
    if (selectedAudioClip && !audioClips.some((clip) => clip.id === selectedAudioClip)) {
      setSelectedAudioClip(null);
    }
  }, [audioClips, selectedAudioClip]);
  const error = c.saveError ?? c.createError ?? exports.error ?? saveAudioTimeline.error ?? c.query.error;

  function saveAudioClips(next: NarrationAudioClip[]) {
    if (c.selected) saveAudioTimeline.mutate(next);
  }

  function updateAudioClip(id: string, change: Partial<NarrationAudioClip>) {
    saveAudioClips(audioClips.map((clip) => clip.id === id ? { ...clip, ...change } : clip));
  }

  function splitAudioClip() {
    if (!selectedVoice || !c.selected) return;
    const sourceSplit = selectedVoice.source_start_s + playhead - selectedVoice.start_s;
    if (sourceSplit <= selectedVoice.source_start_s || sourceSplit >= selectedVoice.source_end_s) return;
    const left = { ...selectedVoice, source_end_s: sourceSplit };
    const right = {
      ...selectedVoice,
      id: crypto.randomUUID().replaceAll("-", ""),
      start_s: playhead,
      source_start_s: sourceSplit,
    };
    const next = audioClips.flatMap((clip) => clip.id === selectedVoice.id ? [left, right] : [clip]);
    saveAudioClips(next);
    setSelectedAudioClip(right.id);
  }

  function removeAudioClip(id: string) {
    saveAudioClips(audioClips.filter((clip) => clip.id !== id));
    setSelectedAudioClip(null);
  }

  function seek(seconds: number) {
    setTimelinePlayhead(Math.max(0, seconds));
    if (linkedPlayhead !== null) requestSeek(seconds);
  }

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
        <>
        {selectedVoice && <AudioClipControls clip={selectedVoice} playhead={playhead}
          onUpdate={(change) => updateAudioClip(selectedVoice.id, change)}
          onSplit={splitAudioClip} onDelete={() => removeAudioClip(selectedVoice.id)} />}
        <TimelineTrack
          clips={clips}
          audioClips={audioClips}
          boxes={boxes}
          pxPerSecond={pps}
          selectedClip={c.selectedClip}
          selectedAudioClip={selectedAudioClip}
          onSelect={(id) => { c.selectClip(id); setSelectedAudioClip(null); }}
          onSelectAudioClip={(id) => { setSelectedAudioClip(id); c.selectClip(null); }}
          onRemove={(id) => {
            c.update({ clips: clips.filter((clip) => clip.id !== id) });
            c.selectClip(null);
          }}
          onRemoveAudioClip={removeAudioClip}
          onMoveAudioClip={(id, start) => updateAudioClip(id, { start_s: start })}
          onReorder={(from, to) => c.update({ clips: moveClipTo(clips, from, to) })}
          onOpen={(clip) => {
            const scene = scenes.find((s) => s.ref === clip.scene);
            if (scene) requestOpenFile({ path: scene.file, line: scene.line });
          }}
          playhead={playhead}
          onSeek={seek}
        />
        </>
      )}
    </div>
  );
}
