import { useState, type FormEvent } from "react";
import { useCompositions, useSaveCompositions } from "../../api/compositions";
import type { SceneInfo } from "../../api/types";
import { ErrorText } from "../Panel";
import { nameProblem } from "./clips";

interface Props {
  pid: string;
  /** A new composition starts with one clip (the first scene), since it needs at least one. */
  scenes: SceneInfo[];
  selected: string | null;
  onSelect: (name: string) => void;
}

interface NewProps {
  pid: string;
  scenes: SceneInfo[];
  existing: string[];
  onCreated: (name: string) => void;
}

function NewComposition({ pid, scenes, existing, onCreated }: NewProps) {
  const compositions = useCompositions(pid);
  const save = useSaveCompositions(pid);
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const problem = trimmed ? nameProblem(trimmed, existing) : null;
  const first = scenes[0];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!compositions.data || !first || !trimmed || problem) return;
    const created = { title: null, clips: [{ scene: first.ref, params: {} }] };
    const all = { ...compositions.data.compositions, [trimmed]: created };
    save.mutate(
      { compositions: all, etag: compositions.data.etag },
      {
        onSuccess: () => {
          setName("");
          onCreated(trimmed);
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex gap-2">
        <input
          aria-label="New composition name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="main"
          disabled={!first}
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!first || !trimmed || problem !== null || save.isPending}
          className="rounded-md border border-accent/50 px-2.5 py-1 text-xs font-medium text-accent transition hover:bg-accent/10 disabled:opacity-40"
        >
          New
        </button>
      </div>
      {!first && <p className="text-xs text-muted">Add a scene first.</p>}
      {problem && <p className="text-xs text-error">{problem}</p>}
      {save.error && <ErrorText error={save.error} />}
    </form>
  );
}

/** Compositions of pnp.yaml, plus "new composition". */
export function CompositionList({ pid, scenes, selected, onSelect }: Props) {
  const compositions = useCompositions(pid);
  const names = Object.keys(compositions.data?.compositions ?? {});

  return (
    <div className="space-y-3">
      {compositions.error && <ErrorText error={compositions.error} />}
      {compositions.data && names.length === 0 && (
        <p className="text-sm text-muted">No compositions yet.</p>
      )}
      {names.length > 0 && (
        <ul aria-label="Compositions" className="flex flex-wrap gap-2">
          {names.map((name) => (
            <li key={name}>
              <button
                type="button"
                aria-pressed={name === selected}
                onClick={() => onSelect(name)}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${
                  name === selected
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line hover:border-muted"
                }`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <NewComposition pid={pid} scenes={scenes} existing={names} onCreated={onSelect} />
    </div>
  );
}
