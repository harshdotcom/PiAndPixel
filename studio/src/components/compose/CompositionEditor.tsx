import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { useCompositions, useSaveCompositions } from "../../api/compositions";
import type { Composition, CompositionsResponse, SceneInfo } from "../../api/types";
import { ErrorText } from "../Panel";
import { ClipRow } from "./ClipRow";
import { draftClip, moveClip, toComposition, type DraftClip } from "./clips";

interface Props {
  pid: string;
  name: string;
  scenes: SceneInfo[];
  /** Called after the composition was deleted, so the caller can clear the selection. */
  onDeleted: () => void;
  /** True while the editor shows changes that are not saved to pnp.yaml yet. */
  onDirtyChange?: (dirty: boolean) => void;
}

interface FormProps {
  pid: string;
  name: string;
  scenes: SceneInfo[];
  initial: Composition;
  /** The compositions as loaded; every save is checked against their etag. */
  loaded: CompositionsResponse;
  onDeleted: () => void;
  onReload: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const button =
  "rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-40";

function AddClip({ scenes, onAdd }: { scenes: SceneInfo[]; onAdd: (ref: string) => void }) {
  const [scene, setScene] = useState(scenes[0]?.ref ?? "");
  const picked = scenes.some((s) => s.ref === scene) ? scene : (scenes[0]?.ref ?? "");
  return (
    <div className="flex gap-2">
      <select
        aria-label="Scene to add"
        value={picked}
        onChange={(e) => setScene(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
      >
        {scenes.map((s) => (
          <option key={s.ref} value={s.ref}>
            {s.class_name} · {s.file}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!picked}
        onClick={() => onAdd(picked)}
        className={`${button} border-line`}
      >
        Add clip
      </button>
    </div>
  );
}

interface ClipListProps {
  clips: DraftClip[];
  scenes: SceneInfo[];
  onChange: (clips: DraftClip[]) => void;
}

function ClipList({ clips, scenes, onChange }: ClipListProps) {
  return (
    <>
      {clips.length === 0 && <p className="text-sm text-muted">Add at least one clip.</p>}
      <ol aria-label="Clips" className="space-y-2">
        {clips.map((clip, i) => (
          <ClipRow
            key={clip.id}
            clip={clip}
            index={i}
            count={clips.length}
            onChange={(changed) => onChange(clips.map((c) => (c.id === clip.id ? changed : c)))}
            onMove={(offset) => onChange(moveClip(clips, i, offset))}
            onRemove={() => onChange(clips.filter((c) => c.id !== clip.id))}
          />
        ))}
      </ol>
      <AddClip scenes={scenes} onAdd={(ref) => onChange([...clips, draftClip(ref)])} />
    </>
  );
}

function SaveError({ error, onReload }: { error: Error; onReload: () => void }) {
  if (!(error instanceof ApiError && error.status === 412)) return <ErrorText error={error} />;
  return (
    <p role="alert" className="flex items-center gap-3 text-sm text-warning">
      pnp.yaml changed on disk.
      <button type="button" onClick={onReload} className={`${button} border-warning/50`}>
        Reload
      </button>
    </p>
  );
}

/** What the user can change, without the local clip ids: equal keys mean nothing to save. */
function editKey(title: string, clips: Pick<DraftClip, "scene" | "paramsText">[]): string {
  return JSON.stringify([title, clips.map((c) => [c.scene, c.paramsText])]);
}

/** Reports whether `key` differs from the last saved one; reset with the returned setter. */
function useDirty(key: string, onDirtyChange?: (dirty: boolean) => void) {
  const [savedKey, setSavedKey] = useState(key);
  const dirty = key !== savedKey;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  return setSavedKey;
}

interface ActionsProps {
  canSave: boolean;
  pending: boolean;
  onSave: () => void;
  onDelete: () => void;
}

function FormActions({ canSave, pending, onSave, onDelete }: ActionsProps) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={!canSave || pending}
        onClick={onSave}
        className={`${button} border-accent bg-accent text-bg`}
      >
        Save
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onDelete}
        className={`${button} ml-auto border-error/50 text-error`}
      >
        Delete
      </button>
    </div>
  );
}

function TitleField({ value, onChange }: { value: string; onChange: (title: string) => void }) {
  return (
    <label className="block text-xs text-muted">
      Title
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-white outline-none focus:border-accent"
      />
    </label>
  );
}

function CompositionForm({ pid, name, scenes, initial, loaded, ...events }: FormProps) {
  const save = useSaveCompositions(pid);
  const [etag, setEtag] = useState(loaded.etag);
  const [title, setTitle] = useState(initial.title ?? "");
  const [clips, setClips] = useState<DraftClip[]>(() =>
    initial.clips.map((c) => draftClip(c.scene, c.params)),
  );
  const composition = toComposition(title, clips);
  const key = editKey(title, clips);
  const setSavedKey = useDirty(key, events.onDirtyChange);

  function saveEdits() {
    if (composition) put({ ...loaded.compositions, [name]: composition }, () => setSavedKey(key));
  }

  function put(compositions: Record<string, Composition>, onSuccess: () => void) {
    save.mutate(
      { compositions, etag },
      {
        onSuccess: (saved) => {
          setEtag(saved.etag);
          onSuccess();
        },
      },
    );
  }

  function remove() {
    if (!window.confirm(`Delete composition "${name}"?`)) return;
    const rest = Object.fromEntries(Object.entries(loaded.compositions).filter(([n]) => n !== name));
    put(rest, events.onDeleted);
  }

  return (
    <div className="space-y-3">
      <TitleField value={title} onChange={setTitle} />
      <ClipList clips={clips} scenes={scenes} onChange={setClips} />
      <FormActions
        canSave={composition !== null}
        pending={save.isPending}
        onSave={saveEdits}
        onDelete={remove}
      />
      {save.error && <SaveError error={save.error} onReload={events.onReload} />}
    </div>
  );
}

/** Ordered clip editor for one composition: add scene, remove, move up/down, params JSON. */
export function CompositionEditor({ pid, name, scenes, onDeleted, onDirtyChange }: Props) {
  const compositions = useCompositions(pid);
  const [loads, setLoads] = useState(0);
  const initial = compositions.data?.compositions[name];

  // A remount (new key) drops the local edits and starts again from what is on disk.
  async function reload() {
    await compositions.refetch();
    setLoads((n) => n + 1);
  }

  if (compositions.error) return <ErrorText error={compositions.error} />;
  if (!compositions.data) return <p className="text-sm text-muted">Loading…</p>;
  if (!initial) return <p className="text-sm text-muted">This composition no longer exists.</p>;
  return (
    <CompositionForm
      key={`${name}#${loads}`}
      pid={pid}
      name={name}
      scenes={scenes}
      initial={initial}
      loaded={compositions.data}
      onDeleted={onDeleted}
      onReload={() => void reload()}
      onDirtyChange={onDirtyChange}
    />
  );
}
