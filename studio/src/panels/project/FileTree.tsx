import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useCreateFile, useDeleteFile, useFileTree, useRenameFile } from "../../api/files";
import { announceFileMoved } from "../../editor/fileMoves";
import { buildTree } from "../../editor/fileTree";
import { requestOpenFile } from "../../state/openFile";
import { Button } from "../../ui/Button";
import { EmptyState, ErrorText } from "../../ui/ErrorText";
import { MenuList, type MenuPosition } from "../../ui/Menu";
import { PathForm } from "./PathForm";
import { TreeRows } from "./TreeRows";

interface Props {
  pid: string;
  /** False while the agent is unreachable: New file, Rename and Delete are disabled. */
  connected?: boolean;
}

const WAITING = "Waiting for the agent";

type Editing = { kind: "new" } | { kind: "rename"; from: string } | null;

function useCollapsed() {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  function toggle(dir: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(dir)) next.add(dir);
      return next;
    });
  }
  return [collapsed, toggle] as const;
}

/** Create, rename and delete, plus which path form (if any) is open. */
function useFileActions(pid: string) {
  const create = useCreateFile(pid);
  const rename = useRenameFile(pid);
  const remove = useDeleteFile(pid);
  const [editing, setEditing] = useState<Editing>(null);

  function createFile(path: string) {
    const onSuccess = () => {
      setEditing(null);
      requestOpenFile({ path });
    };
    create.mutate({ path, content: "" }, { onSuccess });
  }

  function renameFile(from: string, to: string) {
    const onSuccess = () => {
      setEditing(null);
      announceFileMoved(from, to);
    };
    rename.mutate({ from, to }, { onSuccess });
  }

  function deleteFile(path: string) {
    if (!window.confirm(`Delete ${path}? This cannot be undone.`)) return;
    remove.mutate(path, { onSuccess: () => announceFileMoved(path, null) });
  }

  return {
    editing,
    setEditing,
    createFile,
    renameFile,
    deleteFile,
    creating: create.isPending,
    renaming: rename.isPending,
    error: create.error ?? rename.error ?? remove.error,
  };
}

interface RowMenu {
  path: string;
  at: MenuPosition;
}

type Actions = ReturnType<typeof useFileActions>;

/** The open "new file" or "rename" form, if any. */
function PathForms({ actions }: { actions: Actions }) {
  const { editing, setEditing } = actions;
  if (editing?.kind === "new") {
    return (
      <PathForm label="New file path" initial="" submitText="Create" pending={actions.creating} onSubmit={actions.createFile} onCancel={() => setEditing(null)} />
    );
  }
  if (editing?.kind === "rename") {
    return (
      <PathForm
        key={editing.from}
        label={`New path for ${editing.from}`}
        initial={editing.from}
        submitText="Rename"
        pending={actions.renaming}
        onSubmit={(to) => actions.renameFile(editing.from, to)}
        onCancel={() => setEditing(null)}
      />
    );
  }
  return null;
}

function RowActions({ menu, actions, offline, onClose }: { menu: RowMenu; actions: Actions; offline: boolean; onClose: () => void }) {
  return (
    <MenuList
      label={`Actions for ${menu.path}`}
      position={menu.at}
      onClose={onClose}
      items={[
        { label: "Open", onSelect: () => requestOpenFile({ path: menu.path }) },
        { label: "Rename…", disabled: offline, onSelect: () => actions.setEditing({ kind: "rename", from: menu.path }) },
        { kind: "separator" },
        { label: "Delete", danger: true, disabled: offline, onSelect: () => actions.deleteFile(menu.path) },
      ]}
    />
  );
}

/** The project's files; clicking one calls requestOpenFile. Create, and rename / delete from a context menu. */
export function FileTree({ pid, connected = true }: Props) {
  const tree = useFileTree(pid);
  const [collapsed, toggle] = useCollapsed();
  const [menu, setMenu] = useState<RowMenu | null>(null);
  const nodes = useMemo(() => buildTree(tree.data?.entries ?? []), [tree.data]);
  const actions = useFileActions(pid);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center px-1.5">
        <Button
          variant="ghost"
          icon={Plus}
          title={connected ? undefined : WAITING}
          onClick={() => actions.setEditing({ kind: "new" })}
          disabled={actions.editing !== null || !connected}
        >
          New file
        </Button>
      </div>
      <PathForms actions={actions} />
      {actions.error && <ErrorText error={actions.error} className="px-2 py-1" />}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {tree.isPending && <p className="p-2 text-sm text-fg-3">Loading…</p>}
        {tree.error && <ErrorText error={tree.error} className="p-2" />}
        {tree.data && nodes.length === 0 && <EmptyState>No files yet.</EmptyState>}
        <TreeRows
          nodes={nodes}
          depth={0}
          collapsed={collapsed}
          onToggle={toggle}
          onOpen={(path) => requestOpenFile({ path })}
          onMenu={(path, at) => setMenu({ path, at })}
        />
      </div>
      {menu && <RowActions menu={menu} actions={actions} offline={!connected} onClose={() => setMenu(null)} />}
    </div>
  );
}
