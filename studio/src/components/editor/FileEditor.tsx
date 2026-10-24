import { lazy, Suspense, useEffect, useRef } from "react";
import { useFile } from "../../api/files";
import type { FileContent } from "../../api/types";
import type { Draft } from "../../editor/tabs";
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

/** Ctrl/Cmd+S anywhere saves (and never opens the browser's "Save page" dialog). */
function useSaveShortcut(save: () => void): void {
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        latest.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

const bannerButton = "rounded border border-current px-2 py-0.5 text-xs font-medium hover:bg-white/10";

function ConflictBanner({ onReload, onOverwrite }: { onReload: () => void; onOverwrite: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
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
    <div className="p-4 text-sm">
      <p role="alert" className="text-error">
        {error.message}
      </p>
      <p className="mt-1 text-muted">This file cannot be edited here.</p>
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

  if (file.isPending) return <p className="p-4 text-sm text-muted">Loading {path}…</p>;
  if (file.error) return <ReadOnlyMessage error={file.error} />;
  const disk = file.data;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {save.conflict && <ConflictBanner onReload={reload} onOverwrite={() => save.write(value, null)} />}
      {save.error && (
        <p role="alert" className="border-b border-error/40 px-3 py-2 text-sm text-error">
          Save failed: {save.error.message}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <Suspense fallback={<p className="p-4 text-sm text-muted">Loading editor…</p>}>
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
