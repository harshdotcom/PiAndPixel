import { Clapperboard, Film, RotateCcw, Square } from "lucide-react";
import { canCancel, canRetry, useArtifact } from "../../api/hooks";
import { IconButton } from "../../ui/Button";
import { OutputBadge, StatusPill } from "../../ui/StatusPill";
import { formatClipLength } from "../monitor/timecode";
import type { BinItem } from "./binItems";

export interface ItemProps {
  item: BinItem;
  selected: boolean;
  onShow: () => void;
  onCancel: () => void;
  onRetry: () => void;
  pending: boolean;
}

/** The completed item's duration, once its artifact is loaded. */
function useDuration(item: BinItem): string | null {
  const artifact = useArtifact(item.status === "completed" ? item.artifactId : null);
  return artifact.data ? formatClipLength(artifact.data.duration_s) : null;
}

function ItemActions({ item, onCancel, onRetry, pending }: ItemProps) {
  return (
    <>
      {canCancel(item.status) && (
        <IconButton icon={Square} label="Cancel" disabled={pending} onClick={onCancel} />
      )}
      {canRetry(item.status) && (
        <IconButton icon={RotateCcw} label="Retry" disabled={pending} onClick={onRetry} />
      )}
    </>
  );
}

const KIND_ICON = { render: Clapperboard, export: Film };

/** One row of the list view: kind icon, name, status, badge, duration and actions. */
export function BinRow(props: ItemProps) {
  const { item, selected, onShow } = props;
  const duration = useDuration(item);
  const Icon = KIND_ICON[item.kind];
  return (
    <li className={`group flex h-[26px] items-center gap-1 rounded-[4px] pr-1 ${selected ? "bg-accent-weak" : "hover:bg-raised"}`}>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        title={`${item.detail} · ${new Date(item.createdAt).toLocaleString()}`}
        onClick={onShow}
        className="flex h-full min-w-0 flex-1 items-center gap-2 pl-2 text-left text-sm"
      >
        <Icon size={14} strokeWidth={1.75} className="shrink-0 text-fg-3" aria-label={item.kind} />
        <span className="min-w-0 flex-1 truncate text-fg">{item.name}</span>
        <StatusPill status={item.status} />
        <OutputBadge text={item.badge} />
        <span className="tabular w-11 shrink-0 text-right font-mono text-xs text-fg-3">{duration ?? "–"}</span>
      </button>
      <ItemActions {...props} />
    </li>
  );
}

/**
 * Where the thumbnail frame is taken: 60% in, past the opening build-up and before a closing
 * fade-out, where a Manim scene usually shows its composition.
 */
const THUMBNAIL_AT = 0.6;

function Thumbnail({ item }: { item: BinItem }) {
  const artifact = useArtifact(item.status === "completed" ? item.artifactId : null);
  if (!artifact.data) {
    const Icon = KIND_ICON[item.kind];
    return <Icon size={20} strokeWidth={1.5} className="text-fg-3" aria-hidden />;
  }
  return (
    <video
      src={`${artifact.data.stream_url}#t=${(artifact.data.duration_s * THUMBNAIL_AT).toFixed(2)}`}
      preload="metadata"
      muted
      aria-hidden
      className="h-full w-full object-contain"
    />
  );
}

/** One card of the grid view: a frame of the video, then name, badge and duration. */
export function BinCard(props: ItemProps) {
  const { item, selected, onShow } = props;
  const duration = useDuration(item);
  return (
    <li className={`group relative overflow-hidden rounded-[4px] border ${selected ? "border-accent" : "border-line hover:border-line-strong"}`}>
      <button type="button" aria-current={selected ? "true" : undefined} onClick={onShow} className="block w-full text-left">
        <div className="relative flex aspect-video items-center justify-center bg-sunken">
          <Thumbnail item={item} />
          {duration && (
            <span className="tabular absolute right-1 bottom-1 rounded-[3px] bg-black/70 px-1 font-mono text-2xs text-fg">{duration}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.name}</span>
          <OutputBadge text={item.badge} />
        </div>
        <div className="px-1.5 pb-1.5">
          <StatusPill status={item.status} />
        </div>
      </button>
      <div className="absolute top-1 right-1 flex rounded-[4px] bg-header/90 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <ItemActions {...props} />
      </div>
    </li>
  );
}
