// The Program Monitor's playback position, shared with the Timeline's playhead.

import { useSyncExternalStore } from "react";
import type { MonitorSource } from "./renders";

export interface Playback {
  source: MonitorSource | null;
  time: number;
  duration: number;
  playing: boolean;
}

const IDLE: Playback = { source: null, time: 0, duration: 0, playing: false };
let current = IDLE;
const listeners = new Set<() => void>();
const seekListeners = new Set<(time: number) => void>();

export function publishPlayback(next: Playback): void {
  current = next;
  listeners.forEach((listener) => listener());
}

export function usePlayback(): Playback {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** Asks the monitor to jump to `time` seconds (e.g. a click on the timeline ruler). */
export function requestSeek(time: number): void {
  seekListeners.forEach((listener) => listener(time));
}

export function onSeekRequest(listener: (time: number) => void): () => void {
  seekListeners.add(listener);
  return () => {
    seekListeners.delete(listener);
  };
}
