import { useState } from "react";
import { useAgent } from "../api/hooks";
import type { OutputChoice, RenderOptions } from "../api/types";

/** Which picker remembers the choice: renders and exports keep their own. */
export type OutputPanel = "render" | "export";

function storageKey(pid: string, panel: OutputPanel): string {
  return `pnp.output.${panel}.${pid}`;
}

// Remembering the choice is only a convenience, so storage errors (private mode) are ignored.
function readChoice(key: string): Partial<OutputChoice> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<OutputChoice>) : {};
  } catch {
    return {};
  }
}

function rememberChoice(key: string, choice: OutputChoice): void {
  try {
    localStorage.setItem(key, JSON.stringify(choice));
  } catch {
    // Ignored: see readChoice.
  }
}

/** The stored or picked choice, with anything the Agent no longer offers replaced by its default. */
function validChoice(picked: Partial<OutputChoice>, options: RenderOptions): OutputChoice {
  const known = options.resolutions.some((r) => r.id === picked.resolution);
  return {
    resolution: known && picked.resolution ? picked.resolution : options.default.resolution,
    fps: picked.fps !== undefined && options.fps.includes(picked.fps) ? picked.fps : options.default.fps,
  };
}

/**
 * The resolution and fps a panel renders at, remembered per project in localStorage.
 * `choice` is null until the Agent has said which options exist.
 */
export function useOutputChoice(pid: string, panel: OutputPanel) {
  const options = useAgent().data?.render_options;
  const key = storageKey(pid, panel);
  const [picks, setPicks] = useState<Record<string, Partial<OutputChoice>>>({});
  const choice = options?.resolutions ? validChoice(picks[key] ?? readChoice(key), options) : null;

  function update(next: Partial<OutputChoice>) {
    if (!choice) return;
    const merged = { ...choice, ...next };
    setPicks((all) => ({ ...all, [key]: merged }));
    rememberChoice(key, merged);
  }
  return { options: choice ? options : undefined, choice, update };
}
