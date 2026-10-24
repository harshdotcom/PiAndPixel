import type { KeyboardEvent, MouseEvent } from "react";
import type { DraftClip } from "../../state/clips";
import { formatDuration } from "../monitor/timecode";
import { ClipBlock } from "./ClipBlock";
import { rulerTicks, type ClipBox } from "./timelineMath";
import { useClipDrag } from "./useClipDrag";

interface Props {
  clips: DraftClip[];
  boxes: ClipBox[];
  pxPerSecond: number;
  selectedClip: number | null;
  onSelect: (id: number | null) => void;
  onRemove: (id: number) => void;
  onReorder: (from: number, to: number) => void;
  onOpen: (clip: DraftClip) => void;
  /** Seconds of the linked export playing in the monitor, or null when not linked. */
  playhead: number | null;
  onSeek: (seconds: number) => void;
}

const HEAD_PX = 44;
/** Room after the last clip, so the end is never flush against the edge. */
const TAIL_PX = 160;

function Ruler({ seconds, pps, onSeek }: { seconds: number; pps: number; onSeek: (s: number) => void }) {
  const click = (e: MouseEvent<HTMLDivElement>) => onSeek((e.clientX - e.currentTarget.getBoundingClientRect().left) / pps);
  return (
    <div aria-label="Time ruler" onClick={click} className="relative h-6 border-b border-line bg-header">
      {rulerTicks(seconds, pps).map((t) => (
        <div key={t} style={{ left: t * pps }} className="absolute top-0 bottom-0 border-l border-line-strong">
          <span className="tabular absolute top-1 left-1 font-mono text-2xs text-fg-3">{formatDuration(t)}</span>
        </div>
      ))}
    </div>
  );
}

function Playhead({ x }: { x: number }) {
  return (
    <div aria-label="Playhead" style={{ left: x }} className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-accent">
      <span className="absolute -top-px -left-[5px] h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-accent" />
    </div>
  );
}

/** x of the drop marker: before the target clip when moving left, after it when moving right. */
function dropMarker(boxes: ClipBox[], from: number | null, to: number | null): number | null {
  const box = to === null ? undefined : boxes[to];
  if (from === null || to === null || to === from || !box) return null;
  return to < from ? box.x : box.x + box.width;
}

function TrackHeads() {
  return (
    <div style={{ width: HEAD_PX }} className="shrink-0 border-r border-line bg-header">
      <div className="h-6 border-b border-line" />
      <div className="flex h-[60px] items-center justify-center border-b border-line font-mono text-xs font-semibold text-fg-2">V1</div>
    </div>
  );
}

/** Track V1: the clip blocks, dragged to reorder, and the drop marker while dragging. */
function ClipLane(props: Props) {
  const { clips, boxes, selectedClip, onSelect } = props;
  const drag = useClipDrag(boxes, props.onReorder);
  const dropX = dropMarker(boxes, drag.dragging?.index ?? null, drag.target);
  return (
    <div
      role="list"
      aria-label="Track V1"
      className="relative h-[60px] border-b border-line bg-panel"
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onClick={(e) => e.target === e.currentTarget && onSelect(null)}
    >
      {clips.map((clip, i) => (
        <div role="listitem" key={clip.id}>
          <ClipBlock
            clip={clip}
            index={i}
            box={boxes[i]!}
            selected={clip.id === selectedClip}
            dragX={drag.dragging?.index === i ? drag.dragging.dx : null}
            onPointerDown={(e) => drag.onPointerDown(i, e)}
            onClick={() => !drag.consumeClick() && onSelect(clip.id)}
            onOpen={() => props.onOpen(clip)}
          />
        </div>
      ))}
      {dropX !== null && <div style={{ left: dropX - 1 }} className="absolute top-0 bottom-0 w-0.5 bg-warn" />}
    </div>
  );
}

/** Ruler, track V1 with its clips, and the playhead; Delete removes the selected clip. */
export function TimelineTrack(props: Props) {
  const { boxes, pxPerSecond: pps, selectedClip, onRemove, playhead } = props;
  const last = boxes.at(-1);
  const seconds = Math.max(10, ((last ? last.x + last.width : 0) + TAIL_PX) / pps);

  function onKeyDown(e: KeyboardEvent) {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedClip !== null) {
      e.preventDefault();
      onRemove(selectedClip);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden" onKeyDown={onKeyDown}>
      <TrackHeads />
      <div className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div style={{ width: seconds * pps }} className="relative min-w-full">
          <Ruler seconds={seconds} pps={pps} onSeek={props.onSeek} />
          <ClipLane {...props} />
          {playhead !== null && <Playhead x={playhead * pps} />}
        </div>
      </div>
    </div>
  );
}
