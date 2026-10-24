import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { wsUrl } from "../../api/client";
import type { TerminalClientMessage, TerminalServerMessage } from "../../api/messages";

interface Handlers {
  /** Called once when the shell exits or the connection closes. */
  onExit: () => void;
  /** Called on every chunk of shell output (the shell may have changed project files). */
  onOutput?: () => void;
}

interface Props extends Handlers {
  pid: string;
}

function parseMessage(data: unknown): TerminalServerMessage | null {
  if (typeof data !== "string") return null;
  try {
    const message = JSON.parse(data) as Partial<TerminalServerMessage>;
    if (message.type === "output" && typeof message.data === "string") return message as TerminalServerMessage;
    if (message.type === "exit") return message as TerminalServerMessage;
  } catch {
    // Not JSON: ignored, like any unknown message.
  }
  return null;
}

/** Connects `term` to the project's shell; returns a function that disconnects it. */
function connectShell(term: Terminal, fit: FitAddon, pid: string, handlers: () => Handlers) {
  const socket = new WebSocket(wsUrl("/api/v1/terminal", { project: pid }));
  const send = (message: TerminalClientMessage) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const resize = () => {
    fit.fit();
    send({ type: "resize", cols: term.cols, rows: term.rows });
  };
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    term.write("\r\n[process exited]\r\n");
    handlers().onExit();
  };
  socket.onopen = resize;
  socket.onmessage = (event: MessageEvent) => {
    const message = parseMessage(event.data);
    if (message?.type === "output") {
      term.write(message.data);
      handlers().onOutput?.();
    }
    if (message?.type === "exit") end();
  };
  socket.onclose = end;
  const input = term.onData((data) => send({ type: "input", data }));
  return {
    resize,
    disconnect: () => {
      input.dispose();
      socket.onclose = null;
      socket.close();
    },
  };
}

/** An xterm.js terminal wired to WS /api/v1/terminal; lives as long as one shell session. */
export default function TerminalView({ pid, onExit, onOutput }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef<Handlers>({ onExit, onOutput });
  useEffect(() => {
    latest.current = { onExit, onOutput };
  });

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const term = new Terminal({ cursorBlink: true, fontSize: 13, theme: { background: "#0f1115" } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    const shell = connectShell(term, fit, pid, () => latest.current);
    const observer = new ResizeObserver(shell.resize);
    observer.observe(element);
    return () => {
      observer.disconnect();
      shell.disconnect();
      term.dispose();
    };
  }, [pid]);

  // FitAddon sizes rows from the parent's height, so padding must sit outside that parent.
  return (
    <div className="h-64 bg-bg px-2 py-1">
      <div ref={container} aria-label="Terminal" className="h-full" />
    </div>
  );
}
