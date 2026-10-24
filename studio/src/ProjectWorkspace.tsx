import type { ReactNode } from "react";
import { useRefreshProjectLists } from "./api/files";
import { outputBadge } from "./api/geometry";
import { useAgent } from "./api/hooks";
import { QueueCount, RenderActivity } from "./layout/Activity";
import { StatusBar } from "./layout/StatusBar";
import { Workspace } from "./layout/Workspace";
import { EditorPanel } from "./panels/editor/EditorPanel";
import { InspectorPanel } from "./panels/inspector/InspectorPanel";
import { LogsPanel } from "./panels/logs/LogsPanel";
import { MonitorPanel } from "./panels/monitor/MonitorPanel";
import { ProjectPanel } from "./panels/project/ProjectPanel";
import { TerminalPanel } from "./panels/terminal/TerminalPanel";
import { TimelinePanel } from "./panels/timeline/TimelinePanel";
import { CompositionProvider } from "./state/composition";
import { ExportProvider } from "./state/exports";
import { useCompletionToasts } from "./state/notifications";
import { RenderProvider, useRenders } from "./state/renders";
import { StudioProvider, useStudio } from "./state/studio";

/** Render and export state need the project's formats, so they sit inside StudioProvider. */
export function OutputProviders({ children }: { children: ReactNode }) {
  const { pid, project } = useStudio();
  const formats = project.data?.formats ?? {};
  return (
    <RenderProvider pid={pid} formats={formats}>
      <ExportProvider pid={pid} formats={formats}>
        <CompositionProvider pid={pid}>{children}</CompositionProvider>
      </ExportProvider>
    </RenderProvider>
  );
}

function Panels({ titleBar }: { titleBar: (queue: ReactNode) => ReactNode }) {
  const { pid, connected } = useStudio();
  const { output } = useRenders();
  const agent = useAgent();
  const refreshLists = useRefreshProjectLists(pid);
  useCompletionToasts(pid);
  return (
    <Workspace
      titleBar={titleBar(<QueueCount />)}
      statusBar={
        <StatusBar connected={connected} activity={<RenderActivity />} output={output.choice ? outputBadge({ ...output.choice, quality: "draft" }) : null} />
      }
      slots={{
        project: <ProjectPanel pid={pid} />,
        editor: <EditorPanel pid={pid} />,
        monitor: <MonitorPanel />,
        inspector: <InspectorPanel />,
        dock: (id, active) => {
          if (id === "timeline") return <TimelinePanel />;
          if (id === "logs") return <LogsPanel active={active} />;
          return <TerminalPanel pid={pid} enabled={agent.data?.features.terminal ?? false} active={active} onOutput={refreshLists} />;
        },
      }}
    />
  );
}

interface Props {
  pid: string;
  connected: boolean;
  /** The title bar, given this project's queue count. */
  titleBar: (queue: ReactNode) => ReactNode;
}

/** The Editing workspace for one open project. */
export function ProjectWorkspace({ pid, connected, titleBar }: Props) {
  return (
    <StudioProvider pid={pid} connected={connected}>
      <OutputProviders>
        <Panels titleBar={titleBar} />
      </OutputProviders>
    </StudioProvider>
  );
}
