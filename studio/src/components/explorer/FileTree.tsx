import { useMemo, useState } from "react";
import { useCreateFile, useDeleteFile, useFileTree, useRenameFile } from "../../api/files";
import { announceFileMoved } from "../../editor/fileMoves";
import { buildTree } from "../../editor/fileTree";
import { requestOpenFile } from "../../state/openFile";
import { ErrorText } from "../Panel";
import { PathForm } from "./PathForm";
import { TreeRows } from "./TreeRows";

interface Props {
  pid: string;
}

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

/** The project's files; clicking one calls requestOpenFile. Create, rename and delete. */
export function FileTree({ pid }: Props) {
  const tree = useFileTree(pid);
  const [collapsed, toggle] = useCollapsed();
  const nodes = useMemo(() => buildTree(tree.data?.entries ?? []), [tree.data]);
  const { editing, setEditing, createFile, renameFile, deleteFile, ...status } = useFileActions(pid);

  return (
    <div className="text-sm">
      {tree.isPending && <p className="text-muted">Loading…</p>}
      {tree.error && <ErrorText error={tree.error} />}
      {tree.data && nodes.length === 0 && <p className="text-muted">No files yet.</p>}
      <TreeRows
        nodes={nodes}
        depth={0}
        collapsed={collapsed}
        onToggle={toggle}
        onOpen={(path) => requestOpenFile({ path })}
        onRename={(from) => setEditing({ kind: "rename", from })}
        onDelete={deleteFile}
      />
      {editing?.kind === "rename" && (
        <PathForm
          key={editing.from}
          label={`New path for ${editing.from}`}
          initial={editing.from}
          submitText="Rename"
          pending={status.renaming}
          onSubmit={(to) => renameFile(editing.from, to)}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing?.kind === "new" && (
        <PathForm
          label="New file path"
          initial=""
          submitText="Create"
          pending={status.creating}
          onSubmit={createFile}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing === null && (
        <button type="button" onClick={() => setEditing({ kind: "new" })} className="mt-2 text-xs text-accent hover:underline">
          + New file
        </button>
      )}
      {status.error && <p className="mt-2 text-xs text-error">{status.error.message}</p>}
    </div>
  );
}
