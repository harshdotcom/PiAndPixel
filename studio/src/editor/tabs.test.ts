import { describe, expect, it } from "vitest";
import {
  closeTab,
  discardDraft,
  editTab,
  markSaved,
  moveTab,
  NO_TABS,
  openTab,
  selectTab,
  type TabsState,
} from "./tabs";

const disk = { path: "a.py", content: "x = 1\n", etag: "e1" };

function opened(...paths: string[]): TabsState {
  return paths.reduce((state, path) => openTab(state, { path }), NO_TABS);
}

describe("editor tabs", () => {
  it("opens a tab once and focuses it again with the requested line", () => {
    let state = opened("a.py", "b.py");
    state = openTab(state, { path: "a.py", line: 7 });
    expect(state.paths).toEqual(["a.py", "b.py"]);
    expect(state.active).toBe("a.py");
    expect(state.reveal).toBe(7);
    expect(selectTab(state, "b.py")).toMatchObject({ active: "b.py", reveal: null });
  });

  it("closing the active tab activates its neighbour and drops its edits", () => {
    let state = editTab(opened("a.py", "b.py", "c.py"), "b.py", "new", { ...disk, path: "b.py" });
    state = selectTab(state, "b.py");
    state = closeTab(state, "b.py");
    expect(state).toMatchObject({ paths: ["a.py", "c.py"], active: "c.py", drafts: {} });
    expect(closeTab(state, "c.py").active).toBe("a.py");
    expect(closeTab(opened("a.py"), "a.py").active).toBeNull();
  });

  it("is dirty after an edit and clean again when the edit is undone", () => {
    let state = editTab(opened("a.py"), "a.py", "x = 2\n", disk);
    expect(state.drafts["a.py"]).toEqual({ content: "x = 2\n", etag: "e1" });
    state = editTab(state, "a.py", "x = 1\n", disk);
    expect(state.drafts).toEqual({});
  });

  it("keeps the etag the edits are based on even if the disk copy was reloaded", () => {
    let state = editTab(opened("a.py"), "a.py", "x = 2\n", disk);
    state = editTab(state, "a.py", "x = 3\n", { ...disk, content: "x = 9\n", etag: "e2" });
    expect(state.drafts["a.py"]?.etag).toBe("e1");
  });

  it("is clean after a save unless the user typed meanwhile", () => {
    const state = editTab(opened("a.py"), "a.py", "x = 2\n", disk);
    expect(markSaved(state, "a.py", "x = 2\n", "e2").drafts).toEqual({});
    const typing = editTab(state, "a.py", "x = 22\n", disk);
    expect(markSaved(typing, "a.py", "x = 2\n", "e2").drafts["a.py"]).toEqual({
      content: "x = 22\n",
      etag: "e2",
    });
    expect(discardDraft(state, "a.py").drafts).toEqual({});
  });

  it("follows a renamed file and closes a deleted one", () => {
    let state = editTab(opened("a.py", "b.py"), "a.py", "y", disk);
    state = selectTab(state, "a.py");
    state = moveTab(state, "a.py", "scenes/a.py");
    expect(state).toMatchObject({ paths: ["scenes/a.py", "b.py"], active: "scenes/a.py" });
    expect(state.drafts).toEqual({ "scenes/a.py": { content: "y", etag: "e1" } });
    state = moveTab(state, "b.py", null);
    expect(state.paths).toEqual(["scenes/a.py"]);
    expect(moveTab(state, "other.py", "x.py")).toBe(state);
  });
});
