import { useEffect, useState } from "react";
import { useFileMoves } from "../../editor/fileMoves";
import {
  closeTab,
  discardDraft,
  editTab,
  markSaved,
  moveTab,
  NO_TABS,
  openTab,
  selectTab,
} from "../../editor/tabs";
import { useOpenFileRequests } from "../../state/openFile";
import { EditorTabs } from "./EditorTabs";
import { FileEditor } from "./FileEditor";

interface Props {
  pid: string;
}

/** Asks the browser to confirm leaving the page while there are unsaved edits. */
function useUnsavedWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/** Editor tabs + Monaco for one project; opens files on useOpenFileRequests. */
export function EditorArea({ pid }: Props) {
  const [state, setState] = useState(NO_TABS);
  useOpenFileRequests((location) => setState((s) => openTab(s, location)));
  useFileMoves((from, to) => setState((s) => moveTab(s, from, to)));
  useUnsavedWarning(Object.keys(state.drafts).length > 0);

  function close(path: string) {
    if (state.drafts[path] && !window.confirm(`Discard unsaved changes to ${path}?`)) return;
    setState((s) => closeTab(s, path));
  }

  const tabs = state.paths.map((path) => ({ path, dirty: path in state.drafts }));
  return (
    <div className="flex h-full min-h-96 flex-col">
      <EditorTabs
        tabs={tabs}
        active={state.active}
        onSelect={(path) => setState((s) => selectTab(s, path))}
        onClose={close}
      />
      <div className="min-h-0 flex-1">
        {state.active ? (
          <FileEditor
            pid={pid}
            path={state.active}
            draft={state.drafts[state.active]}
            revealLine={state.reveal}
            onEdit={(path, content, disk) => setState((s) => editTab(s, path, content, disk))}
            onSaved={(path, content, etag) => setState((s) => markSaved(s, path, content, etag))}
            onDiscard={(path) => setState((s) => discardDraft(s, path))}
          />
        ) : (
          <p className="p-6 text-sm text-muted">Open a file from the Files list to edit it.</p>
        )}
      </div>
    </div>
  );
}
