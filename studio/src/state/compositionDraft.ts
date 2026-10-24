// Unsaved composition edits, one draft per composition, as pure helpers (used by composition.tsx).

import { draftClip, toComposition, type DraftClip } from "./clips";
import type { Composition } from "../api/types";

export interface Draft {
  title: string;
  clips: DraftClip[];
  /** The pnp.yaml etag these edits are based on; a save sends it as If-Match. */
  baseEtag: string;
  /** editKey() of what is saved, to tell whether there is anything to save. */
  savedKey: string;
}

/** What the user can change, without the local clip ids: equal keys mean nothing to save. */
export function editKey(title: string, clips: Pick<DraftClip, "scene" | "paramsText">[]): string {
  return JSON.stringify([title, clips.map((c) => [c.scene, c.paramsText])]);
}

export function draftFrom(composition: Composition, etag: string): Draft {
  const title = composition.title ?? "";
  const clips = composition.clips.map((c) => draftClip(c.scene, c.params));
  return { title, clips, baseEtag: etag, savedKey: editKey(title, clips) };
}

export function isDirty(draft: Draft): boolean {
  return editKey(draft.title, draft.clips) !== draft.savedKey;
}

/** The composition to save, or null while a clip's params are invalid or there are no clips. */
export function draftComposition(draft: Draft): Composition | null {
  return toComposition(draft.title, draft.clips);
}

/**
 * After our own save moved pnp.yaml from etag `from` to `to`, drafts based on `from` are still
 * based on the file as it is: only their etag changes.
 */
export function rebase(drafts: Record<string, Draft>, from: string, to: string): Record<string, Draft> {
  return Object.fromEntries(
    Object.entries(drafts).map(([name, d]) => [name, d.baseEtag === from ? { ...d, baseEtag: to } : d]),
  );
}

/** Moves the clip at `from` so that it ends up at index `to` (drag and drop on the timeline). */
export function moveClipTo<T>(clips: T[], from: number, to: number): T[] {
  if (from < 0 || from >= clips.length || to < 0 || to >= clips.length || from === to) return clips;
  const moved = [...clips];
  const [clip] = moved.splice(from, 1);
  moved.splice(to, 0, clip as T);
  return moved;
}
