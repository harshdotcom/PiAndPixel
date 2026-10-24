import { ChevronDown, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { gigabytes, missingTools } from "../api/agentInfo";
import { useAgent } from "../api/hooks";
import type { ProjectSummary } from "../api/types";
import { Menu, type MenuEntry } from "../ui/Menu";
import { useLayout } from "./LayoutContext";
import { isVisible } from "./layoutStore";
import { PANEL_IDS, PANELS } from "./panels";

interface Props {
  projects: ProjectSummary[];
  projectId: string | null;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onForgetToken: () => void;
  /** The live events socket is open. */
  connected: boolean;
  /** The queue count; only known with a project open. */
  queue?: ReactNode;
}

const WAITING = "Waiting for the agent";

function Logo() {
  return (
    <span aria-label="Pi & Pixel" className="flex h-6 items-center rounded-[4px] bg-accent px-1.5 text-sm font-bold tracking-tight text-sunken">
      π&amp;px
    </span>
  );
}

/** "● Agent · 8 CPU · 16.0 GB": green when renders can run, amber when a tool is missing, red when offline. */
export function AgentStatus({ connected = true }: { connected?: boolean }) {
  const { data, error, isPending } = useAgent();
  if (isPending) return <span className="text-sm text-fg-3">Connecting…</span>;
  if (error || !connected) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-record">
        <span aria-hidden className="h-2 w-2 rounded-full bg-record" /> Agent unreachable
      </span>
    );
  }
  const missing = missingTools(data);
  const ready = missing.length === 0;
  const title = ready ? "Agent ready" : `Missing: ${missing.join(", ")}`;
  return (
    <span data-testid="agent-badge" data-ready={ready} title={title} className="tabular flex items-center gap-1.5 text-sm text-fg-2">
      <span aria-hidden className={`h-2 w-2 rounded-full ${ready ? "bg-ok" : "bg-warn"}`} />
      <span className={ready ? "text-fg" : "text-warn"}>{ready ? "Agent" : title}</span>
      <span className="text-fg-3">·</span> {data.cpu_count} CPU <span className="text-fg-3">·</span> {gigabytes(data.ram_total_mb)}
    </span>
  );
}

function projectItems({ projects, projectId, onSelectProject, onNewProject }: Props): MenuEntry[] {
  return [
    { kind: "label", label: "Projects" },
    ...projects.map((p) => ({
      label: p.error ? `${p.name} (unreadable)` : p.name,
      checked: p.id === projectId,
      disabled: p.error !== null,
      onSelect: () => onSelectProject(p.id),
    })),
    { kind: "separator" },
    { label: "New project…", shortcut: "Ctrl+N", onSelect: onNewProject },
  ];
}

function useWindowItems(): MenuEntry[] {
  const layout = useLayout();
  // ✓ means open, including a dock tab behind another one; choosing a checked item hides it.
  return [
    ...PANEL_IDS.map((id) => {
      const visible = isVisible(layout.state, id);
      return {
        label: PANELS[id].title,
        checked: visible,
        shortcut: PANELS[id].shortcut || undefined,
        onSelect: () => (visible ? layout.hide(id) : layout.show(id)),
      };
    }),
    { kind: "separator" as const },
    { label: "Reset workspace", onSelect: layout.reset },
  ];
}

/** 40px title bar: logo, Project ▾, Window ▾, workspace name, agent status, queue and settings. */
export function TitleBar(props: Props) {
  const layout = useLayout();
  const current = props.projects.find((p) => p.id === props.projectId);
  const windowItems = useWindowItems();
  return (
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-header px-2">
      <Logo />
      <Menu label="Project" items={projectItems(props)} disabled={!props.connected} title={props.connected ? undefined : WAITING} triggerClassName="ml-1.5 font-medium text-fg" trigger={<>{current?.name ?? "No project"}<ChevronDown size={14} className="text-fg-3" aria-hidden /></>} />
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      <Menu label="Window" items={windowItems} triggerClassName="text-fg-2" trigger={<>Window<ChevronDown size={14} className="text-fg-3" aria-hidden /></>} />
      <span className="ml-3 text-xs text-fg-3">
        Workspace: <span className="text-fg-2">Editing</span>
      </span>
      <span className="flex-1" />
      <AgentStatus connected={props.connected} />
      <span className="mx-2 h-4 w-px bg-line" aria-hidden />
      {props.queue}
      <Menu
        label="Settings"
        triggerClassName="ml-1 w-7 justify-center px-0 text-fg-2"
        trigger={<Settings size={16} strokeWidth={1.75} aria-hidden />}
        items={[
          { label: "Reset workspace", onSelect: layout.reset },
          { kind: "separator" },
          { label: "Forget token", danger: true, onSelect: props.onForgetToken },
        ]}
      />
    </header>
  );
}
