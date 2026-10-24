import { RotateCcw } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/ErrorText";

const TerminalView = lazy(() => import("./TerminalView"));

interface Props {
  pid: string;
  /** AgentInfo.features.terminal: when false the panel says the terminal is disabled. */
  enabled: boolean;
  /** The Terminal tab is in front; the shell starts the first time it is. */
  active: boolean;
  /** Called on shell output, so lists of project files can be refreshed. */
  onOutput?: () => void;
}

/** The bottom dock's Terminal tab: xterm.js connected to WS /api/v1/terminal. */
export function TerminalPanel({ pid, enabled, active, onOutput }: Props) {
  const [started, setStarted] = useState(active);
  const [session, setSession] = useState(0);
  const [exited, setExited] = useState(false);
  if (active && !started) setStarted(true);

  function restart() {
    setExited(false);
    setSession((n) => n + 1);
  }

  if (!enabled) {
    return <EmptyState>Terminal is off: the Agent is not on loopback or was started with --no-terminal.</EmptyState>;
  }
  return (
    <div className="relative h-full bg-sunken">
      {exited && (
        <div className="absolute top-1.5 right-3 z-10 flex items-center gap-2 text-xs text-fg-3">
          [process exited]
          <Button icon={RotateCcw} onClick={restart}>
            Restart
          </Button>
        </div>
      )}
      {started && (
        <Suspense fallback={<p className="p-3 text-xs text-fg-3">Loading terminal…</p>}>
          <TerminalView key={session} pid={pid} onExit={() => setExited(true)} onOutput={onOutput} />
        </Suspense>
      )}
    </div>
  );
}
