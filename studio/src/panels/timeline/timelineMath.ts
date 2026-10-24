// Timeline geometry: clip blocks proportional to their last rendered duration, and the ruler.

/** A clip that was never rendered is drawn this long, dashed, labelled "not rendered". */
export const UNRENDERED_SECONDS = 5;
/** Narrowest block, so a very short clip can still be clicked and dragged. */
export const MIN_CLIP_PX = 16;

export interface ClipBox {
  /** Left edge in px from the timeline start. */
  x: number;
  width: number;
  /** Where the clip starts and how long it lasts, in seconds. */
  start: number;
  seconds: number;
  rendered: boolean;
}

/** Lays clips end to end; `durations` maps a scene ref to its last-known rendered seconds. */
export function layoutClips(scenes: string[], durations: ReadonlyMap<string, number>, pxPerSecond: number): ClipBox[] {
  let start = 0;
  return scenes.map((scene) => {
    const known = durations.get(scene);
    const seconds = known ?? UNRENDERED_SECONDS;
    const box = {
      x: start * pxPerSecond,
      width: Math.max(MIN_CLIP_PX, seconds * pxPerSecond),
      start,
      seconds,
      rendered: known !== undefined,
    };
    start += seconds;
    return box;
  });
}

/** Total length of the laid-out clips in seconds. */
export function totalSeconds(boxes: ClipBox[]): number {
  const last = boxes.at(-1);
  return last ? last.start + last.seconds : 0;
}

/** True when every clip has a known duration, so the total is exact rather than an estimate. */
export function allRendered(boxes: ClipBox[]): boolean {
  return boxes.every((b) => b.rendered);
}

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
/** Labels need at least this much room. */
const MIN_LABEL_PX = 64;

/** The ruler's labelled ticks (seconds) up to `seconds`, spaced at least MIN_LABEL_PX apart. */
export function rulerTicks(seconds: number, pxPerSecond: number): number[] {
  const step = TICK_STEPS.find((s) => s * pxPerSecond >= MIN_LABEL_PX) ?? TICK_STEPS[TICK_STEPS.length - 1]!;
  const ticks: number[] = [];
  for (let t = 0; t <= seconds + 1e-9; t += step) ticks.push(t);
  return ticks;
}

/** Zoom slider position (0–100) to pixels per second, on a log scale from 4 to 200 px/s. */
export function zoomToPxPerSecond(zoom: number): number {
  const clamped = Math.min(100, Math.max(0, zoom));
  return Math.round(4 * Math.pow(50, clamped / 100) * 100) / 100;
}

/** Where the clip at `from` lands when dropped at `x` px: after every other clip whose centre is left of x. */
export function dropIndex(boxes: ClipBox[], from: number, x: number): number {
  return boxes.filter((b, i) => i !== from && b.x + b.width / 2 < x).length;
}
