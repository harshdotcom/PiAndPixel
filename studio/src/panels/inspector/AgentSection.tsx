import { gigabytes, manimVersion, missingTools, shortOs } from "../../api/agentInfo";
import { useAgent } from "../../api/hooks";
import { ErrorText } from "../../ui/ErrorText";
import { Prop, Section } from "./Section";

function Tool({ ok, children }: { ok: boolean; children: string }) {
  return <span className={ok ? "text-ok" : "text-fg-3"}>{children}</span>;
}

/** Inspector ▸ Agent: what the machine running the renders has; greyed out as stale while it is unreachable. */
export function AgentSection({ stale = false }: { stale?: boolean }) {
  const { data, error } = useAgent();
  const aside = stale ? <span className="text-xs text-warn">Last known</span> : undefined;
  return (
    <Section title="Agent" aside={aside}>
      {error && <ErrorText error={error} />}
      {data && (
        <div aria-label={stale ? "Last known agent details" : undefined} className={`space-y-2.5 ${stale ? "opacity-50" : ""}`}>
          {missingTools(data).length > 0 && (
            <p className="text-sm text-warn">Missing: {missingTools(data).join(", ")}</p>
          )}
          <Prop label="Target">
            <span title={`${data.target} · ${data.os}`} className="block truncate">
              {data.target} · {shortOs(data.os)}
            </span>
          </Prop>
          <Prop label="CPU">{data.cpu_count} cores</Prop>
          <Prop label="Memory">
            {gigabytes(data.ram_free_mb)} free of {gigabytes(data.ram_total_mb)}
          </Prop>
          <Prop label="Disk">{gigabytes(data.disk_free_mb)} free</Prop>
          <Prop label="Manim">
            <Tool ok={data.tools.manim.available}>{manimVersion(data)}</Tool>
          </Prop>
          <Prop label="FFmpeg">
            <Tool ok={data.tools.ffmpeg.available}>{data.tools.ffmpeg.available ? "found" : "not found"}</Tool>
          </Prop>
          <Prop label="LaTeX">
            <Tool ok={data.tools.latex.available}>{data.tools.latex.available ? "✓ available" : "✗ not installed"}</Tool>
          </Prop>
          <Prop label="Python">{data.python}</Prop>
        </div>
      )}
    </Section>
  );
}
