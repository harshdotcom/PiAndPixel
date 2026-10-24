import type { ScenesResponse } from "../api/types";

interface Props {
  data: ScenesResponse;
  selected: string | null;
  onSelect: (ref: string) => void;
}

export function SceneList({ data, selected, onSelect }: Props) {
  return (
    <div className="space-y-3">
      {data.scenes.length === 0 ? (
        <p className="text-sm text-muted">No scenes found in this project.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {data.scenes.map((scene) => {
            const active = scene.ref === selected;
            return (
              <li key={scene.ref}>
                <button
                  type="button"
                  onClick={() => onSelect(scene.ref)}
                  aria-pressed={active}
                  title={`${scene.file}:${scene.line}`}
                  className={`rounded-md border px-3 py-2 text-left transition ${
                    active
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line hover:border-muted"
                  }`}
                >
                  <span className="block text-sm font-medium">{scene.class_name}</span>
                  <span className="block font-mono text-xs text-muted">{scene.file}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {data.errors.length > 0 && (
        <ul className="space-y-1 rounded-md border border-error/40 bg-error/5 p-3">
          {data.errors.map((err) => (
            <li key={`${err.file}:${err.line ?? ""}`} className="font-mono text-xs text-error">
              {err.file}
              {err.line !== null && `:${err.line}`} — {err.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
