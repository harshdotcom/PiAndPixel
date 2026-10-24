import { PanelFrame } from "../../layout/PanelFrame";
import { useStudio } from "../../state/studio";
import { AgentSection } from "./AgentSection";
import { JobSection } from "./JobSection";
import { OutputSection } from "./OutputSection";
import { SelectionSection } from "./SelectionSection";

/** The Inspector (Shift+5): Selection, Output, Job and Agent sections. */
export function InspectorPanel() {
  const { connected } = useStudio();
  return (
    <PanelFrame frame="inspector" panel="inspector">
      <div className="h-full overflow-y-auto">
        <SelectionSection />
        <OutputSection />
        <JobSection />
        <AgentSection stale={!connected} />
      </div>
    </PanelFrame>
  );
}
