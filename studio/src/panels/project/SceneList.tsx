import { Clapperboard, Circle } from "lucide-react";
import type { SceneInfo } from "../../api/types";
import { requestOpenFile } from "../../state/openFile";
import { useRenders } from "../../state/renders";
import { useStudio } from "../../state/studio";
import { EmptyState, ErrorText } from "../../ui/ErrorText";

function SceneRow({ scene, selected, canRender }: { scene: SceneInfo; selected: boolean; canRender: boolean }) {
  const { selectScene } = useStudio();
  const renders = useRenders();
  return (
    <li
      className={`group flex h-[26px] items-center rounded-[4px] transition-colors duration-[80ms] ${
        selected ? "bg-accent-weak" : "hover:bg-raised"
      }`}
    >
      <button
        type="button"
        aria-pressed={selected}
        title={`${scene.file}:${scene.line} (double-click to open)`}
        onClick={() => selectScene(scene.ref)}
        onDoubleClick={() => requestOpenFile({ path: scene.file, line: scene.line })}
        className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm"
      >
        <Clapperboard size={14} strokeWidth={1.75} className={selected ? "text-accent" : "text-fg-3"} aria-hidden />
        <span className="truncate text-fg">{scene.class_name}</span>
        <span className="truncate font-mono text-xs text-fg-3">{scene.file}</span>
      </button>
      <button
        type="button"
        aria-label={`Render ${scene.class_name}`}
        disabled={!canRender || renders.busy}
        onClick={() => {
          selectScene(scene.ref);
          renders.start(scene.ref);
        }}
        className="press mr-1 flex h-5 items-center gap-1 rounded-[4px] px-1.5 text-xs text-fg-2 opacity-0 group-hover:opacity-100 hover:bg-header hover:text-fg focus:opacity-100 disabled:hidden"
      >
        <Circle size={8} fill="currentColor" className="text-record" aria-hidden />
        Render
      </button>
    </li>
  );
}

/** Project ▸ Scenes: discovered scenes and discovery errors. */
export function SceneList() {
  const { scenesQuery, sceneRef, connected } = useStudio();
  const { output } = useRenders();
  if (scenesQuery.error) return <ErrorText error={scenesQuery.error} className="p-2" />;
  if (!scenesQuery.data) return <p className="p-2 text-sm text-fg-3">Loading…</p>;
  const { scenes, errors } = scenesQuery.data;
  return (
    <div className="h-full overflow-y-auto p-1">
      {scenes.length === 0 && <EmptyState>No scenes found in this project.</EmptyState>}
      <ul aria-label="Scenes">
        {scenes.map((scene) => (
          <SceneRow key={scene.ref} scene={scene} selected={scene.ref === sceneRef} canRender={connected && output.ready} />
        ))}
      </ul>
      {errors.length > 0 && (
        <ul className="m-1 space-y-1 rounded-[4px] border border-record/40 bg-record/5 p-2">
          {errors.map((err) => (
            <li key={`${err.file}:${err.line ?? ""}`} className="font-mono text-xs text-record">
              {err.file}
              {err.line !== null && `:${err.line}`} — {err.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
