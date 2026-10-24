import type { PointerEvent } from "react";
import type { DraftClip } from "../../state/clips";
import { sceneName } from "../../state/studio";
import { formatClipLength } from "../monitor/timecode";
import type { ClipBox } from "./timelineMath";

interface Props {
  clip: DraftClip;
  index: number;
  box: ClipBox;
  selected: boolean;
  /** Pixels the clip is dragged by, while it is the one being dragged. */
  dragX: number | null;
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onClick: () => void;
  onOpen: () => void;
}

/** One clip on V1: a block as wide as its last render, or a dashed 5 s block if never rendered. */
export function ClipBlock({ clip, index, box, selected, dragX, onPointerDown, onClick, onOpen }: Props) {
  const rendered = box.rendered;
  // A 1px inset on each side leaves a visible cut between neighbouring clips.
  const style = {
    left: box.x + 1,
    width: box.width - 2,
    transform: dragX === null ? undefined : `translateX(${dragX}px)`,
    zIndex: dragX === null ? undefined : 10,
  };
  return (
    <button
      type="button"
      aria-label={`Clip ${index + 1}: ${sceneName(clip.scene)}`}
      aria-pressed={selected}
      title={`${clip.scene} · ${rendered ? formatClipLength(box.seconds) : "not rendered"} (double-click to open)`}
      style={style}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDoubleClick={onOpen}
      className={`absolute top-1 bottom-1 overflow-hidden rounded-[3px] text-left outline-none transition-[box-shadow,background-color] duration-[80ms] ${
        rendered ? "bg-clip hover:brightness-110" : "border border-dashed border-fg-3 bg-raised/40 hover:bg-raised/70"
      } ${selected ? "shadow-[inset_0_0_0_1px_var(--accent),0_0_0_1px_var(--accent)]" : ""} ${dragX !== null ? "opacity-85 shadow-lg" : ""}`}
    >
      {rendered && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
      <span className="block truncate px-1.5 pt-1.5 text-sm font-medium text-fg">{sceneName(clip.scene)}</span>
      <span className="tabular block truncate px-1.5 font-mono text-2xs text-fg-2">
        {rendered ? formatClipLength(box.seconds) : "not rendered"}
      </span>
    </button>
  );
}
