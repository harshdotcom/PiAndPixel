import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { getToken, onUnauthorized, setToken } from "./api/client";
import { useAgentEvents } from "./api/events";
import { useRefreshProjectLists } from "./api/files";
import { useAgent, useProject, useProjects, useScenes } from "./api/hooks";
import type { ProjectSummary, SceneInfo } from "./api/types";
import { AgentBadge } from "./components/AgentBadge";
import { CompositionEditor } from "./components/compose/CompositionEditor";
import { CompositionList } from "./components/compose/CompositionList";
import { ExportPanel } from "./components/compose/ExportPanel";
import { RecentExports } from "./components/compose/RecentExports";
import { EditorArea } from "./components/editor/EditorArea";
import { FileTree } from "./components/explorer/FileTree";
import { NewProjectForm } from "./components/NewProjectForm";
import { ErrorText, Panel } from "./components/Panel";
import { ProjectList } from "./components/ProjectList";
import { RenderSection } from "./components/RenderSection";
import { SceneList } from "./components/SceneList";
import { TerminalPanel } from "./components/terminal/TerminalPanel";
import { TokenGate } from "./components/TokenGate";

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{children}</h2>
  );
}

const columns = "grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)_26rem]";
const leftColumn = "space-y-6 overflow-y-auto border-line p-4 lg:border-r";
const rightColumn = "space-y-5 overflow-y-auto border-line p-4 lg:border-l";

interface OutputProps {
  pid: string;
  scenes: SceneInfo[];
  sceneRef: string | null;
  composition: string | null;
  onCompositionDeleted: () => void;
}

/** Right column: render a scene, edit the selected composition, export it. */
function OutputColumn({ pid, scenes, sceneRef, composition, onCompositionDeleted }: OutputProps) {
  const project = useProject(pid);
  const [unsaved, setUnsaved] = useState(false);
  if (project.error) return <ErrorText error={project.error} />;
  if (!project.data) return null;
  return (
    <>
      <RenderSection pid={pid} formats={project.data.formats} sceneRef={sceneRef} />
      {composition && (
        <Panel title={`Composition · ${composition}`}>
          <CompositionEditor
            pid={pid}
            name={composition}
            scenes={scenes}
            onDeleted={onCompositionDeleted}
            onDirtyChange={setUnsaved}
          />
        </Panel>
      )}
      <ExportPanel
        pid={pid}
        composition={composition}
        formats={project.data.formats}
        unsaved={composition !== null && unsaved}
      />
      <RecentExports pid={pid} />
    </>
  );
}

/** Left: explorer · center: editor + terminal · right: preview, render, exports. */
function ProjectWorkspace({ pid, nav }: { pid: string; nav: ReactNode }) {
  const agent = useAgent();
  const scenes = useScenes(pid);
  const refreshLists = useRefreshProjectLists(pid);
  const [pickedScene, setPickedScene] = useState<string | null>(null);
  const [composition, setComposition] = useState<string | null>(null);
  const sceneRef = pickedScene ?? scenes.data?.scenes[0]?.ref ?? null;
  const sceneList = scenes.data?.scenes ?? [];

  return (
    <div className={columns}>
      <aside className={leftColumn}>
        {nav}
        <div>
          <SectionTitle>Files</SectionTitle>
          <FileTree pid={pid} />
        </div>
        <div>
          <SectionTitle>Scenes</SectionTitle>
          {scenes.error && <ErrorText error={scenes.error} />}
          {scenes.data && (
            <SceneList data={scenes.data} selected={sceneRef} onSelect={setPickedScene} />
          )}
        </div>
        <div>
          <SectionTitle>Compositions</SectionTitle>
          <CompositionList pid={pid} scenes={sceneList} selected={composition} onSelect={setComposition} />
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="min-h-0 flex-1">
          <EditorArea pid={pid} />
        </div>
        <TerminalPanel pid={pid} enabled={agent.data?.features.terminal ?? false} onOutput={refreshLists} />
      </main>
      <aside className={rightColumn}>
        <OutputColumn
          pid={pid}
          scenes={sceneList}
          sceneRef={sceneRef}
          composition={composition}
          onCompositionDeleted={() => setComposition(null)}
        />
      </aside>
    </div>
  );
}

function AgentOffline({ error }: { error: Error }) {
  return (
    <div className="mx-auto mt-16 max-w-lg rounded-lg border border-error/40 bg-panel p-6">
      <h2 className="text-lg font-semibold text-error">Cannot reach the agent</h2>
      <p className="mt-2 text-sm text-muted">{error.message}</p>
      <p className="mt-4 text-sm text-muted">
        Start it in a terminal with <code className="font-mono text-white">pnp studio</code> and open
        the link it prints.
      </p>
    </div>
  );
}

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

function Studio() {
  const agent = useAgent();
  const projects = useProjects();
  const [projectId, setProjectId] = useProjectSelection(projects.data);
  useAgentEvents();

  const nav = (
    <>
      <div>
        <SectionTitle>Projects</SectionTitle>
        {projects.isPending && <p className="text-sm text-muted">Loading…</p>}
        {projects.error && <ErrorText error={projects.error} />}
        {projects.data && (
          <ProjectList projects={projects.data} selected={projectId} onSelect={setProjectId} />
        )}
      </div>
      <NewProjectForm onCreated={setProjectId} />
    </>
  );

  let body: ReactNode;
  if (agent.error) {
    body = (
      <main className="flex-1 p-6">
        <AgentOffline error={agent.error} />
      </main>
    );
  } else if (projectId) {
    body = <ProjectWorkspace key={projectId} pid={projectId} nav={nav} />;
  } else {
    body = (
      <div className={columns}>
        <aside className={leftColumn}>{nav}</aside>
        <main className="flex min-h-64 items-center justify-center p-6 text-muted lg:col-span-2">
          Select or create a project to start.
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-6 py-3">
        <h1 className="text-lg font-semibold">
          Pi <span className="text-accent">&amp;</span> Pixel <span className="text-muted">Studio</span>
        </h1>
        <AgentBadge />
      </header>
      {body}
    </div>
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

  if (!token) return <TokenGate onSubmit={connect} rejected={rejected} />;
  return <Studio />;
}
