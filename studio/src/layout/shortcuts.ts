// Workspace keyboard shortcuts (docs/ui-design.md §2.4), as pure functions of a key event.

import { isVisible, type LayoutState } from "./layoutStore";
import { SHORTCUT_PANELS, type PanelId } from "./panels";

export type ShortcutAction =
  | { type: "panel"; id: PanelId }
  | { type: "maximize" }
  | { type: "terminal" }
  | { type: "newProject" };

export type KeyInput = Pick<KeyboardEvent, "code" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">;

/**
 * What a key press means to the workspace, or null. `editable` is true while typing in an
 * input, the code editor or the terminal: there Shift+1 is "!" and ` is a character.
 */
export function matchShortcut(e: KeyInput, editable: boolean): ShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey;
  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.code === "Backquote") return { type: "terminal" };
  if (mod && !e.altKey && !e.shiftKey && e.code === "KeyN") return { type: "newProject" };
  if (editable || mod || e.altKey) return null;
  if (!e.shiftKey && e.code === "Backquote") return { type: "maximize" };
  const digit = /^Digit([1-5])$/.exec(e.code)?.[1];
  const id = digit && e.shiftKey ? SHORTCUT_PANELS[Number(digit) - 1] : undefined;
  return id ? { type: "panel", id } : null;
}

/** Shift+N: show a hidden panel, focus a visible one, hide it on a second press while focused. */
export function panelShortcutEffect(state: LayoutState, focused: PanelId | null, id: PanelId): "show" | "focus" | "hide" {
  if (!isVisible(state, id)) return "show";
  return focused === id ? "hide" : "focus";
}

/** True when keys typed into `target` are text, not shortcuts. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest(".monaco-editor, .xterm")) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
