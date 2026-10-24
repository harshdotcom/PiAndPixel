import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { PanelFrame } from "./layout/PanelFrame";
import { StatusBar } from "./layout/StatusBar";
import { Workspace } from "./layout/Workspace";
import { AgentSection } from "./panels/inspector/AgentSection";
import { Placeholder } from "./panels/monitor/Viewer";
import { Button } from "./ui/Button";
import { EmptyState, ErrorText } from "./ui/ErrorText";

interface Props {
  titleBar: ReactNode;
  connected: boolean;
  /** Why there is no project (e.g. the projects could not be listed), if known. */
  error: Error | null;
  onNewProject: () => void;
}

const DOCK_HINTS = {
  timeline: "Open a project to edit its compositions.",
  logs: "Render a scene to see its log.",
  terminal: "Open a project to use the terminal.",
};

/** The workspace before a project exists or is opened: the same panels, in their empty state. */
export function EmptyWorkspace({ titleBar, connected, error, onNewProject }: Props) {
  return (
    <Workspace
      titleBar={titleBar}
      statusBar={<StatusBar connected={connected} />}
      slots={{
        project: (
          <PanelFrame frame="project" panel="project">
            <EmptyState>
              {error ? <ErrorText error={error} /> : <span>No project open.</span>}
              <Button variant="primary" icon={Plus} onClick={onNewProject}>
                New project…
              </Button>
            </EmptyState>
          </PanelFrame>
        ),
        editor: (
          <PanelFrame frame="editor" panel="editor">
            <EmptyState>Create or open a project to edit its files.</EmptyState>
          </PanelFrame>
        ),
        monitor: (
          <PanelFrame frame="monitor" panel="monitor">
            <div className="flex h-full items-center justify-center bg-sunken p-2">
              <div className="aspect-video max-h-full w-full bg-black">
                <Placeholder />
              </div>
            </div>
          </PanelFrame>
        ),
        inspector: (
          <PanelFrame frame="inspector" panel="inspector">
            <AgentSection />
          </PanelFrame>
        ),
        dock: (id) => <EmptyState>{DOCK_HINTS[id]}</EmptyState>,
      }}
    />
  );
}
