import { useRef, useState, type PointerEvent } from "react";
import { dropIndex, type ClipBox } from "./timelineMath";

/** Pointer travel before a press becomes a drag, so a click still selects. */
const DRAG_THRESHOLD_PX = 4;

export interface ClipDrag {
  /** Index of the clip being dragged and how far it moved, while dragging. */
  dragging: { index: number; dx: number } | null;
  /** Where the dragged clip would land. */
  target: number | null;
  onPointerDown: (index: number, e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  /** True right after a drag, so the click that ends it does not also select. */
  consumeClick: () => boolean;
}

/** Drag a clip along V1 to reorder; `onMove(from, to)` runs on drop. */
export function useClipDrag(boxes: ClipBox[], onMove: (from: number, to: number) => void): ClipDrag {
  const press = useRef<{ index: number; startX: number } | null>(null);
  const dragged = useRef(false);
  const [dragging, setDragging] = useState<{ index: number; dx: number } | null>(null);
  const box = dragging ? boxes[dragging.index] : undefined;
  const target = dragging && box ? dropIndex(boxes, dragging.index, box.x + box.width / 2 + dragging.dx) : null;

  return {
    dragging,
    target,
    onPointerDown(index, e) {
      if (e.button !== 0) return;
      press.current = { index, startX: e.clientX };
      dragged.current = false;
    },
    onPointerMove(e) {
      const p = press.current;
      if (!p) return;
      const dx = e.clientX - p.startX;
      if (!dragged.current && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      if (!dragged.current) e.currentTarget.setPointerCapture?.(e.pointerId);
      dragged.current = true;
      setDragging({ index: p.index, dx });
    },
    onPointerUp() {
      if (dragging && target !== null && target !== dragging.index) onMove(dragging.index, target);
      press.current = null;
      setDragging(null);
    },
    consumeClick() {
      const was = dragged.current;
      dragged.current = false;
      return was;
    },
  };
}
