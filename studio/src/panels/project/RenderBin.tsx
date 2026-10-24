import { useState } from "react";
import { useCancelExport, useExports, useRetryExport } from "../../api/exports";
import { useRenders } from "../../state/renders";
import { useStudio } from "../../state/studio";
import { Button } from "../../ui/Button";
import { EmptyState, ErrorText } from "../../ui/ErrorText";
import { BinCard, BinRow } from "./BinViews";
import { binItems, type BinItem } from "./binItems";

export type BinView = "list" | "grid";

// Items are added a page at a time, so an older failed render can still be opened and retried.
const PAGE = 12;

/** Cancel / retry for either kind of item (a render job or an export). */
function useItemActions() {
  const { actions } = useRenders();
  const cancelExport = useCancelExport();
  const retryExport = useRetryExport();
  return {
    cancel: (item: BinItem) => (item.kind === "render" ? actions.cancel(item.id) : cancelExport.mutate(item.id)),
    retry: (item: BinItem) => (item.kind === "render" ? actions.retry(item.id) : retryExport.mutate(item.id)),
    pending: actions.pending || cancelExport.isPending || retryExport.isPending,
    error: actions.error ?? cancelExport.error ?? retryExport.error,
  };
}

/** Project ▸ Renders: past renders and exports; clicking one shows it in the Program Monitor. */
export function RenderBin({ view }: { view: BinView }) {
  const { pid } = useStudio();
  const { jobs, source, show } = useRenders();
  const exports = useExports(pid);
  const actions = useItemActions();
  const [shown, setShown] = useState(PAGE);
  const error = jobs.error ?? exports.error;
  if (error) return <ErrorText error={error} className="p-2" />;
  if (!jobs.data || !exports.data) return <p className="p-2 text-sm text-fg-3">Loading…</p>;

  const items = binItems(jobs.data, exports.data);
  if (items.length === 0) return <EmptyState>No renders yet.</EmptyState>;
  const hidden = items.length - shown;
  const Item = view === "grid" ? BinCard : BinRow;
  return (
    <div className="h-full overflow-y-auto p-1">
      <ul
        aria-label="Renders"
        className={view === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-1.5 p-1" : ""}
      >
        {items.slice(0, shown).map((item) => (
          <Item
            key={`${item.kind}:${item.id}`}
            item={item}
            selected={source?.kind === item.source.kind && source.id === item.id}
            onShow={() => show(item.source)}
            onCancel={() => actions.cancel(item)}
            onRetry={() => actions.retry(item)}
            pending={actions.pending}
          />
        ))}
      </ul>
      {actions.error && <ErrorText error={actions.error} className="p-2" />}
      {hidden > 0 && (
        <Button variant="ghost" className="mt-1 w-full" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(hidden, PAGE)} more ({hidden} older)
        </Button>
      )}
    </div>
  );
}
