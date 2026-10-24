import type { UseQueryResult } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useCompositions, useSaveCompositions } from "../api/compositions";
import type { Composition, CompositionsResponse } from "../api/types";
import { draftComposition, draftFrom, editKey, isDirty, rebase, type Draft } from "./compositionDraft";

export interface CompositionValue {
  query: UseQueryResult<CompositionsResponse>;
  names: string[];
  /** The composition open in the Timeline. */
  selected: string | null;
  select: (name: string) => void;
  draft: Draft | null;
  dirty: boolean;
  isNameDirty: (name: string) => boolean;
  /** What Save would write, or null while a clip is invalid or there are none. */
  composition: Composition | null;
  update: (change: Partial<Pick<Draft, "title" | "clips">>) => void;
  /** Local id of the clip selected on the Timeline (the Inspector edits its params). */
  selectedClip: number | null;
  selectClip: (id: number | null) => void;
  save: () => void;
  remove: () => void;
  reload: () => void;
  saving: boolean;
  saveError: Error | null;
  create: (name: string, scene: string) => void;
  creating: boolean;
  createError: Error | null;
}

const CompositionContext = createContext<CompositionValue | null>(null);

export function useComposition(): CompositionValue {
  const value = useContext(CompositionContext);
  if (!value) throw new Error("useComposition needs a CompositionProvider");
  return value;
}

type Drafts = Record<string, Draft>;

function without<T>(record: Record<string, T>, name: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([n]) => n !== name));
}
type SaveMutation = ReturnType<typeof useSaveCompositions>;

/** PUTs every composition with If-Match `etag`, then rebases the drafts and applies `after`. */
function makePut(save: SaveMutation, setDrafts: (fn: (d: Drafts) => Drafts) => void) {
  return (compositions: Record<string, Composition>, etag: string, after: (d: Drafts) => Drafts, onSaved?: () => void) =>
    save.mutate(
      { compositions, etag },
      {
        onSuccess: (saved) => {
          setDrafts((d) => after(rebase(d, etag, saved.etag)));
          onSaved?.();
        },
      },
    );
}

/** Opens a draft for the selected composition the first time it is shown. */
function useDrafts(query: UseQueryResult<CompositionsResponse>, selected: string | null) {
  const [drafts, setDrafts] = useState<Drafts>({});
  const onDisk = selected ? query.data?.compositions[selected] : undefined;
  if (selected && onDisk && query.data && !drafts[selected]) {
    setDrafts({ ...drafts, [selected]: draftFrom(onDisk, query.data.etag) });
  }
  return [drafts, setDrafts] as const;
}

type DraftsState = ReturnType<typeof useDrafts>;

/** Save, delete, reload and create: each a PUT of every composition with the right etag. */
function useCompositionActions(pid: string, query: UseQueryResult<CompositionsResponse>, selected: string | null, [drafts, setDrafts]: DraftsState, onCreated: (name: string) => void) {
  const saver = useSaveCompositions(pid);
  const creator = useSaveCompositions(pid);
  const put = makePut(saver, setDrafts);
  const draft = selected ? (drafts[selected] ?? null) : null;
  const all = query.data?.compositions ?? {};

  function save() {
    const composition = draft && draftComposition(draft);
    if (!selected || !draft || !composition) return;
    const key = editKey(draft.title, draft.clips);
    put({ ...all, [selected]: composition }, draft.baseEtag, (d) => {
      const current = d[selected];
      return current ? { ...d, [selected]: { ...current, savedKey: key } } : d;
    });
  }

  function remove() {
    if (!selected || !query.data || !window.confirm(`Delete composition "${selected}"?`)) return;
    put(without(all, selected), draft?.baseEtag ?? query.data.etag, (d) => without(d, selected));
  }

  async function reload() {
    await query.refetch();
    saver.reset();
    if (selected) setDrafts((d) => without(d, selected));
  }

  function create(name: string, scene: string) {
    if (!query.data) return;
    const compositions = { ...all, [name]: { title: null, clips: [{ scene, params: {} }] } };
    makePut(creator, setDrafts)(compositions, query.data.etag, (d) => d, () => onCreated(name));
  }

  return {
    save,
    remove,
    reload: () => void reload(),
    saving: saver.isPending,
    saveError: saver.error,
    create,
    creating: creator.isPending,
    createError: creator.error,
  };
}

/** Compositions of pnp.yaml and the Timeline's unsaved edits to them (one draft per composition). */
export function CompositionProvider({ pid, children }: { pid: string; children: ReactNode }) {
  const query = useCompositions(pid);
  const [picked, setPicked] = useState<string | null>(null);
  const [selectedClip, selectClip] = useState<number | null>(null);
  const names = Object.keys(query.data?.compositions ?? {});
  const selected = picked !== null && names.includes(picked) ? picked : (names[0] ?? null);
  const draftsState = useDrafts(query, selected);
  const [drafts, setDrafts] = draftsState;
  const actions = useCompositionActions(pid, query, selected, draftsState, setPicked);
  const draft = selected ? (drafts[selected] ?? null) : null;

  const value: CompositionValue = {
    query,
    names,
    selected,
    select: (name) => {
      setPicked(name);
      selectClip(null);
    },
    draft,
    dirty: draft ? isDirty(draft) : false,
    isNameDirty: (name) => (drafts[name] ? isDirty(drafts[name]) : false),
    composition: draft && draftComposition(draft),
    update: (change) => {
      if (selected) setDrafts((d) => (d[selected] ? { ...d, [selected]: { ...d[selected], ...change } } : d));
    },
    selectedClip,
    selectClip,
    ...actions,
  };
  return <CompositionContext.Provider value={value}>{children}</CompositionContext.Provider>;
}
