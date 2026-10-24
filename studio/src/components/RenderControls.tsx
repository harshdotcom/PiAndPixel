import { useState } from "react";
import { outputSize, resolutionLabel } from "../api/geometry";
import type { FormatInfo, OutputChoice, RenderOptions } from "../api/types";
import { useOutputChoice } from "./useOutputChoice";

const selectClass =
  "mt-1 block rounded-md border border-line bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent";
// From 1440p up a render takes noticeably longer and needs more RAM.
const HEAVY_SHORT_EDGE = 1440;

interface Output {
  options: RenderOptions | undefined;
  choice: OutputChoice | null;
}

/** The exact size `format` renders at with this choice; null while unknown or too large. */
function sizeOf(format: FormatInfo | undefined, { options, choice }: Output) {
  const res = options?.resolutions.find((r) => r.id === choice?.resolution);
  return format && options && res ? outputSize(format, res.short_edge, options.max_long_edge) : null;
}

interface FormatSelectProps {
  formats: Record<string, FormatInfo>;
  output: Output;
  value: string;
  onChange: (format: string) => void;
}

export function FormatSelect({ formats, output, value, onChange }: FormatSelectProps) {
  return (
    <label className="text-xs text-muted">
      Format
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {Object.keys(formats).map((name) => {
          const size = sizeOf(formats[name], output);
          const suffix = size ? ` · ${size.width}×${size.height}` : output.choice ? " · too large" : "";
          return (
            <option key={name} value={name}>
              {name}
              {suffix}
            </option>
          );
        })}
      </select>
    </label>
  );
}

interface OutputPickerProps {
  format: FormatInfo | undefined;
  options: RenderOptions | undefined;
  choice: OutputChoice | null;
  onChange: (next: Partial<OutputChoice>) => void;
}

/** Resolution and FPS selects, with a hint when the resolution is heavy for the machine. */
export function OutputPicker({ format, options, choice, onChange }: OutputPickerProps) {
  const picked = options?.resolutions.find((r) => r.id === choice?.resolution);
  const fits = (short: number) => !format || !options || outputSize(format, short, options.max_long_edge);
  return (
    <>
      <label className="text-xs text-muted">
        Resolution
        <select
          value={choice?.resolution ?? ""}
          disabled={!choice}
          onChange={(e) => onChange({ resolution: e.target.value })}
          className={selectClass}
        >
          {options?.resolutions.map((r) => (
            <option key={r.id} value={r.id} disabled={!fits(r.short_edge)}>
              {resolutionLabel(r.id)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted">
        FPS
        <select
          value={choice?.fps ?? ""}
          disabled={!choice}
          onChange={(e) => onChange({ fps: Number(e.target.value) })}
          className={selectClass}
        >
          {options?.fps.map((fps) => (
            <option key={fps} value={fps}>
              {fps}
            </option>
          ))}
        </select>
      </label>
      {picked && picked.short_edge >= HEAVY_SHORT_EDGE && (
        <p className="self-center text-xs text-warning">slower, uses more memory</p>
      )}
    </>
  );
}

/** The format a picker starts on: landscape when the project has it. */
export function defaultFormat(formats: Record<string, FormatInfo>): string {
  const names = Object.keys(formats);
  return names.includes("landscape") ? "landscape" : (names[0] ?? "");
}

/** Format + resolution + fps, remembered per project and panel; `ready` once they fit. */
export function useOutputControls(pid: string, panel: "render" | "export", formats: Record<string, FormatInfo>) {
  const [format, setFormat] = useState(() => defaultFormat(formats));
  const { options, choice, update } = useOutputChoice(pid, panel);
  const output = { options, choice };
  const controls = (
    <>
      <FormatSelect formats={formats} output={output} value={format} onChange={setFormat} />
      <OutputPicker format={formats[format]} options={options} choice={choice} onChange={update} />
    </>
  );
  const ready = choice !== null && sizeOf(formats[format], output) !== null;
  return { format, choice, ready, controls };
}

interface Props {
  pid: string;
  formats: Record<string, FormatInfo>;
  disabled: boolean;
  busy: boolean;
  onRender: (format: string, choice: OutputChoice) => void;
}

export function RenderControls({ pid, formats, disabled, busy, onRender }: Props) {
  const { format, choice, ready, controls } = useOutputControls(pid, "render", formats);
  return (
    <div className="flex flex-wrap items-end gap-4">
      {controls}
      <button
        type="button"
        disabled={disabled || busy || !format || !ready}
        onClick={() => choice && onRender(format, choice)}
        className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-40"
      >
        {busy ? "Queuing…" : "Render"}
      </button>
    </div>
  );
}
