import { useAgent } from "../api/hooks";
import type { AgentInfo } from "../api/types";

function missingTools(info: AgentInfo): string[] {
  return (["manim", "ffmpeg"] as const).filter((name) => !info.tools[name].available);
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${className}`} />;
}

export function AgentBadge() {
  const { data, error, isPending } = useAgent();

  if (isPending) {
    return <span className="text-sm text-muted">Connecting to agent…</span>;
  }
  if (error) {
    return (
      <span className="flex items-center gap-2 text-sm text-error">
        <Dot className="bg-error" /> Agent unreachable
      </span>
    );
  }

  const missing = missingTools(data);
  const ready = missing.length === 0;
  const ramGb = (data.ram_total_mb / 1024).toFixed(1);
  // "manim --version" prints e.g. "Manim Community v0.19.0"; avoid "Manim Manim …".
  const manim = (data.tools.manim.version ?? "not found").replace(/^manim( community)?\s*/i, "");
  const latexOk = data.tools.latex.available;

  return (
    <div
      data-testid="agent-badge"
      data-ready={ready}
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-full border px-4 py-1.5 text-sm ${
        ready ? "border-success/40 text-success" : "border-warning/40 text-warning"
      }`}
    >
      <span className="flex items-center gap-2 font-medium">
        <Dot className={ready ? "bg-success" : "bg-warning"} />
        {ready ? "Agent ready" : `Missing: ${missing.join(", ")}`}
      </span>
      <span className="text-muted">{data.target}</span>
      <span className="text-muted">{data.cpu_count} CPU</span>
      <span className="text-muted">{ramGb} GB RAM</span>
      <span className="text-muted" title={manim}>
        Manim {manim}
      </span>
      <span className={latexOk ? "text-success" : "text-muted"}>LaTeX {latexOk ? "✓" : "✗"}</span>
    </div>
  );
}
