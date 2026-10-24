import type { ReactNode } from "react";
import { Dock } from "./Dock";
import { useLayout } from "./LayoutContext";
import { dockVisible, isVisible } from "./layoutStore";
import type { DockPanel } from "./panels";
import { Rail } from "./Rail";
import { SplitGroup } from "./SplitGroup";

export interface WorkspaceSlots {
  project: ReactNode;
  editor: ReactNode;
  monitor: ReactNode;
  inspector: ReactNode;
  dock: (id: DockPanel, active: boolean) => ReactNode;
}

interface Props {
  titleBar: ReactNode;
  statusBar: ReactNode;
  slots: WorkspaceSlots;
}

/** Minimum sizes from docs/ui-design.md §1, in pixels. */
const MIN = { editor: 320, monitor: 360, project: 220, dock: 400, inspector: 260, row: 140 };
const GUTTER = 4;

/** The narrowest a row of two optional panels can be: both minimums and the gutter between. */
function rowMin(showA: boolean, showB: boolean, minA: number, minB: number): number {
  return (showA ? minA : 0) + (showB ? minB : 0) + (showA && showB ? GUTTER : 0);
}

/**
 * The Editing workspace: title bar, rail, the docked panels in four resizable splits
 * (left | inspector, top | bottom, editor | monitor, project | dock) and the status bar.
 */
export function Workspace({ titleBar, statusBar, slots }: Props) {
  const { state } = useLayout();
  const show = {
    editor: isVisible(state, "editor"),
    monitor: isVisible(state, "monitor"),
    project: isVisible(state, "project"),
    dock: dockVisible(state),
    inspector: isVisible(state, "inspector"),
  };
  const top = show.editor || show.monitor;
  const bottom = show.project || show.dock;
  // The left column must fit its widest row, so the Inspector cannot squeeze a panel below its minimum.
  const leftMin = Math.max(rowMin(show.editor, show.monitor, MIN.editor, MIN.monitor), rowMin(show.project, show.dock, MIN.project, MIN.dock));

  const topRow = (
    <SplitGroup id="top" orientation="horizontal" a={{ visible: show.editor, minSize: MIN.editor, children: slots.editor }} b={{ visible: show.monitor, minSize: MIN.monitor, children: slots.monitor }} />
  );
  const bottomRow = (
    <SplitGroup id="bottom" orientation="horizontal" a={{ visible: show.project, minSize: MIN.project, children: slots.project }} b={{ visible: show.dock, minSize: MIN.dock, children: <Dock render={slots.dock} /> }} />
  );
  const left = (
    <SplitGroup id="rows" orientation="vertical" a={{ visible: top, minSize: MIN.row, children: topRow }} b={{ visible: bottom, minSize: MIN.row, children: bottomRow }} />
  );

  return (
    <div className="flex h-full flex-col bg-app">
      {titleBar}
      <div className="flex min-h-0 flex-1">
        <Rail />
        <main className="min-w-0 flex-1 p-1">
          <SplitGroup id="columns" orientation="horizontal" a={{ visible: top || bottom, minSize: leftMin, children: left }} b={{ visible: show.inspector, minSize: MIN.inspector, children: slots.inspector }} />
        </main>
      </div>
      {statusBar}
    </div>
  );
}
