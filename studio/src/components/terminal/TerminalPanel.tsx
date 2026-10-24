import { lazy, Suspense, useState } from "react";

const TerminalView = lazy(() => import("./TerminalView"));

interface Props {
  pid: string;
  /** AgentInfo.features.terminal: when false the panel says the terminal is disabled. */
  enabled: boolean;
  /** Called on shell output, so lists of project files can be refreshed. */
  onOutput?: () => void;
}

const barButton = "text-xs text-muted hover:text-white";

/** Collapsible xterm.js panel below the editor, connected to WS /api/v1/terminal. */
export function TerminalPanel({ pid, enabled, onOutput }: Props) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [exited, setExited] = useState(false);

  function restart() {
    setExited(false);
    setSession((n) => n + 1);
  }

  return (
    <section className="border-t border-line bg-panel">
      <div className="flex items-center gap-3 px-3 py-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="text-xs font-semibold tracking-wide text-muted uppercase hover:text-white"
        >
          {open ? "▾" : "▸"} Terminal
        </button>
        {open && exited && (
          <>
            <span className="text-xs text-muted">[process exited]</span>
            <button type="button" onClick={restart} className={barButton}>
              Restart
            </button>
          </>
        )}
      </div>
      {open && !enabled && (
        <p className="px-3 pb-2 text-xs text-muted">
          Terminal is off: the Agent is not on loopback or was started with --no-terminal.
        </p>
      )}
      {open && enabled && (
        <Suspense fallback={<p className="px-3 pb-2 text-xs text-muted">Loading terminal…</p>}>
          <TerminalView
            key={session}
            pid={pid}
            onExit={() => setExited(true)}
            onOutput={onOutput}
          />
        </Suspense>
      )}
    </section>
  );
}
