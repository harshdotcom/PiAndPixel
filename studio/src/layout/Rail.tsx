import { FolderOpen, FileCode2, GalleryHorizontalEnd, MonitorPlay, ScrollText, SlidersHorizontal, SquareTerminal, type LucideIcon } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import { useLayout } from "./LayoutContext";
import { isShown, isVisible } from "./layoutStore";
import { PANEL_IDS, PANELS, type PanelId } from "./panels";

export const PANEL_ICONS: Record<PanelId, LucideIcon> = {
  project: FolderOpen,
  editor: FileCode2,
  timeline: GalleryHorizontalEnd,
  monitor: MonitorPlay,
  inspector: SlidersHorizontal,
  logs: ScrollText,
  terminal: SquareTerminal,
};

/** Accent when in front; a weaker bar for a dock tab that is open behind another tab. */
function railClasses(on: boolean, behind: boolean) {
  if (on) return { text: "text-accent", bar: "bg-accent", box: "bg-accent-weak" };
  if (behind) return { text: "text-fg-2 hover:text-fg", bar: "bg-line-strong", box: "hover:bg-raised" };
  return { text: "text-fg-3 hover:text-fg", bar: "bg-transparent", box: "hover:bg-raised" };
}

/** The 44px left rail: one toggle per panel, with an accent bar on the ones showing. */
export function Rail() {
  const layout = useLayout();
  return (
    <nav aria-label="Panels" className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-header py-2">
      {PANEL_IDS.map((id) => {
        const Icon = PANEL_ICONS[id];
        const on = isShown(layout.state, id);
        const look = railClasses(on, !on && isVisible(layout.state, id));
        const { title, shortcut } = PANELS[id];
        return (
          <Tooltip key={id} label={title} shortcut={shortcut || undefined} side="right">
            <button
              type="button"
              aria-label={title}
              aria-pressed={on}
              onClick={() => layout.toggle(id)}
              className={`press relative flex h-8 w-11 items-center justify-center ${look.text}`}
            >
              <span aria-hidden className={`absolute top-1 bottom-1 left-0 w-0.5 rounded-r-[2px] ${look.bar}`} />
              <span className={`flex h-7 w-7 items-center justify-center rounded-[4px] ${look.box}`}>
                <Icon size={16} strokeWidth={1.75} aria-hidden />
              </span>
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
