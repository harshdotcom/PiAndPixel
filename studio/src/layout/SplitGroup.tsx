import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Group, Panel, Separator, useGroupRef, type Layout, type LayoutChangedMeta } from "react-resizable-panels";
import { useLayout } from "./LayoutContext";
import { splitLayout, splitValue } from "./layoutStore";
import { SPLIT_DEFAULTS, type SplitId } from "./panels";

export interface SplitSide {
  visible: boolean;
  /** Minimum size in pixels while visible. */
  minSize: number;
  children: ReactNode;
}

interface Props {
  id: SplitId;
  orientation: "horizontal" | "vertical";
  a: SplitSide;
  b: SplitSide;
}

const ANIMATION_MS = 200;

/** Lets panel sizes glide (CSS on [data-animating]) for one show/hide, never while dragging. */
function animateOnce(element: HTMLElement | null) {
  if (!element) return;
  element.dataset.animating = "";
  setTimeout(() => delete element.dataset.animating, ANIMATION_MS);
}

/**
 * Keeps the group's layout in step with the panels' visibility and the saved split: re-applied
 * on show/hide and on reset, saved after the user drags the gutter.
 */
function useSplitSync(id: SplitId, horizontal: boolean, visibleA: boolean, visibleB: boolean) {
  const { state, setSplit } = useLayout();
  const groupRef = useGroupRef();
  const element = useRef<HTMLDivElement>(null);
  const saved = state.splits[id];
  const ids = { a: `${id}-a`, b: `${id}-b` };
  const groupPx = () => (horizontal ? element.current?.offsetWidth : element.current?.offsetHeight) ?? 0;
  const toLayout = (l: { a: number; b: number }): Layout => ({ [ids.a]: l.a, [ids.b]: l.b });
  const [initial] = useState(() =>
    toLayout(splitLayout(id, saved, visibleA, visibleB, horizontal ? window.innerWidth : window.innerHeight)),
  );
  const shown = `${visibleA}/${visibleB}`;
  const isDefault = saved === undefined;
  const mounted = useRef(false);

  useLayoutEffect(() => {
    if (mounted.current) animateOnce(element.current);
    mounted.current = true;
    const apply = () => groupRef.current?.setLayout(toLayout(splitLayout(id, saved, visibleA, visibleB, groupPx())));
    apply();
    // The panels re-register their new collapsible/min constraints with the group after this
    // effect; applying again next frame keeps a hidden side from being clamped to its min size.
    const frame = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(frame);
    // Re-apply on show/hide and on reset, not after every drag the user just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, isDefault]);

  function onLayoutChanged(layout: Layout, meta: LayoutChangedMeta) {
    const aPct = layout[ids.a];
    if (meta.isUserInteraction && visibleA && visibleB && aPct !== undefined) {
      setSplit(id, splitValue(id, aPct, groupPx()));
    }
  }
  return { ids, groupRef, element, initial, onLayoutChanged };
}

/**
 * Two docked panels with a draggable 4px gutter. Hiding a side gives its space to the other;
 * showing it again restores the saved size. Sizes the user drags to are saved in the layout.
 */
export function SplitGroup({ id, orientation, a, b }: Props) {
  const horizontal = orientation === "horizontal";
  const sync = useSplitSync(id, horizontal, a.visible, b.visible);
  const unit = SPLIT_DEFAULTS[id].unit;
  const both = a.visible && b.visible;
  const side = (s: SplitSide, panelId: string, pixelUnit: "px-a" | "px-b") => (
    <Panel
      id={panelId}
      minSize={`${s.minSize}px`}
      collapsible={!s.visible}
      collapsedSize={0}
      groupResizeBehavior={unit === pixelUnit ? "preserve-pixel-size" : "preserve-relative-size"}
    >
      {s.children}
    </Panel>
  );
  return (
    <Group
      id={id}
      orientation={orientation}
      groupRef={sync.groupRef}
      elementRef={sync.element}
      defaultLayout={sync.initial}
      onLayoutChanged={sync.onLayoutChanged}
      className="h-full w-full"
    >
      {side(a, sync.ids.a, "px-a")}
      <Separator disabled={!both} disableDoubleClick className={horizontal ? (both ? "w-1" : "w-0") : both ? "h-1" : "h-0"} />
      {side(b, sync.ids.b, "px-b")}
    </Group>
  );
}
