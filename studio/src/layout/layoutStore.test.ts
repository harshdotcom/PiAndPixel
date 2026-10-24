import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  LAYOUT_KEY,
  applyWidth,
  hide,
  isShown,
  isVisible,
  loadLayout,
  saveLayout,
  setSplit,
  show,
  splitLayout,
  splitValue,
  toggle,
  toggleMaximize,
} from "./layoutStore";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
};

describe("toggle / show / hide", () => {
  it("hides a visible panel and shows it again", () => {
    const hidden = toggle(DEFAULT_LAYOUT, "inspector");
    expect(isVisible(hidden, "inspector")).toBe(false);
    expect(isVisible(toggle(hidden, "inspector"), "inspector")).toBe(true);
  });

  it("brings a dock tab behind another to the front instead of hiding it", () => {
    const logs = toggle(DEFAULT_LAYOUT, "logs");
    expect(logs.dockTab).toBe("logs");
    expect(isVisible(logs, "logs")).toBe(true);
    expect(isShown(logs, "timeline")).toBe(false);
    expect(isVisible(toggle(logs, "logs"), "logs")).toBe(false);
  });

  it("hands the dock front to the next visible tab when the front one is hidden", () => {
    const next = hide(DEFAULT_LAYOUT, "timeline");
    expect(next.dockTab).toBe("logs");
  });

  it("un-maximizes a panel that gets hidden", () => {
    const max = toggleMaximize(DEFAULT_LAYOUT, "monitor");
    expect(max.maximized).toBe("monitor");
    expect(hide(max, "monitor").maximized).toBeNull();
  });

  it("maximize toggles back, and cannot maximize a hidden panel", () => {
    const max = toggleMaximize(DEFAULT_LAYOUT, "editor");
    expect(toggleMaximize(max, "editor").maximized).toBeNull();
    expect(toggleMaximize(hide(DEFAULT_LAYOUT, "editor"), "editor").maximized).toBeNull();
  });

  it("show brings a panel back from auto-hide", () => {
    const narrow = applyWidth(DEFAULT_LAYOUT, 1100, null);
    expect(isVisible(narrow, "inspector")).toBe(false);
    expect(isVisible(show(narrow, "inspector"), "inspector")).toBe(true);
  });
});

describe("hide gives space to the neighbour", () => {
  it("gives a hidden side 0% and the other 100%", () => {
    expect(splitLayout("top", undefined, false, true, 1000)).toEqual({ a: 0, b: 100 });
    expect(splitLayout("top", undefined, true, false, 1000)).toEqual({ a: 100, b: 0 });
  });

  it("restores the saved size once both sides show again", () => {
    expect(splitLayout("top", 30, true, true, 1000)).toEqual({ a: 30, b: 70 });
  });

  it("keeps pixel-sized sides at their pixel size (inspector 300px, bin 340px)", () => {
    expect(splitLayout("columns", undefined, true, true, 1500)).toEqual({ a: 80, b: 20 });
    expect(splitLayout("bottom", undefined, true, true, 1700)).toEqual({ a: 20, b: 80 });
  });

  it("saves a dragged size in the split's own unit", () => {
    expect(splitValue("top", 42.345, 1000)).toBe(42.3);
    expect(splitValue("columns", 75, 1200)).toBe(300);
    expect(splitValue("bottom", 25, 1200)).toBe(300);
  });
});

describe("auto-hide on narrow windows", () => {
  it("hides the Inspector below 1280px and the bin below 1024px", () => {
    expect(applyWidth(DEFAULT_LAYOUT, 1280, null).autoHidden).toEqual([]);
    expect(applyWidth(DEFAULT_LAYOUT, 1279, null).autoHidden).toEqual(["inspector"]);
    expect(applyWidth(DEFAULT_LAYOUT, 1000, null).autoHidden).toEqual(["project", "inspector"]);
  });

  it("keeps a panel the user showed while the width stays in the same band", () => {
    const shown = show(applyWidth(DEFAULT_LAYOUT, 1200, null), "inspector");
    expect(applyWidth(shown, 1210, 1200)).toBe(shown);
    expect(isVisible(applyWidth(shown, 1300, 1210), "inspector")).toBe(true);
  });
});

describe("persistence", () => {
  it("saves visibility, sizes, maximized and the dock tab, and loads them back", () => {
    const storage = memoryStorage();
    const state = setSplit(toggleMaximize(hide(DEFAULT_LAYOUT, "editor"), "monitor"), "rows", 64);
    saveLayout({ ...state, autoHidden: ["inspector"] }, storage);
    const loaded = loadLayout(storage);
    expect(loaded.visible.editor).toBe(false);
    expect(loaded.splits).toEqual({ rows: 64 });
    expect(loaded.maximized).toBe("monitor");
    expect(loaded.autoHidden).toEqual([]);
    expect(Object.keys(storage.data)).toEqual([LAYOUT_KEY]);
  });

  it("reset is the default layout", () => {
    expect(loadLayout(memoryStorage())).toEqual(DEFAULT_LAYOUT);
  });

  it.each([
    ["not JSON", "{oops"],
    ["null", "null"],
    ["wrong types", JSON.stringify({ visible: { editor: "no" }, splits: { rows: "x", bogus: 3 }, maximized: "nope", dockTab: 7 })],
  ])("falls back to the defaults for corrupt storage (%s)", (_, raw) => {
    const loaded = loadLayout(memoryStorage({ [LAYOUT_KEY]: raw }));
    expect(loaded.visible).toEqual(DEFAULT_LAYOUT.visible);
    expect(loaded.splits).toEqual({});
    expect(loaded.maximized).toBeNull();
    expect(loaded.dockTab).toBe("timeline");
  });

  it("works when storage throws", () => {
    expect(loadLayout(throwing)).toEqual(DEFAULT_LAYOUT);
    expect(() => saveLayout(DEFAULT_LAYOUT, throwing)).not.toThrow();
  });
});
