import { Trash2 } from "lucide-react";
import { parseParams } from "../../state/clips";
import { useComposition } from "../../state/composition";
import { useStudio } from "../../state/studio";
import { Button } from "../../ui/Button";
import { Hint, Prop, Section } from "./Section";

/** Params of the clip selected on the Timeline, as JSON text checked while typing. */
function ClipParams() {
  const { draft, selectedClip, update, selectClip } = useComposition();
  const clips = draft?.clips ?? [];
  const index = clips.findIndex((c) => c.id === selectedClip);
  const clip = clips[index];
  if (!clip) return null;
  const parsed = parseParams(clip.paramsText);
  const error = "error" in parsed ? parsed.error : null;
  const label = `Clip ${index + 1}`;
  return (
    <>
      <Prop label="Clip">{index + 1} of {clips.length}</Prop>
      <Prop label="Scene">
        <span className="font-mono" title={clip.scene}>{clip.scene}</span>
      </Prop>
      <label className="block space-y-1 text-sm text-fg-2">
        <span>Params (JSON)</span>
        <textarea
          aria-label={`${label} params`}
          aria-invalid={error !== null}
          value={clip.paramsText}
          spellCheck={false}
          rows={Math.max(3, Math.min(10, clip.paramsText.split("\n").length))}
          onChange={(e) => update({ clips: clips.map((c) => (c.id === clip.id ? { ...c, paramsText: e.target.value } : c)) })}
          className={`block w-full resize-y rounded-[4px] border bg-sunken px-2 py-1.5 font-mono text-xs text-fg outline-none ${
            error ? "border-record" : "border-line focus:border-accent"
          }`}
        />
      </label>
      {error && <p className="text-xs text-record">{error}</p>}
      <Button
        variant="danger"
        icon={Trash2}
        onClick={() => {
          update({ clips: clips.filter((c) => c.id !== clip.id) });
          selectClip(null);
        }}
      >
        Remove clip
      </Button>
    </>
  );
}

/** Inspector ▸ Selection: the selected timeline clip, else the selected scene. */
export function SelectionSection() {
  const { selectedClip, draft } = useComposition();
  const { scenes, sceneRef } = useStudio();
  const hasClip = draft?.clips.some((c) => c.id === selectedClip) ?? false;
  const scene = scenes.find((s) => s.ref === sceneRef);
  return (
    <Section title="Selection">
      {hasClip ? (
        <ClipParams />
      ) : (
        <>
          {scene && (
            <>
              <Prop label="Scene">{scene.class_name}</Prop>
              <Prop label="File">
                <span className="font-mono">
                  {scene.file}:{scene.line}
                </span>
              </Prop>
            </>
          )}
          <Hint>Select a clip on the Timeline to edit its params.</Hint>
        </>
      )}
    </Section>
  );
}
