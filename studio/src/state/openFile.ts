// "Open this file (at this line) in the editor": raised by the file tree and by traceback
// links in job logs, handled by the editor area. A tiny pub/sub so neither side imports the other.

import { useEffect, useRef } from "react";

export interface FileLocation {
  /** Project-relative path, e.g. "scenes/proof.py". */
  path: string;
  /** 1-based line to reveal; omitted to keep the current position. */
  line?: number;
}

type Listener = (location: FileLocation) => void;
const listeners = new Set<Listener>();

export function requestOpenFile(location: FileLocation): void {
  listeners.forEach((listener) => listener(location));
}

export function onOpenFile(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Calls handler for every open request while the component is mounted. */
export function useOpenFileRequests(handler: Listener): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => onOpenFile((location) => latest.current(location)), []);
}
