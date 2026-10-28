import { Scissors, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { NarrationAudioClip } from "../../api/types";
import { Button } from "../../ui/Button";
import { fieldClass } from "../../ui/Select";

interface Props {
  clip: NarrationAudioClip;
  playhead: number;
  onUpdate: (change: Partial<NarrationAudioClip>) => void;
  onSplit: () => void;
  onDelete: () => void;
}

export function AudioClipControls({ clip, playhead, onUpdate, onSplit, onDelete }: Props) {
  const [start, setStart] = useState(String(clip.start_s));
  const [sourceIn, setSourceIn] = useState(String(clip.source_start_s));
  const [sourceOut, setSourceOut] = useState(String(clip.source_end_s));
  const duration = clip.source_end_s - clip.source_start_s;
  const canSplit = playhead > clip.start_s + 0.02 && playhead < clip.start_s + duration - 0.02;

  useEffect(() => {
    setStart(String(clip.start_s));
    setSourceIn(String(clip.source_start_s));
    setSourceOut(String(clip.source_end_s));
  }, [clip.id, clip.start_s, clip.source_start_s, clip.source_end_s]);

  function commit(field: "start_s" | "source_start_s" | "source_end_s", value: string) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) onUpdate({ [field]: Math.round(number * 100) / 100 });
  }

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-line bg-header px-2 py-1.5">
      <span className="mr-1 self-center font-semibold text-fg-2">A1 voice</span>
      <label className="grid gap-0.5 text-2xs text-fg-3">Start
        <input aria-label="Voice clip start" type="number" min={0} step="0.01" value={start}
          onChange={(event) => setStart(event.target.value)} onBlur={() => commit("start_s", start)}
          className={`${fieldClass} w-[82px]`} />
      </label>
      <label className="grid gap-0.5 text-2xs text-fg-3">Trim in
        <input aria-label="Voice clip trim in" type="number" min={0} max={clip.source_end_s - 0.01} step="0.01" value={sourceIn}
          onChange={(event) => setSourceIn(event.target.value)} onBlur={() => commit("source_start_s", sourceIn)}
          className={`${fieldClass} w-[82px]`} />
      </label>
      <label className="grid gap-0.5 text-2xs text-fg-3">Trim out
        <input aria-label="Voice clip trim out" type="number" min={clip.source_start_s + 0.01} step="0.01" value={sourceOut}
          onChange={(event) => setSourceOut(event.target.value)} onBlur={() => commit("source_end_s", sourceOut)}
          className={`${fieldClass} w-[82px]`} />
      </label>
      <label className="flex h-7 items-center gap-1.5 px-1 text-xs text-fg-2">
        <input type="checkbox" checked={clip.enabled} onChange={(event) => onUpdate({ enabled: event.target.checked })} />
        Enabled
      </label>
      <Button icon={Scissors} disabled={!canSplit} title="Split at the timeline playhead" onClick={onSplit}>Split</Button>
      <Button icon={Trash2} variant="danger" onClick={onDelete}>Delete clip</Button>
      <span className="ml-auto self-center tabular text-2xs text-fg-3">Selected range {duration.toFixed(2)}s</span>
    </div>
  );
}
