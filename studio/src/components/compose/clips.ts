// Pure helpers for editing a composition's clip list before it is saved.

import type { Clip, Composition } from "../../api/types";

export const COMPOSITION_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** A clip as edited: params stay text until saved, so a typo is not lost. */
export interface DraftClip {
  /** Local id for React keys; clips can repeat, so the scene is not unique. */
  id: number;
  scene: string;
  paramsText: string;
}

let nextId = 1;

export function draftClip(scene: string, params: Record<string, unknown> = {}): DraftClip {
  const paramsText = Object.keys(params).length > 0 ? JSON.stringify(params, null, 2) : "{}";
  return { id: nextId++, scene, paramsText };
}

/** Problem with a name for a new composition, or null when it can be created. */
export function nameProblem(name: string, existing: string[]): string | null {
  if (!COMPOSITION_NAME.test(name)) {
    return "Use letters, digits, - or _ (start with a letter or digit, at most 64).";
  }
  if (existing.includes(name)) return `"${name}" already exists.`;
  return null;
}

/** The params object, or an error message when the text is not a JSON object. */
export function parseParams(text: string): { params: Record<string, unknown> } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return { error: `Invalid JSON: ${(err as Error).message}` };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "Params must be a JSON object, e.g. {\"color\": \"BLUE\"}." };
  }
  return { params: value as Record<string, unknown> };
}

/** Moves the clip at `index` by `offset` places; out-of-range moves change nothing. */
export function moveClip<T>(clips: T[], index: number, offset: number): T[] {
  const target = index + offset;
  if (index < 0 || index >= clips.length || target < 0 || target >= clips.length) return clips;
  const moved = [...clips];
  const [clip] = moved.splice(index, 1);
  moved.splice(target, 0, clip as T);
  return moved;
}

/** The composition to save, or null while any clip's params are invalid or there are none. */
export function toComposition(title: string, clips: DraftClip[]): Composition | null {
  if (clips.length === 0) return null;
  const parsed: Clip[] = [];
  for (const clip of clips) {
    const result = parseParams(clip.paramsText);
    if ("error" in result) return null;
    parsed.push({ scene: clip.scene, params: result.params });
  }
  return { title: title.trim() || null, clips: parsed };
}
