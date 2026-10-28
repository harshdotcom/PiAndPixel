import { useRef, useState, type PointerEvent } from "react";
import type { NarrationAudioClip } from "../../api/types";

interface Props {
  clip: NarrationAudioClip;
  pxPerSecond: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (start: number) => void;
}

export function AudioClipBlock({ clip, pxPerSecond, selected, onSelect, onMove }: Props) {
  const origin = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const [dragX, setDragX] = useState(0);
  const duration = clip.source_end_s - clip.source_start_s;

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    origin.current = { x: event.clientX, start: clip.start_s, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect();
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!origin.current) return;
    const delta = event.clientX - origin.current.x;
    if (Math.abs(delta) > 2) origin.current.moved = true;
    setDragX(delta);
  }

  function pointerUp() {
    const drag = origin.current;
    origin.current = null;
    setDragX(0);
    if (drag?.moved) onMove(Math.max(0, Math.round((drag.start + dragX / pxPerSecond) * 100) / 100));
  }

  return (
    <button
      type="button"
      aria-label={`Voice clip, starts ${clip.start_s.toFixed(2)} seconds, duration ${duration.toFixed(2)} seconds`}
      aria-pressed={selected}
      title="Drag to move · select for trim and split controls"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      onClick={() => {
        if (!origin.current?.moved) onSelect();
      }}
      style={{
        left: clip.start_s * pxPerSecond + 1,
        width: Math.max(22, duration * pxPerSecond - 2),
        transform: dragX === 0 ? undefined : `translateX(${dragX}px)`,
      }}
      className={`absolute inset-y-1 overflow-hidden rounded-[3px] border border-[#8671c5] bg-[#514371] text-left text-fg outline-none hover:brightness-110 ${selected ? "shadow-[inset_0_0_0_1px_var(--accent),0_0_0_1px_var(--accent)]" : ""} ${clip.enabled ? "" : "opacity-45"}`}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-[#b9a7f2]" />
      <span className="block truncate px-1.5 pt-1.5 text-xs font-medium">Voice · {duration.toFixed(1)}s</span>
      <span className="block truncate px-1.5 text-2xs text-fg-2">{clip.enabled ? "A1 · enabled" : "A1 · muted"}</span>
    </button>
  );
}
