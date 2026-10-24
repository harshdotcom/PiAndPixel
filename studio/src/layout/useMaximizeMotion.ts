import { useLayoutEffect, useRef, useState, type RefObject } from "react";

const DURATION_MS = 180;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

/** Web Animations exist (not in jsdom) and the user has not asked for reduced motion. */
function canAnimate(): boolean {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  return typeof Element.prototype.animate === "function" && !reduced;
}

/** clip-path that shows only `slot` of an element laid out over `full`. */
function clipTo(slot: DOMRect, full: DOMRect): string {
  const top = Math.max(0, slot.top - full.top);
  const left = Math.max(0, slot.left - full.left);
  const right = Math.max(0, full.right - slot.right);
  const bottom = Math.max(0, full.bottom - slot.bottom);
  return `inset(${top}px ${right}px ${bottom}px ${left}px round 6px)`;
}

/**
 * Maximize / restore motion. The frame is laid out full-size at once (no reflow per frame) and
 * a clip grows from its docked slot to the whole workspace, or shrinks back on restore.
 * Returns whether the frame should be laid out maximized right now.
 */
export function useMaximizeMotion(ref: RefObject<HTMLElement | null>, maximized: boolean): boolean {
  const [laidOut, setLaidOut] = useState(maximized);
  const previous = useRef(maximized);
  const animated = canAnimate();
  if (maximized && !laidOut) setLaidOut(true);
  // Without motion a restore is immediate; with it, the animation's end restores the layout.
  if (!maximized && laidOut && !animated) setLaidOut(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (previous.current === maximized || !element || !animated) return;
    previous.current = maximized;
    const slot = element.parentElement?.getBoundingClientRect() ?? element.getBoundingClientRect();
    const full = element.getBoundingClientRect();
    const frames = [{ clipPath: clipTo(slot, full) }, { clipPath: "inset(0px 0px 0px 0px round 6px)" }];
    const animation = element.animate(maximized ? frames : frames.reverse(), { duration: DURATION_MS, easing: EASE });
    if (!maximized) animation.onfinish = () => setLaidOut(false);
  }, [ref, maximized, animated]);

  return laidOut;
}
