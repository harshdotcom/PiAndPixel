import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { nameProblem } from "../../state/clips";
import { useComposition } from "../../state/composition";
import { useStudio } from "../../state/studio";
import { IconButton } from "../../ui/Button";
import { fieldClass } from "../../ui/Select";

/** Inline "name + Enter" field; a new composition starts with the first scene as its one clip. */
export function NewComposition({ onDone }: { onDone: () => void }) {
  const { names, create, creating } = useComposition();
  const { scenes } = useStudio();
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const problem = !scenes[0] ? "Add a scene first." : trimmed ? nameProblem(trimmed, names) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const first = scenes[0];
    if (!first || !trimmed || problem) return;
    create(trimmed, first.ref);
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <input
        aria-label="New composition name"
        placeholder="name, then Enter"
        autoFocus
        value={name}
        disabled={!scenes[0] || creating}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        onBlur={() => !trimmed && onDone()}
        aria-invalid={problem !== null}
        className={`${fieldClass} h-[22px] w-36 ${problem ? "border-record" : ""}`}
      />
      {problem && <span className="truncate text-xs text-record">{problem}</span>}
    </form>
  );
}

/** One tab per composition (● when it has unsaved edits) and + for a new one. */
export function CompositionTabs({ onMenu }: { onMenu: (name: string, at: { x: number; y: number }) => void }) {
  const { names, selected, select, isNameDirty } = useComposition();
  const { connected } = useStudio();
  const [adding, setAdding] = useState(false);
  return (
    <div role="tablist" aria-label="Compositions" className="flex min-w-0 items-center gap-0.5">
      {names.map((name) => (
        <button
          key={name}
          type="button"
          role="tab"
          aria-selected={name === selected}
          onClick={() => select(name)}
          onContextMenu={(e) => {
            e.preventDefault();
            select(name);
            onMenu(name, { x: e.clientX, y: e.clientY });
          }}
          className={`press flex h-[22px] items-center gap-1.5 rounded-[4px] px-2 font-mono text-sm ${
            name === selected ? "bg-accent-weak text-fg" : "text-fg-2 hover:bg-raised hover:text-fg"
          }`}
        >
          {name}
          {isNameDirty(name) && <span aria-label="unsaved" className="h-1.5 w-1.5 rounded-full bg-warn" />}
        </button>
      ))}
      {adding ? (
        <NewComposition onDone={() => setAdding(false)} />
      ) : (
        <IconButton icon={Plus} label={connected ? "New composition" : "Waiting for the agent"} disabled={!connected} onClick={() => setAdding(true)} />
      )}
    </div>
  );
}
