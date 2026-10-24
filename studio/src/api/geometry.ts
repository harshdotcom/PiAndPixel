import type { FormatInfo, Quality } from "./types";

export interface OutputSize {
  width: number;
  height: number;
}

/**
 * The size a render really has: the format's short edge set to `shortEdge`, the long edge
 * kept to the aspect and rounded to the nearest even number (yuv420p needs even sizes).
 * null when the long edge would exceed `maxLongEdge`. Mirrors pnp_core.formats.output_geometry.
 */
export function outputSize(format: FormatInfo, shortEdge: number, maxLongEdge: number): OutputSize | null {
  const short = Math.min(format.width, format.height);
  const long = Math.max(format.width, format.height);
  // Integer maths, like the Agent, so both round the same way.
  const longEdge = 2 * Math.floor((shortEdge * long + short) / (2 * short));
  if (longEdge > maxLongEdge) return null;
  const portrait = format.height > format.width;
  return portrait ? { width: shortEdge, height: longEdge } : { width: longEdge, height: shortEdge };
}

/** "4K" for 2160p, the id otherwise. */
export function resolutionLabel(id: string): string {
  return id === "2160p" ? "4K" : id;
}

/** "720p @ 30 fps" for a job, export or artifact; older records only know their quality. */
export function outputLabel(out: { resolution?: string | null; quality: Quality; fps?: number | null }): string {
  if (!out.resolution) return out.quality;
  return `${resolutionLabel(out.resolution)} @ ${out.fps ?? "?"} fps`;
}
