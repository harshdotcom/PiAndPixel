import { OutputFields } from "../../components/OutputControls";
import { useRenders } from "../../state/renders";
import { sceneName, useStudio } from "../../state/studio";
import { Button } from "../../ui/Button";
import { ErrorText } from "../../ui/ErrorText";
import { Select } from "../../ui/Select";

/** The record-style dot on the Render button. */
function RecordDot() {
  return <span aria-hidden className="h-2 w-2 rounded-full bg-record shadow-[0_0_0_2px_rgba(229,72,77,0.25)]" />;
}

/** Monitor header: the scene ● Render renders, labelled as such while the monitor shows something else. */
export function SceneSelect() {
  const { scenes, sceneRef, selectScene } = useStudio();
  const { source, sourceScene } = useRenders();
  const other = source !== null && sourceScene !== sceneRef;
  return (
    <Select label={other ? "Render scene" : "Scene"} small value={sceneRef ?? ""} disabled={scenes.length === 0} onChange={(e) => selectScene(e.target.value)} width={120} className="mr-1">
      {scenes.length === 0 && <option value="">No scenes</option>}
      {scenes.map((s) => (
        <option key={s.ref} value={s.ref}>
          {s.class_name}
        </option>
      ))}
    </Select>
  );
}

/** Monitor footer: the output settings with their exact size, and ● Render. */
export function RenderFooter() {
  const { sceneRef, connected } = useStudio();
  const renders = useRenders();
  const canRender = connected && sceneRef !== null && renders.output.ready && !renders.busy;
  return (
    <div className="shrink-0 border-t border-line bg-header px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 justify-end">
          <OutputFields output={renders.output} compact />
        </div>
        <Button
          variant="primary"
          disabled={!canRender}
          onClick={() => sceneRef && renders.start(sceneRef)}
          title={connected ? `Render ${sceneRef ? sceneName(sceneRef) : ""}` : "Waiting for the agent"}
        >
          <RecordDot />
          {renders.busy ? "Queuing…" : "Render"}
        </Button>
      </div>
      {renders.startError && <ErrorText error={renders.startError} className="mt-1.5" />}
    </div>
  );
}
