import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { clearToken, getToken, onUnauthorized, setToken } from "./api/client";
import { useAgentEvents } from "./api/events";
import { useProjects } from "./api/hooks";
import type { ProjectSummary } from "./api/types";
import { EmptyWorkspace } from "./EmptyWorkspace";
import { LayoutProvider } from "./layout/LayoutContext";
import { TitleBar } from "./layout/TitleBar";
import { TokenGate } from "./layout/TokenGate";
import { useShortcuts } from "./layout/useShortcuts";
import { NewProjectDialog } from "./panels/project/NewProjectDialog";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { ToastViewport } from "./ui/Toast";

const LAST_PROJECT_KEY = "pnp.lastProject";

// Remembering the project is only a convenience, so storage errors (private mode) are ignored.
function readLastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

function rememberProject(id: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {
    // Ignored: see readLastProject.
  }
}

/** Reopens the last project; otherwise the first valid one, so its scenes show straight away. */
function useProjectSelection(projects: ProjectSummary[] | undefined) {
  const [picked, setPicked] = useState<string | null>(readLastProject);
  const valid = projects?.filter((p) => !p.error) ?? [];
  const projectId = valid.find((p) => p.id === picked)?.id ?? valid[0]?.id ?? null;

  function select(id: string) {
    rememberProject(id);
    setPicked(id);
  }
  return [projectId, select] as const;
}

function Studio({ onForgetToken }: { onForgetToken: () => void }) {
  const projects = useProjects();
  const [projectId, setProjectId] = useProjectSelection(projects.data);
  const [creating, setCreating] = useState(false);
  const { connected } = useAgentEvents();
  useShortcuts(() => setCreating(true));

  const titleBar = (queue?: ReactNode) => (
    <TitleBar
      projects={projects.data ?? []}
      projectId={projectId}
      onSelectProject={setProjectId}
      onNewProject={() => setCreating(true)}
      onForgetToken={onForgetToken}
      connected={connected}
      queue={queue}
    />
  );

  return (
    <>
      {projectId ? (
        <ProjectWorkspace key={projectId} pid={projectId} connected={connected} titleBar={titleBar} />
      ) : (
        <EmptyWorkspace titleBar={titleBar()} connected={connected} error={projects.error} onNewProject={() => setCreating(true)} />
      )}
      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setProjectId(id);
          }}
        />
      )}
    </>
  );
}

export function App() {
  const queryClient = useQueryClient();
  const [token, setTokenState] = useState(getToken);
  const [rejected, setRejected] = useState(false);

  useEffect(
    () =>
      onUnauthorized(() => {
        setRejected(true);
        setTokenState(null);
      }),
    [],
  );

  function connect(newToken: string) {
    setToken(newToken);
    queryClient.clear();
    setRejected(false);
    setTokenState(newToken);
  }

  function forget() {
    clearToken();
    queryClient.clear();
    setTokenState(null);
  }

  return (
    <>
      {token ? (
        <LayoutProvider>
          <Studio onForgetToken={forget} />
        </LayoutProvider>
      ) : (
        <TokenGate onSubmit={connect} rejected={rejected} />
      )}
      <ToastViewport />
    </>
  );
}
