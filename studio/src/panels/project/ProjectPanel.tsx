import { LayoutGrid, List } from "lucide-react";
import { useState } from "react";
import { PanelFrame } from "../../layout/PanelFrame";
import { useStudio } from "../../state/studio";
import { IconButton } from "../../ui/Button";
import { Tabs } from "../../ui/Tabs";
import { FileTree } from "./FileTree";
import { RenderBin, type BinView } from "./RenderBin";
import { SceneList } from "./SceneList";

type BinTab = "files" | "scenes" | "renders";

const TABS: { id: BinTab; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "scenes", label: "Scenes" },
  { id: "renders", label: "Renders" },
];

function ViewToggle({ view, onChange }: { view: BinView; onChange: (view: BinView) => void }) {
  return (
    <>
      <IconButton icon={List} label="List view" active={view === "list"} onClick={() => onChange("list")} />
      <IconButton icon={LayoutGrid} label="Grid view" active={view === "grid"} onClick={() => onChange("grid")} />
    </>
  );
}

/** The Project bin (Shift+1): Files, Scenes and Renders tabs. */
export function ProjectPanel({ pid }: { pid: string }) {
  const [tab, setTab] = useState<BinTab>("files");
  const [view, setView] = useState<BinView>("list");
  const { connected } = useStudio();
  return (
    <PanelFrame
      frame="project"
      panel="project"
      title={<Tabs label="Project bin" variant="header" items={TABS} value={tab} onChange={setTab} />}
      actions={tab === "renders" ? <ViewToggle view={view} onChange={setView} /> : undefined}
    >
      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label} className="h-full">
        {tab === "files" && <FileTree pid={pid} connected={connected} />}
        {tab === "scenes" && <SceneList />}
        {tab === "renders" && <RenderBin view={view} />}
      </div>
    </PanelFrame>
  );
}
