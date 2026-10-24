// Open editor tabs and their unsaved edits, as pure state transitions (used by EditorArea).

import type { FileContent } from "../api/types";
import type { FileLocation } from "../state/openFile";

/** Unsaved edits, and the etag of the disk version they are based on (sent as If-Match). */
export interface Draft {
  content: string;
  etag: string;
}

export interface TabsState {
  paths: string[];
  active: string | null;
  /** Only tabs with unsaved changes have a draft: a draft means "dirty". */
  drafts: Record<string, Draft>;
  /** 1-based line to reveal in the active tab. */
  reveal: number | null;
}

export const NO_TABS: TabsState = { paths: [], active: null, drafts: {}, reveal: null };

function withoutDraft(drafts: Record<string, Draft>, path: string): Record<string, Draft> {
  const rest = { ...drafts };
  delete rest[path];
  return rest;
}

export function openTab(state: TabsState, { path, line }: FileLocation): TabsState {
  const paths = state.paths.includes(path) ? state.paths : [...state.paths, path];
  return { ...state, paths, active: path, reveal: line ?? null };
}

export function selectTab(state: TabsState, path: string): TabsState {
  return { ...state, active: path, reveal: null };
}

/** Closes the tab (dropping its edits) and activates its neighbour if it was active. */
export function closeTab(state: TabsState, path: string): TabsState {
  const index = state.paths.indexOf(path);
  if (index < 0) return state;
  const paths = state.paths.filter((p) => p !== path);
  const active =
    state.active === path ? (paths[index] ?? paths[index - 1] ?? null) : state.active;
  return { paths, active, drafts: withoutDraft(state.drafts, path), reveal: null };
}

/** A renamed file keeps its tab and edits under the new path; a deleted one is closed. */
export function moveTab(state: TabsState, from: string, to: string | null): TabsState {
  if (to === null) return closeTab(state, from);
  if (!state.paths.includes(from)) return state;
  const drafts = withoutDraft(state.drafts, from);
  const draft = state.drafts[from];
  if (draft) drafts[to] = draft;
  return {
    ...state,
    paths: state.paths.map((p) => (p === from ? to : p)),
    active: state.active === from ? to : state.active,
    drafts,
  };
}

/** Records an edit; going back to the disk content clears the dirty state. */
export function editTab(state: TabsState, path: string, content: string, disk: FileContent): TabsState {
  if (content === disk.content) return { ...state, drafts: withoutDraft(state.drafts, path) };
  const etag = state.drafts[path]?.etag ?? disk.etag;
  return { ...state, drafts: { ...state.drafts, [path]: { content, etag } } };
}

/** After a save of `content`: clean, unless the user kept typing while it was in flight. */
export function markSaved(state: TabsState, path: string, content: string, etag: string): TabsState {
  const draft = state.drafts[path];
  if (!draft) return state;
  if (draft.content === content) return { ...state, drafts: withoutDraft(state.drafts, path) };
  return { ...state, drafts: { ...state.drafts, [path]: { content: draft.content, etag } } };
}

export function discardDraft(state: TabsState, path: string): TabsState {
  return { ...state, drafts: withoutDraft(state.drafts, path) };
}
