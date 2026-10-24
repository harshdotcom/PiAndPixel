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

export function EditorTabs({ tabs, active, onSelect, onClose }: Props) {
  return (
    <div role="tablist" aria-label="Open files" className="flex overflow-x-auto border-b border-line bg-panel">
      {tabs.map(({ path, dirty }) => {
        const selected = path === active;
        return (
          <div
            key={path}
            className={`flex shrink-0 items-center border-r border-line text-sm ${
              selected ? "bg-bg text-white" : "text-muted hover:text-white"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              title={path}
              onClick={() => onSelect(path)}
              className="flex items-center gap-2 py-2 pl-3"
            >
              {fileName(path)}
              {dirty && (
                <span aria-label="unsaved changes" className="h-2 w-2 rounded-full bg-warning" />
              )}
            </button>
            <button
              type="button"
              aria-label={`Close ${path}`}
              onClick={() => onClose(path)}
              className="px-2 py-2 text-muted hover:text-white"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
