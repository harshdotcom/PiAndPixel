// Workspace layout as pure state transitions, plus its persistence (docs/ui-design.md §2).

import {
  DOCK_PANELS,
  PANEL_IDS,
  SPLIT_DEFAULTS,
  isDockPanel,
  type DockPanel,
  type PanelId,
  type SplitId,
} from "./panels";

export const LAYOUT_KEY = "pnp.layout.v1";

/** Below these window widths the panel hides itself (it stays reachable from the rail). */
export const AUTO_HIDE_BELOW: Partial<Record<PanelId, number>> = { inspector: 1280, project: 1024 };

export interface LayoutState {
  visible: Record<PanelId, boolean>;
  /** Saved split sizes (see SPLIT_DEFAULTS for each split's unit); missing means the default. */
  splits: Partial<Record<SplitId, number>>;
  maximized: PanelId | null;
  /** The dock tab in front. */
  dockTab: DockPanel;
  /** Hidden because the window is narrow; not persisted. */
  autoHidden: PanelId[];
}

export const DEFAULT_LAYOUT: LayoutState = {
  visible: { project: true, editor: true, timeline: true, monitor: true, inspector: true, logs: true, terminal: true },
  splits: {},
  maximized: null,
  dockTab: "timeline",
  autoHidden: [],
};

export function isVisible(state: LayoutState, id: PanelId): boolean {
  return state.visible[id] && !state.autoHidden.includes(id);
}

/** Visible and, for a dock panel, the tab in front. */
export function isShown(state: LayoutState, id: PanelId): boolean {
  return isVisible(state, id) && (!isDockPanel(id) || state.dockTab === id);
}

export function dockVisible(state: LayoutState): boolean {
  return DOCK_PANELS.some((id) => isVisible(state, id));
}

export function show(state: LayoutState, id: PanelId): LayoutState {
  return {
    ...state,
    visible: { ...state.visible, [id]: true },
    autoHidden: state.autoHidden.filter((p) => p !== id),
    dockTab: isDockPanel(id) ? id : state.dockTab,
  };
}

/** Hides the panel; a hidden dock tab hands the front to the next visible one. */
export function hide(state: LayoutState, id: PanelId): LayoutState {
  const next = { ...state, visible: { ...state.visible, [id]: false } };
  if (state.maximized === id) next.maximized = null;
  if (isDockPanel(id) && state.dockTab === id) {
    next.dockTab = DOCK_PANELS.find((p) => isVisible(next, p)) ?? state.dockTab;
  }
  return next;
}

/** Rail / Window menu: hidden → show; a dock tab behind another → bring to front; otherwise hide. */
export function toggle(state: LayoutState, id: PanelId): LayoutState {
  if (!isVisible(state, id)) return show(state, id);
  if (isDockPanel(id) && state.dockTab !== id) return { ...state, dockTab: id };
  return hide(state, id);
}

export function toggleMaximize(state: LayoutState, id: PanelId): LayoutState {
  if (state.maximized) return { ...state, maximized: null };
  if (!isVisible(state, id)) return state;
  return { ...state, maximized: id, dockTab: isDockPanel(id) ? id : state.dockTab };
}

export function setSplit(state: LayoutState, id: SplitId, value: number): LayoutState {
  return { ...state, splits: { ...state.splits, [id]: value } };
}

/** Recomputes which panels the window width hides; a panel the user showed stays until the width changes band. */
export function applyWidth(state: LayoutState, width: number, previousWidth: number | null): LayoutState {
  const hiddenAt = (w: number | null) =>
    PANEL_IDS.filter((id) => w !== null && w < (AUTO_HIDE_BELOW[id] ?? 0));
  const now = hiddenAt(width);
  if (previousWidth !== null && now.join() === hiddenAt(previousWidth).join()) return state;
  const next = { ...state, autoHidden: now };
  return next.maximized && !isVisible(next, next.maximized) ? { ...next, maximized: null } : next;
}

/**
 * The layout of one two-panel group as percentages {a, b}. A hidden side gets 0 and its
 * neighbour all the space; with both visible the saved (or default) size applies.
 */
export function splitLayout(
  id: SplitId,
  saved: number | undefined,
  visibleA: boolean,
  visibleB: boolean,
  groupPx: number,
): { a: number; b: number } {
  if (!visibleA || !visibleB) return visibleA ? { a: 100, b: 0 } : { a: 0, b: 100 };
  const { unit, value } = SPLIT_DEFAULTS[id];
  const size = saved ?? value;
  const pctOf = (px: number) => (groupPx > 0 ? (px / groupPx) * 100 : 50);
  let a = unit === "pct" ? size : unit === "px-a" ? pctOf(size) : 100 - pctOf(size);
  a = Math.min(90, Math.max(10, a));
  return { a, b: 100 - a };
}

/** The value to save for a split after the user dragged it to `aPct` percent. */
export function splitValue(id: SplitId, aPct: number, groupPx: number): number {
  const { unit } = SPLIT_DEFAULTS[id];
  if (unit === "pct") return Math.round(aPct * 10) / 10;
  const px = ((unit === "px-a" ? aPct : 100 - aPct) / 100) * groupPx;
  return Math.round(px);
}

type Stored = Pick<LayoutState, "visible" | "splits" | "maximized" | "dockTab">;

function parseStored(raw: string): LayoutState | null {
  const data = JSON.parse(raw) as Partial<Stored>;
  if (typeof data !== "object" || data === null) return null;
  const visible = { ...DEFAULT_LAYOUT.visible };
  for (const id of PANEL_IDS) {
    if (typeof data.visible?.[id] === "boolean") visible[id] = data.visible[id];
  }
  const splits: LayoutState["splits"] = {};
  for (const [key, value] of Object.entries(data.splits ?? {})) {
    if (key in SPLIT_DEFAULTS && typeof value === "number" && Number.isFinite(value)) {
      splits[key as SplitId] = value;
    }
  }
  const maximized = PANEL_IDS.find((id) => id === data.maximized && visible[id]) ?? null;
  const dockTab = DOCK_PANELS.find((id) => id === data.dockTab) ?? DEFAULT_LAYOUT.dockTab;
  return { visible, splits, maximized, dockTab, autoHidden: [] };
}

/** The saved layout; the defaults when nothing (or something unreadable) is stored. */
export function loadLayout(storage: Pick<Storage, "getItem"> = localStorage): LayoutState {
  try {
    const raw = storage.getItem(LAYOUT_KEY);
    return (raw && parseStored(raw)) || DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(state: LayoutState, storage: Pick<Storage, "setItem"> = localStorage): void {
  const { visible, splits, maximized, dockTab } = state;
  try {
    storage.setItem(LAYOUT_KEY, JSON.stringify({ visible, splits, maximized, dockTab }));
  } catch {
    // Remembering the layout is a convenience; private mode or a full quota just skips it.
  }
}
