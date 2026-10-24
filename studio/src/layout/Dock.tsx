import type { ReactNode } from "react";
import { Tabs } from "../ui/Tabs";
import { useLayout } from "./LayoutContext";
import { isVisible } from "./layoutStore";
import { PanelFrame } from "./PanelFrame";
import { DOCK_PANELS, PANELS, type DockPanel } from "./panels";

interface Props {
  /** The body of a dock tab; `active` is true while it is the tab in front. */
  render: (id: DockPanel, active: boolean) => ReactNode;
}

/**
 * The bottom-right dock: Timeline, Logs and Terminal as tabs in one frame. Every tab body stays
 * mounted (only not displayed), even while its panel is hidden, so a running shell, the log
 * filter and scroll positions survive both a tab switch and a hide/show.
 */
export function Dock({ render }: Props) {
  const layout = useLayout();
  const { state } = layout;
  const items = DOCK_PANELS.filter((id) => isVisible(state, id)).map((id) => ({ id, label: PANELS[id].title }));
  return (
    <PanelFrame
      frame="dock"
      panel={state.dockTab}
      title={<Tabs label="Bottom dock" variant="header" items={items} value={state.dockTab} onChange={layout.focus} />}
    >
      {DOCK_PANELS.map((id) => {
        const front = id === state.dockTab && isVisible(state, id);
        return (
          <div key={id} role="tabpanel" aria-label={PANELS[id].title} hidden={!front} className="h-full">
            {render(id, front)}
          </div>
        );
      })}
    </PanelFrame>
  );
}
