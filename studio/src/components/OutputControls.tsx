import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { outputSize, resolutionLabel, type OutputSize } from "../api/geometry";
import type { FormatInfo, OutputChoice, RenderOptions } from "../api/types";
import { Select } from "../ui/Select";
import { useOutputChoice, type OutputPanel } from "./useOutputChoice";

// From 1440p up a render takes noticeably longer and needs more RAM.
const HEAVY_SHORT_EDGE = 1440;

interface Output {
  options: RenderOptions | undefined;
  choice: OutputChoice | null;
}

/** The exact size `format` renders at with this choice; null while unknown or too large. */
function sizeOf(format: FormatInfo | undefined, { options, choice }: Output): OutputSize | null {
  const res = options?.resolutions.find((r) => r.id === choice?.resolution);
  return format && options && res ? outputSize(format, res.short_edge, options.max_long_edge) : null;
}

/** Format + resolution + fps of one panel (render or export) and whether they fit. */
export interface OutputControls {
  formats: Record<string, FormatInfo>;
  format: string;
  setFormat: (format: string) => void;
  options: RenderOptions | undefined;
  choice: OutputChoice | null;
  update: (next: Partial<OutputChoice>) => void;
  /** The exact output size, or null while unknown or too large. */
  size: OutputSize | null;
  ready: boolean;
}

/** The format a picker starts on: landscape when the project has it. */
export function defaultFormat(formats: Record<string, FormatInfo>): string {
  const names = Object.keys(formats);
  return names.includes("landscape") ? "landscape" : (names[0] ?? "");
}

/** Format + resolution + fps, remembered per project and panel; `ready` once they fit. */
export function useOutputControls(pid: string, panel: OutputPanel, formats: Record<string, FormatInfo>): OutputControls {
  const [picked, setFormat] = useState<string | null>(null);
  const format = picked !== null && picked in formats ? picked : defaultFormat(formats);
  const { options, choice, update } = useOutputChoice(pid, panel);
  const size = sizeOf(formats[format], { options, choice });
  return { formats, format, setFormat, options, choice, update, size, ready: choice !== null && size !== null };
}

/** "stacked": one per row with labels (Inspector); "compact": in a line, labels hidden (monitor footer). */
type Layout = "stacked" | "compact";

const WIDTHS: Record<Layout, { format: number | string; res: number | string; fps: number | string }> = {
  stacked: { format: "100%", res: "100%", fps: "100%" },
  // Content-sized like Premiere's footer controls; only the format select shrinks (with an ellipsis)
// when space runs out, so the short resolution and fps labels never clip.
  compact: { format: 172, res: 68, fps: 80 },
};

function FormatSelect({ output, layout }: { output: OutputControls; layout: Layout }) {
  return (
    <Select
      label="Format"
      hideLabel={layout === "compact"}
      value={output.format}
      onChange={(e) => output.setFormat(e.target.value)}
      width={WIDTHS[layout].format}
      className={layout === "compact" ? "min-w-[80px]" : ""}
    >
      {Object.keys(output.formats).map((name) => {
        const size = sizeOf(output.formats[name], output);
        const suffix = size ? ` · ${size.width}×${size.height}` : output.choice ? " · too large" : "";
        return (
          <option key={name} value={name}>
            {name}
            {suffix}
          </option>
        );
      })}
    </Select>
  );
}

function HeavyHint({ compact }: { compact: boolean }) {
  const text = "slower, uses more memory";
  if (!compact) return <p className="col-span-2 text-xs text-warn">{text}</p>;
  return <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0 text-warn" aria-label={text} />;
}

/** Resolution and FPS selects, with a hint when the resolution is heavy for the machine. */
function OutputPicker({ output, layout }: { output: OutputControls; layout: Layout }) {
  const { options, choice, update } = output;
  const format = output.formats[output.format];
  const picked = options?.resolutions.find((r) => r.id === choice?.resolution);
  const fits = (short: number) => !format || !options || outputSize(format, short, options.max_long_edge);
  const compact = layout === "compact";
  return (
    <>
      <Select
        label="Resolution"
        hideLabel={compact}
        value={choice?.resolution ?? ""}
        disabled={!choice}
        onChange={(e) => update({ resolution: e.target.value })}
        width={WIDTHS[layout].res}
        className={compact ? "shrink-0" : ""}
      >
        {options?.resolutions.map((r) => (
          <option key={r.id} value={r.id} disabled={!fits(r.short_edge)}>
            {resolutionLabel(r.id)}
          </option>
        ))}
      </Select>
      <Select
        label="FPS"
        hideLabel={compact}
        value={choice?.fps ?? ""}
        disabled={!choice}
        onChange={(e) => update({ fps: Number(e.target.value) })}
        width={WIDTHS[layout].fps}
        className={compact ? "shrink-0" : ""}
      >
        {options?.fps.map((fps) => (
          <option key={fps} value={fps}>
            {fps} fps
          </option>
        ))}
      </Select>
      {picked && picked.short_edge >= HEAVY_SHORT_EDGE && <HeavyHint compact={compact} />}
    </>
  );
}

/** The three output selects of a render or export. */
export function OutputFields({ output, compact = false }: { output: OutputControls; compact?: boolean }) {
  const layout: Layout = compact ? "compact" : "stacked";
  return (
    <div className={compact ? "flex min-w-0 items-center gap-1.5" : "grid gap-2 [&>label]:grid [&>label]:grid-cols-[80px_1fr]"}>
      <FormatSelect output={output} layout={layout} />
      <OutputPicker output={output} layout={layout} />
    </div>
  );
}
