import { useState, type FormEvent } from "react";

interface Props {
  label: string;
  initial: string;
  submitText: string;
  pending: boolean;
  onSubmit: (path: string) => void;
  onCancel: () => void;
}

/** One-line form for a project-relative path, e.g. "scenes/new.py". */
export function PathForm({ label, initial, submitText, pending, onSubmit, onCancel }: Props) {
  const [path, setPath] = useState(initial);
  const trimmed = path.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <form onSubmit={submit} className="mt-2 flex gap-1">
      <input
        aria-label={label}
        placeholder="scenes/new.py"
        autoFocus
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1 font-mono text-xs outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={!trimmed || pending}
        className="rounded border border-accent/50 px-2 text-xs text-accent hover:bg-accent/10 disabled:opacity-40"
      >
        {submitText}
      </button>
      <button type="button" onClick={onCancel} className="px-1 text-xs text-muted hover:text-white">
        Cancel
      </button>
    </form>
  );
}
