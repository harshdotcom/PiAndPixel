import { useEffect, useRef } from "react";
import type { Artifact } from "../api/types";

export function VideoPlayer({ artifact }: { artifact: Artifact }) {
  const ref = useRef<HTMLElement>(null);

  // A finished render should be visible without hunting for it below the log.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [artifact.id]);

  return (
    <section ref={ref} aria-label="Rendered video" className="space-y-3">
      <video
        key={artifact.id}
        controls
        preload="metadata"
        src={artifact.stream_url}
        className="max-h-[60vh] w-full rounded-md border border-line bg-black"
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <span className="font-mono text-white">
          {artifact.width}×{artifact.height}
        </span>
        <span>{Number(artifact.fps.toFixed(2))} fps</span>
        <span>{artifact.duration_s.toFixed(2)} s</span>
        <a
          href={artifact.download_url}
          download
          className="ml-auto rounded-md border border-accent/50 px-3 py-1.5 font-medium text-accent transition hover:bg-accent/10"
        >
          Download MP4
        </a>
      </div>
    </section>
  );
}
