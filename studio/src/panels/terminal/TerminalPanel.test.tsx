import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY } from "../../api/client";
import { TerminalPanel } from "./TerminalPanel";

// jsdom has no canvas: a fake xterm records what the panel writes and lets tests type.
const xterm = vi.hoisted(() => ({
  written: [] as string[],
  typed: null as ((data: string) => void) | null,
  disposed: 0,
}));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 100;
    rows = 30;
    loadAddon() {}
    open() {}
    write(data: string) {
      xterm.written.push(data);
    }
    onData(listener: (data: string) => void) {
      xterm.typed = listener;
      return { dispose: () => (xterm.typed = null) };
    }
    dispose() {
      xterm.disposed += 1;
    }
  },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));

class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }
}

beforeEach(() => {
  FakeSocket.all = [];
  Object.assign(xterm, { written: [], typed: null, disposed: 0 });
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  sessionStorage.setItem(TOKEN_KEY, "tok");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function expand() {
  await screen.findByLabelText("Terminal");
  return FakeSocket.all[0]!;
}

describe("TerminalPanel", () => {
  it("connects only once its tab is in front, and keeps the shell when it goes behind", async () => {
    const { rerender } = render(<TerminalPanel pid="demo" enabled active={false} />);
    expect(FakeSocket.all).toHaveLength(0);

    rerender(<TerminalPanel pid="demo" enabled active />);
    const socket = await expand();
    expect(socket.url).toMatch(/\/api\/v1\/terminal\?project=demo&token=tok$/);
    rerender(<TerminalPanel pid="demo" enabled active={false} />);
    expect(FakeSocket.all).toHaveLength(1);
    expect(xterm.disposed).toBe(0);
  });

  it("sends resize on open and input on typing, and writes output", async () => {
    render(<TerminalPanel pid="demo" enabled active />);
    const socket = await expand();

    act(() => socket.open());
    act(() => xterm.typed?.("ls\r"));
    act(() => socket.receive({ type: "output", data: "scenes\r\n" }));
    act(() => socket.receive("not json"));
    expect(socket.sent).toEqual([
      { type: "resize", cols: 100, rows: 30 },
      { type: "input", data: "ls\r" },
    ]);
    expect(xterm.written).toEqual(["scenes\r\n"]);
  });

  it("reports shell output so project lists can be refreshed", async () => {
    const onOutput = vi.fn();
    render(<TerminalPanel pid="demo" enabled active onOutput={onOutput} />);
    const socket = await expand();
    act(() => socket.open());
    act(() => socket.receive({ type: "output", data: "touch x.py\r\n" }));
    expect(onOutput).toHaveBeenCalledTimes(1);
  });

  it("shows [process exited] on exit and restarts with a new connection", async () => {
    render(<TerminalPanel pid="demo" enabled active />);
    const socket = await expand();
    act(() => socket.open());
    act(() => socket.receive({ type: "exit", code: 0 }));

    expect(screen.getByText("[process exited]")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(FakeSocket.all).toHaveLength(2);
    expect(xterm.disposed).toBe(1);
    expect(screen.queryByText("[process exited]")).not.toBeInTheDocument();
  });

  it("says why when the terminal is off and opens no socket", () => {
    render(<TerminalPanel pid="demo" enabled={false} active />);

    expect(screen.getByText(/Terminal is off/)).toBeInTheDocument();
    expect(FakeSocket.all).toHaveLength(0);
  });
});
