import { Pause, Play, Repeat, ScanLine, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import { IconButton } from "../../ui/Button";
import { formatTimecode } from "./timecode";
import type { Transport as TransportState } from "./useTransport";

interface Props {
  transport: TransportState;
  fps: number;
  disabled: boolean;
  safeAreas: boolean;
  onSafeAreas: (on: boolean) => void;
}

function Scrubber({ transport, fps, disabled }: Pick<Props, "transport" | "fps" | "disabled">) {
  const { time, duration } = transport;
  const pct = duration > 0 ? (time / duration) * 100 : 0;
  return (
    <input
      type="range"
      aria-label="Playhead"
      min={0}
      max={duration || 1}
      step={1 / Math.max(1, fps)}
      value={time}
      disabled={disabled}
      onChange={(e) => transport.seek(Number(e.target.value))}
      style={{ background: `linear-gradient(to right, var(--accent) ${pct}%, var(--bg-raised) ${pct}%)` }}
      className="scrubber block h-1 w-full cursor-pointer appearance-none rounded-full disabled:cursor-default disabled:opacity-40"
    />
  );
}

/**
 * Timecode, frame-accurate transport buttons, loop and the safe-area toggle (Premiere's monitor bar).
 * In a monitor narrower than the full bar, go to start / end drop out (Home and End still work).
 */
export function Transport({ transport, fps, disabled, safeAreas, onSafeAreas }: Props) {
  const t = transport;
  return (
    <div className="@container shrink-0 border-t border-line bg-panel px-2 pt-2">
      <Scrubber transport={t} fps={fps} disabled={disabled} />
      <div className="flex h-8 items-center gap-1">
        <span aria-label="Current time" className="tabular w-[92px] shrink-0 font-mono text-sm text-accent">
          {formatTimecode(t.time, fps)}
        </span>
        <div className="flex flex-1 items-center justify-center gap-0.5">
          <IconButton icon={SkipBack} label="Go to start" shortcut="Home" disabled={disabled} onClick={t.toStart} className="@max-[420px]:hidden" />
          <IconButton icon={StepBack} label="Step back 1 frame" shortcut="←" disabled={disabled} onClick={() => t.step(-1)} />
          <IconButton
            icon={t.playing ? Pause : Play}
            label={t.playing ? "Pause" : "Play"}
            shortcut="Space"
            disabled={disabled}
            onClick={t.toggle}
            className="mx-1 h-7 w-7 bg-raised"
          />
          <IconButton icon={StepForward} label="Step forward 1 frame" shortcut="→" disabled={disabled} onClick={() => t.step(1)} />
          <IconButton icon={SkipForward} label="Go to end" shortcut="End" disabled={disabled} onClick={t.toEnd} className="@max-[420px]:hidden" />
          <IconButton icon={Repeat} label="Loop" active={t.loop} disabled={disabled} onClick={() => t.setLoop(!t.loop)} />
        </div>
        <IconButton icon={ScanLine} label="Safe areas" active={safeAreas} onClick={() => onSafeAreas(!safeAreas)} />
        <span aria-label="Duration" className="tabular w-[92px] shrink-0 text-right font-mono text-sm text-fg-2">
          {formatTimecode(t.duration, fps)}
        </span>
      </div>
    </div>
  );
}
