// Readable facts from GET /agent, shared by the title bar and the Inspector.

import type { AgentInfo } from "./types";

/** The tools a render cannot run without that the Agent did not find. */
export function missingTools(info: AgentInfo): string[] {
  return (["manim", "ffmpeg"] as const).filter((name) => !info.tools[name].available);
}

/** "v0.19.0": `manim --version` prints "Manim Community v0.19.0"; avoid "Manim Manim …". */
export function manimVersion(info: AgentInfo): string {
  return (info.tools.manim.version ?? "not found").replace(/^manim( community)?\s*/i, "");
}

/** "16.0 GB" from megabytes. */
export function gigabytes(mb: number): string {
  return `${(mb / 1024).toFixed(1)} GB`;
}

const ARCH = /x86_64|amd64|aarch64|arm64|armv\d+l?|i[3-6]86/i;

/** "Linux x86_64" from Python's platform string, e.g. "Linux-7.0.0-38-generic-x86_64-with-glibc2.43". */
export function shortOs(os: string): string {
  const name = os.split("-")[0] ?? os;
  const arch = ARCH.exec(os.slice(name.length))?.[0];
  return arch ? `${name} ${arch}` : name;
}
