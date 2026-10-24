import { useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { useSaveFile } from "../../api/files";

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 412;
}

/**
 * Saves one tab's content with its etag. A 412 becomes `conflict` (the file changed on disk)
 * instead of an error, so the editor can offer Reload / Overwrite.
 */
export function useEtagSave(pid: string, path: string, onSaved: (content: string, etag: string) => void) {
  const save = useSaveFile(pid);
  const [conflictFor, setConflictFor] = useState<string | null>(null);
  const saving = useRef(false);

  /** etag null = overwrite whatever is on disk now. */
  function write(content: string, etag: string | null) {
    if (saving.current) return; // Monaco's command and the window shortcut can both fire.
    saving.current = true;
    save.mutate(
      { path, content, etag },
      {
        onSuccess: (saved) => {
          setConflictFor(null);
          onSaved(content, saved.etag);
        },
        onError: (error) => {
          if (isConflict(error)) setConflictFor(path);
        },
        onSettled: () => {
          saving.current = false;
        },
      },
    );
  }

  function reset() {
    setConflictFor(null);
    save.reset();
  }

  const failed = save.error && !isConflict(save.error) && save.variables?.path === path;
  return { write, reset, conflict: conflictFor === path, error: failed ? save.error : null };
}
