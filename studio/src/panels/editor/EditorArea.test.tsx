import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { announceFileMoved } from "../../editor/fileMoves";
import { apiError, renderWithClient, scriptFetch } from "../../editor/testing";
import { requestOpenFile } from "../../state/openFile";
import { EditorArea } from "./EditorArea";

const fakeEditor = vi.hoisted(() => ({
  addCommand: vi.fn(),
  revealLineInCenter: vi.fn(),
  setPosition: vi.fn(),
  focus: vi.fn(),
  onDidChangeCursorPosition: vi.fn(),
}));

// jsdom cannot run Monaco: a textarea stands in for it.
vi.mock("../../editor/monaco", () => ({}));
vi.mock("@monaco-editor/react", async () => {
  const { useEffect } = await import("react");
  function Editor(props: {
    path: string;
    value: string;
    onChange: (value: string) => void;
    onMount: (editor: unknown, api: unknown) => void;
  }) {
    const { onMount } = props;
    useEffect(() => {
      onMount(fakeEditor, { KeyMod: { CtrlCmd: 2048 }, KeyCode: { KeyS: 49 } });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <textarea
        aria-label={`Code ${props.path}`}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    );
  }
  return { default: Editor };
});

const URL = "/api/v1/projects/demo/files/scenes/intro.py";
const disk = (content: string, etag: string) => ({
  status: 200,
  body: { path: "scenes/intro.py", content, etag },
});

async function openIntro(line?: number) {
  act(() => requestOpenFile({ path: "scenes/intro.py", line }));
  return screen.findByLabelText<HTMLTextAreaElement>("Code scenes/intro.py");
}

function pressCtrlS() {
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EditorArea", () => {
  it("opens a requested file in a tab and reveals the line", async () => {
    scriptFetch({ [`GET ${URL}`]: [disk("a = 1\n", "e1")] });
    renderWithClient(<EditorArea pid="demo" />);
    expect(screen.getByText("Open a file from Project ▸ Files")).toBeInTheDocument();

    const editor = await openIntro(12);
    expect(editor.value).toBe("a = 1\n");
    expect(screen.getByRole("tab", { name: /intro\.py/ })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(fakeEditor.revealLineInCenter).toHaveBeenCalledWith(12));
    expect(fakeEditor.setPosition).toHaveBeenCalledWith({ lineNumber: 12, column: 1 });
  });

  it("marks the tab dirty on edit and saves with If-Match on Ctrl+S", async () => {
    const calls = scriptFetch({
      [`GET ${URL}`]: [disk("a = 1\n", "e1")],
      [`PUT ${URL}`]: [{ status: 200, body: { path: "scenes/intro.py", etag: "e2" } }],
    });
    renderWithClient(<EditorArea pid="demo" />);
    fireEvent.change(await openIntro(), { target: { value: "a = 2\n" } });
    expect(screen.getByLabelText("unsaved changes")).toBeInTheDocument();

    pressCtrlS();
    await waitFor(() => expect(screen.queryByLabelText("unsaved changes")).not.toBeInTheDocument());
    const put = calls.find((c) => c.method === "PUT");
    expect(put).toMatchObject({ ifMatch: '"e1"', body: { content: "a = 2\n" } });
  });

  it("on 412 offers Overwrite, which saves against the current disk etag", async () => {
    const calls = scriptFetch({
      [`GET ${URL}`]: [disk("a = 1\n", "e1"), disk("changed\n", "e9")],
      [`PUT ${URL}`]: [
        apiError(412, "conflict", "scenes/intro.py changed on disk since it was opened"),
        { status: 200, body: { path: "scenes/intro.py", etag: "e10" } },
      ],
    });
    renderWithClient(<EditorArea pid="demo" />);
    fireEvent.change(await openIntro(), { target: { value: "mine\n" } });
    pressCtrlS();

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("Changed on disk");
    fireEvent.click(screen.getByRole("button", { name: "Overwrite" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(calls.filter((c) => c.method === "PUT").map((c) => c.ifMatch)).toEqual(['"e1"', '"e9"']);
    expect(calls.at(-1)?.body).toEqual({ content: "mine\n" });
    expect(screen.queryByLabelText("unsaved changes")).not.toBeInTheDocument();
  });

  it("on 412 Reload discards local edits and shows the disk version", async () => {
    scriptFetch({
      [`GET ${URL}`]: [disk("a = 1\n", "e1"), disk("theirs\n", "e9")],
      [`PUT ${URL}`]: [apiError(412, "conflict", "changed on disk")],
    });
    renderWithClient(<EditorArea pid="demo" />);
    const editor = await openIntro();
    fireEvent.change(editor, { target: { value: "mine\n" } });
    pressCtrlS();

    fireEvent.click(await screen.findByRole("button", { name: "Reload" }));
    await waitFor(() => expect(editor.value).toBe("theirs\n"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("unsaved changes")).not.toBeInTheDocument();
  });

  it("shows an unsupported file's message instead of an editor", async () => {
    scriptFetch({ [`GET ${URL}`]: [apiError(415, "unsupported_file", "scenes/intro.py is not a text file")] });
    renderWithClient(<EditorArea pid="demo" />);
    act(() => requestOpenFile({ path: "scenes/intro.py" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("is not a text file");
    expect(screen.queryByLabelText("Code scenes/intro.py")).not.toBeInTheDocument();
  });

  it("asks before closing a dirty tab and follows renames", async () => {
    scriptFetch({
      [`GET ${URL}`]: [disk("a = 1\n", "e1")],
      [`GET /api/v1/projects/demo/files/scenes/start.py`]: [disk("a = 1\n", "e1")],
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithClient(<EditorArea pid="demo" />);
    fireEvent.change(await openIntro(), { target: { value: "x\n" } });

    act(() => announceFileMoved("scenes/intro.py", "scenes/start.py"));
    expect(screen.getByRole("tab", { name: /start\.py/ })).toBeInTheDocument();
    const close = screen.getByRole("button", { name: "Close scenes/start.py" });
    fireEvent.click(close);
    expect(screen.getByRole("tab", { name: /start\.py/ })).toBeInTheDocument();
    fireEvent.click(close);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
