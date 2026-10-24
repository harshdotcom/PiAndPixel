// "This file was renamed or deleted": raised by the file tree, handled by the editor area so
// open tabs follow the file. Same tiny pub/sub shape as state/openFile.ts.

import { useEffect, useRef } from "react";

/** `to` is the new path, or null when the file was deleted. */
type Listener = (from: string, to: string | null) => void;
const listeners = new Set<Listener>();

export function announceFileMoved(from: string, to: string | null): void {
  listeners.forEach((listener) => listener(from, to));
}

export function useFileMoves(handler: Listener): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const listener: Listener = (from, to) => latest.current(from, to);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
