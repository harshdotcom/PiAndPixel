import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, hide } from "./layoutStore";
import { isEditableTarget, matchShortcut, panelShortcutEffect, type KeyInput } from "./shortcuts";

const key = (code: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  code,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe("matchShortcut", () => {
  it("maps Shift+1…5 to Project, Editor, Timeline, Monitor, Inspector", () => {
    const ids = ["1", "2", "3", "4", "5"].map((d) => matchShortcut(key(`Digit${d}`, { shiftKey: true }), false));
    expect(ids).toEqual(["project", "editor", "timeline", "monitor", "inspector"].map((id) => ({ type: "panel", id })));
    expect(matchShortcut(key("Digit6", { shiftKey: true }), false)).toBeNull();
    expect(matchShortcut(key("Digit1"), false)).toBeNull();
  });

  it("maps ` to maximize and Ctrl+` to the terminal", () => {
    expect(matchShortcut(key("Backquote"), false)).toEqual({ type: "maximize" });
    expect(matchShortcut(key("Backquote", { ctrlKey: true }), false)).toEqual({ type: "terminal" });
  });

  it("maps Ctrl/Cmd+N to a new project", () => {
    expect(matchShortcut(key("KeyN", { ctrlKey: true }), false)).toEqual({ type: "newProject" });
    expect(matchShortcut(key("KeyN", { metaKey: true }), true)).toEqual({ type: "newProject" });
  });

  it("leaves typing alone: in an editable target only Ctrl+` and Ctrl+N act", () => {
    expect(matchShortcut(key("Digit1", { shiftKey: true }), true)).toBeNull();
    expect(matchShortcut(key("Backquote"), true)).toBeNull();
    expect(matchShortcut(key("Backquote", { ctrlKey: true }), true)).toEqual({ type: "terminal" });
  });

  it("ignores Alt combinations", () => {
    expect(matchShortcut(key("Digit1", { shiftKey: true, altKey: true }), false)).toBeNull();
  });
});

describe("panelShortcutEffect", () => {
  it("shows a hidden panel, focuses a visible one and hides it on a second press", () => {
    const hidden = hide(DEFAULT_LAYOUT, "editor");
    expect(panelShortcutEffect(hidden, null, "editor")).toBe("show");
    expect(panelShortcutEffect(DEFAULT_LAYOUT, "monitor", "editor")).toBe("focus");
    expect(panelShortcutEffect(DEFAULT_LAYOUT, "editor", "editor")).toBe("hide");
  });
});

describe("isEditableTarget", () => {
  it("is true for inputs, Monaco and the terminal, false for buttons", () => {
    document.body.innerHTML = `<input id="i"><div class="monaco-editor"><span id="m"></span></div><div class="xterm"><textarea id="x"></textarea></div><button id="b"></button>`;
    expect(["i", "m", "x", "b"].map((id) => isEditableTarget(document.getElementById(id)))).toEqual([true, true, true, false]);
    expect(isEditableTarget(null)).toBe(false);
  });
});
