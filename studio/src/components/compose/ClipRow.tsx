import { parseParams, type DraftClip } from "./clips";

interface Props {
  clip: DraftClip;
  index: number;
  count: number;
  onChange: (clip: DraftClip) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
}

const smallButton =
  "rounded border border-line px-2 py-0.5 text-xs text-muted transition hover:text-white disabled:opacity-30";

/** One clip: its scene, order controls and params as JSON text (checked as you type). */
export function ClipRow({ clip, index, count, onChange, onMove, onRemove }: Props) {
  const parsed = parseParams(clip.paramsText);
  const error = "error" in parsed ? parsed.error : null;
  const label = `Clip ${index + 1}`;

  return (
    <li aria-label={label} className="space-y-1.5 rounded-md border border-line bg-bg p-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted">{index + 1}.</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{clip.scene}</span>
        <button
          type="button"
          aria-label={`Move ${label} up`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className={smallButton}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move ${label} down`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          className={smallButton}
        >
          ↓
        </button>
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className={smallButton}
        >
          ✕
        </button>
      </div>
      <textarea
        aria-label={`${label} params`}
        aria-invalid={error !== null}
        value={clip.paramsText}
        onChange={(e) => onChange({ ...clip, paramsText: e.target.value })}
        rows={Math.min(6, clip.paramsText.split("\n").length)}
        spellCheck={false}
        className={`block w-full rounded border bg-panel px-2 py-1 font-mono text-xs outline-none ${
          error ? "border-error" : "border-line focus:border-accent"
        }`}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </li>
  );
}
