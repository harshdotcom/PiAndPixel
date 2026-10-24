import { useState, type FormEvent } from "react";
import { Button } from "../../ui/Button";
import { fieldClass } from "../../ui/Select";

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
    <form onSubmit={submit} className="mt-1 flex gap-1 px-1">
      <input
        aria-label={label}
        placeholder="scenes/new.py"
        autoFocus
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className={`${fieldClass} min-w-0 flex-1 font-mono`}
      />
      <Button type="submit" variant="primary" disabled={!trimmed || pending} className="h-[26px]">
        {submitText}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
