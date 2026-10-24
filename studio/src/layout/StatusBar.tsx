import type { ReactNode } from "react";
import { useCursor } from "../state/cursor";

interface Props {
  /** The live events socket is open. */
  connected: boolean;
  /** What is running right now, e.g. "Rendering Proof · 3 animations · 0:04". */
  activity?: ReactNode;
  /** The render output, e.g. "480p@15". */
  output?: string | null;
}

function Cell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`tabular flex h-full items-center border-l border-line px-3 first:border-l-0 ${className}`}>{children}</span>;
}

/** 24px status bar: connection, running job, editor cursor and the render output. */
export function StatusBar({ connected, activity, output }: Props) {
  const cursor = useCursor();
  return (
    <footer aria-label="Status" className="flex h-6 shrink-0 items-center border-t border-line bg-header text-xs text-fg-2">
      <Cell className={connected ? "" : "text-record"}>
        <span aria-hidden className={`mr-1.5 h-2 w-2 rounded-full ${connected ? "bg-ok" : "bg-record"}`} />
        {connected ? "Connected" : "Reconnecting…"}
      </Cell>
      <Cell className="min-w-0 flex-1">
        <span className="truncate">{activity}</span>
      </Cell>
      {cursor && (
        <Cell>
          Ln {cursor.line}, Col {cursor.column}
        </Cell>
      )}
      {output && <Cell className="font-mono">{output}</Cell>}
    </footer>
  );
}
