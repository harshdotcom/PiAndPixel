// The code editor's cursor position, shown in the status bar.

import { useSyncExternalStore } from "react";

export interface Cursor {
  line: number;
  column: number;
}

let current: Cursor | null = null;
const listeners = new Set<() => void>();

export function publishCursor(next: Cursor | null): void {
  if (next?.line === current?.line && next?.column === current?.column) return;
  current = next;
  listeners.forEach((listener) => listener());
}

export function useCursor(): Cursor | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
