import { ChevronRight, MoreHorizontal, Plus, Save, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { draftClip } from "../../state/clips";
import { useComposition } from "../../state/composition";
import { useExportSettings } from "../../state/exports";
import { useStudio } from "../../state/studio";
import { Button, IconButton } from "../../ui/Button";
import { Menu, MenuList, type MenuPosition } from "../../ui/Menu";
import { Select } from "../../ui/Select";
import { CompositionTabs } from "./CompositionTabs";

interface Props {
  zoom: number;
  onZoom: (zoom: number) => void;
}

function AddClip() {
  const { scenes, connected } = useStudio();
  const { draft, update } = useComposition();
  const items = scenes.map((s) => ({
    label: s.class_name,
    shortcut: s.file.split("/").pop(),
    onSelect: () => draft && update({ clips: [...draft.clips, draftClip(s.ref)] }),
  }));
  return (
    <Menu label="Add clip" disabled={!connected} title={connected ? undefined : "Waiting for the agent"} items={items.length ? items : [{ kind: "label", label: "No scenes" }]} trigger={<><Plus size={14} strokeWidth={1.75} aria-hidden /> Clip</>} />
  );
}

function Zoom({ zoom, onZoom }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      <IconButton icon={ZoomOut} label="Zoom out" onClick={() => onZoom(Math.max(0, zoom - 10))} />
      <input type="range" aria-label="Zoom" min={0} max={100} value={zoom} onChange={(e) => onZoom(Number(e.target.value))} className="w-24 accent-[var(--accent)]" />
      <IconButton icon={ZoomIn} label="Zoom in" onClick={() => onZoom(Math.min(100, zoom + 10))} />
    </div>
  );
}

function ExportButton() {
  const { connected } = useStudio();
  const { selected, dirty } = useComposition();
  const exports = useExportSettings();
  const reason = !connected ? "Waiting for the agent" : dirty ? "Save the composition first: Export uses the saved version." : undefined;
  return (
    <Button
      variant="primary"
      title={reason}
      disabled={!selected || dirty || !connected || !exports.output.ready || exports.pending}
      onClick={() => selected && exports.start(selected)}
    >
      Export
      <ChevronRight size={14} strokeWidth={2} aria-hidden />
    </Button>
  );
}

/** Composition tabs, + clip, unsaved state and Save, zoom and Export ▸. */
export function TimelineToolbar({ zoom, onZoom }: Props) {
  const c = useComposition();
  const { connected } = useStudio();
  const exportSettings = useExportSettings();
  const [menu, setMenu] = useState<{ name: string; at: MenuPosition } | null>(null);
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-2">
      <CompositionTabs onMenu={(name, at) => setMenu({ name, at })} />
      {c.draft && <span className="h-4 w-px bg-line" aria-hidden />}
      {c.draft && <AddClip />}
      <span className="flex-1" />
      {c.dirty && <span className="text-xs whitespace-nowrap text-warn">● unsaved</span>}
      {c.draft && (
        <Button icon={Save} title="Save (Ctrl+S)" disabled={!c.dirty || !c.composition || c.saving || !connected} onClick={c.save}>
          Save
        </Button>
      )}
      {c.selected && (
        <IconButton
          icon={MoreHorizontal}
          label="Composition actions"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (c.selected) setMenu({ name: c.selected, at: { x: rect.left, y: rect.bottom + 2 } });
          }}
        />
      )}
      <Zoom zoom={zoom} onZoom={onZoom} />
      <Select label="Delivery" small value={exportSettings.deliveryProfile}
        onChange={(event) => exportSettings.setDeliveryProfile(event.target.value as "custom" | "reels_shorts")}
        width={148}>
        <option value="custom">Custom export</option>
        <option value="reels_shorts">Reels + Shorts</option>
      </Select>
      <ExportButton />
      {menu && (
        <MenuList
          label={`Actions for ${menu.name}`}
          position={menu.at}
          onClose={() => setMenu(null)}
          items={[
            { label: "Reload from disk", onSelect: c.reload },
            { kind: "separator" },
            { label: "Delete composition…", danger: true, onSelect: c.remove },
          ]}
        />
      )}
    </div>
  );
}
