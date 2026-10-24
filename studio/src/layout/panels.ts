// The workspace's panels and how they are arranged (docs/ui-design.md §1).

export const PANEL_IDS = ["project", "editor", "timeline", "monitor", "inspector", "logs", "terminal"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

/** Panels that share the bottom-right dock as tabs. */
export const DOCK_PANELS = ["timeline", "logs", "terminal"] as const;
export type DockPanel = (typeof DOCK_PANELS)[number];

/** A frame is one docked box on screen; the dock frame holds several panels as tabs. */
export type FrameId = "project" | "editor" | "monitor" | "inspector" | "dock";

export interface PanelMeta {
  id: PanelId;
  title: string;
  shortcut: string;
}

export const PANELS: Record<PanelId, PanelMeta> = {
  project: { id: "project", title: "Project", shortcut: "Shift+1" },
  editor: { id: "editor", title: "Editor", shortcut: "Shift+2" },
  timeline: { id: "timeline", title: "Timeline", shortcut: "Shift+3" },
  monitor: { id: "monitor", title: "Program", shortcut: "Shift+4" },
  inspector: { id: "inspector", title: "Inspector", shortcut: "Shift+5" },
  logs: { id: "logs", title: "Logs", shortcut: "" },
  terminal: { id: "terminal", title: "Terminal", shortcut: "Ctrl+`" },
};

/** Shift+1…5, in Premiere's order. */
export const SHORTCUT_PANELS: PanelId[] = ["project", "editor", "timeline", "monitor", "inspector"];

export function isDockPanel(id: PanelId): id is DockPanel {
  return (DOCK_PANELS as readonly PanelId[]).includes(id);
}

export function frameOf(id: PanelId): FrameId {
  return isDockPanel(id) ? "dock" : id;
}

/** The four two-way splits of the workspace; "a" is the left or top side. */
export type SplitId = "columns" | "rows" | "top" | "bottom";

export interface SplitDefault {
  /** How the size is kept: a percentage of side a, or a fixed pixel size of one side. */
  unit: "pct" | "px-a" | "px-b";
  value: number;
}

/** Default split at 1920×1080: inspector 300px, top row 58%, editor/monitor 50/50, bin 340px. */
export const SPLIT_DEFAULTS: Record<SplitId, SplitDefault> = {
  columns: { unit: "px-b", value: 300 },
  rows: { unit: "pct", value: 58 },
  top: { unit: "pct", value: 50 },
  bottom: { unit: "px-a", value: 340 },
};
