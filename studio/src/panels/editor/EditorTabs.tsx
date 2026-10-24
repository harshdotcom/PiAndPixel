import { X } from "lucide-react";

export interface EditorTab {
  path: string;
  dirty: boolean;
}

interface Props {
  tabs: EditorTab[];
  active: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Open files as tabs; a dirty file shows a dot (in --warn) before its close button. */
export function EditorTabs({ tabs, active, onSelect, onClose }: Props) {
  if (tabs.length === 0) return null;
  return (
    <div role="tablist" aria-label="Open files" className="flex h-[30px] shrink-0 overflow-x-auto border-b border-line bg-header">
      {tabs.map(({ path, dirty }) => {
        const selected = path === active;
        return (
          <div
            key={path}
            className={`group relative flex shrink-0 items-center border-r border-line text-sm transition-colors duration-[80ms] ${
              selected ? "bg-panel text-fg" : "text-fg-2 hover:bg-raised hover:text-fg"
            }`}
          >
            {selected && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              title={path}
              onClick={() => onSelect(path)}
              className="flex h-full items-center gap-2 pr-1 pl-3 font-mono"
            >
              {fileName(path)}
              {dirty && <span aria-label="unsaved changes" className="h-1.5 w-1.5 rounded-full bg-warn" />}
            </button>
            <button
              type="button"
              aria-label={`Close ${path}`}
              onClick={() => onClose(path)}
              className="mr-1 flex h-5 w-5 items-center justify-center rounded-[4px] text-fg-3 hover:bg-raised hover:text-fg"
            >
              <X size={12} strokeWidth={2} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
