// Time display for the monitor, timeline and bin.

const pad = (n: number) => String(n).padStart(2, "0");

/** The frame index at `seconds`; a tiny epsilon keeps 0.2 s × 15 fps on frame 3, not 2.9999. */
export function frameAt(seconds: number, fps: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0 || fps <= 0) return 0;
  return Math.floor(seconds * fps + 1e-6);
}

/** SMPTE-style "HH:MM:SS:FF" (non-drop-frame) at the render's frame rate. */
export function formatTimecode(seconds: number, fps: number): string {
  const rate = Math.max(1, Math.round(fps));
  const frames = frameAt(seconds, rate);
  const ff = frames % rate;
  const totalSeconds = Math.floor(frames / rate);
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor(totalSeconds / 60) % 60;
  return `${pad(hh)}:${pad(mm)}:${pad(totalSeconds % 60)}:${pad(ff)}`;
}

/** "0:04", "1:05", "1:02:03": elapsed times. Media lengths use formatClipLength. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = pad(total % 60);
  return h > 0 ? `${h}:${pad(m)}:${s}` : `${m}:${s}`;
}

/** A clip's or video's length to a tenth of a second ("5.9s", "1:05.2"), the one format for lengths in the timeline, bin and Inspector. */
export function formatClipLength(seconds: number): string {
  const tenths = Math.round(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 10);
  const s = (tenths % 600) / 10;
  const m = Math.floor(tenths / 600);
  return m > 0 ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${s.toFixed(1)}s`;
}
