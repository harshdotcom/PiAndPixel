import { OutputFields } from "../../components/OutputControls";
import { useComposition } from "../../state/composition";
import { useExportSettings } from "../../state/exports";
import { useStudio } from "../../state/studio";
import { formatClipLength } from "../monitor/timecode";
import { allRendered, layoutClips, totalSeconds } from "../timeline/timelineMath";
import { useSceneDurations } from "../timeline/useSceneDurations";
import { Prop, Section } from "./Section";

/** The selected composition's length from its clips' last renders; "≈" while some were never rendered. */
function EstimatedDuration() {
  const { pid } = useStudio();
  const { draft } = useComposition();
  const scenes = draft?.clips.map((c) => c.scene) ?? [];
  const boxes = layoutClips(scenes, useSceneDurations(pid, scenes), 1);
  if (boxes.length === 0) return <Prop label="Duration">–</Prop>;
  const exact = allRendered(boxes);
  return (
    <Prop label="Duration">
      <span title={exact ? undefined : "Some clips were never rendered; they count as 5 s."}>
        {exact ? "" : "≈ "}
        {formatClipLength(totalSeconds(boxes))}
      </span>
    </Prop>
  );
}

/** Inspector ▸ Output: the export settings the Timeline's Export uses. */
export function OutputSection() {
  const { output } = useExportSettings();
  const { selected } = useComposition();
  return (
    <Section title="Output">
      <OutputFields output={output} />
      <Prop label="Frame size">{output.size ? `${output.size.width}×${output.size.height}` : "too large"}</Prop>
      <Prop label="Sequence">{selected ?? "–"}</Prop>
      <EstimatedDuration />
    </Section>
  );
}
