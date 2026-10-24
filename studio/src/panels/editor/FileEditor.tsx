import { lazy, Suspense, useEffect, useRef } from "react";
import { useFile } from "../../api/files";
import type { FileContent } from "../../api/types";
import type { Draft } from "../../editor/tabs";
import { ErrorText } from "../../ui/ErrorText";
import { useEtagSave } from "./useEtagSave";

const CodeEditor = lazy(() => import("./CodeEditor").then((m) => ({ default: m.CodeEditor })));

interface Props {
  pid: string;
  path: string;
  draft: Draft | undefined;
  revealLine: number | null;
  onEdit: (path: string, content: string, disk: FileContent) => void;
  onSaved: (path: string, content: string, etag: string) => void;
  onDiscard: (path: string) => void;
}

/** Ctrl/Cmd+S saves unless another panel has focus (and never opens the browser's "Save page" dialog). */
function useSaveShortcut(save: () => void): void {
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        // Another focused panel (e.g. the Timeline) saves its own content.
        const frame = document.activeElement?.closest("[data-frame]");
        if (frame && frame.getAttribute("data-frame") !== "editor") return;
        latest.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

const bannerButton = "press h-[22px] rounded-[4px] border border-current px-2 text-xs font-medium hover:bg-white/10";

function ConflictBanner({ onReload, onOverwrite }: { onReload: () => void; onOverwrite: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-warn/40 bg-warn/10 px-3 py-1.5 text-sm text-warn">
      <span className="font-semibold">Changed on disk.</span>
      <span>This file was modified outside the editor since you opened it.</span>
      <button type="button" onClick={onReload} className={bannerButton}>
        Reload
      </button>
      <button type="button" onClick={onOverwrite} className={bannerButton}>
        Overwrite
      </button>
    </div>
  );
}

function ReadOnlyMessage({ error }: { error: Error }) {
  return (
    <div className="space-y-1 p-4 text-sm">
      <ErrorText error={error} />
      <p className="text-fg-3">This file cannot be edited here.</p>
    </div>
  );
}

/** The active tab: loads the file, edits it in Monaco and saves it with its etag. */
export function FileEditor({ pid, path, draft, revealLine, onEdit, onSaved, onDiscard }: Props) {
  const file = useFile(pid, path);
  const save = useEtagSave(pid, path, (content, etag) => onSaved(path, content, etag));
  const value = draft?.content ?? file.data?.content ?? "";

  const saveNow = () => {
    if (draft) save.write(value, draft.etag);
  };
  useSaveShortcut(saveNow);

  function reload() {
    save.reset();
    onDiscard(path);
    void file.refetch();
  }

  if (file.isPending) return <p className="p-4 text-sm text-fg-3">Loading {path}…</p>;
  if (file.error) return <ReadOnlyMessage error={file.error} />;
  const disk = file.data;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {save.conflict && <ConflictBanner onReload={reload} onOverwrite={() => save.write(value, null)} />}
      {save.error && (
        <p role="alert" className="border-b border-record/40 px-3 py-1.5 text-sm text-record">
          Save failed: {save.error.message}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <Suspense fallback={<p className="p-4 text-sm text-fg-3">Loading editor…</p>}>
          <CodeEditor
            path={path}
            value={value}
            onChange={(content) => onEdit(path, content, disk)}
            onSave={saveNow}
            revealLine={revealLine}
          />
        </Suspense>
      </div>
    </div>
  );
}
