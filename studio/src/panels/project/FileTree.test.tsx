import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFileMoves } from "../../editor/fileMoves";
import { renderWithClient, scriptFetch } from "../../editor/testing";
import { onOpenFile } from "../../state/openFile";
import { FileTree } from "./FileTree";

const FILES = "/api/v1/projects/demo/files";
const tree = {
  status: 200,
  body: {
    entries: [
      { path: "pnp.yaml", type: "file", size: 80 },
      { path: "scenes", type: "dir", size: null },
      { path: "scenes/intro.py", type: "file", size: 300 },
    ],
  },
};

const moves = vi.fn();
function MoveSpy() {
  useFileMoves(moves);
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  moves.mockReset();
});

describe("FileTree", () => {
  it("renders folders first, collapses them and opens a clicked file", async () => {
    scriptFetch({ [`GET ${FILES}`]: [tree] });
    const opened = vi.fn();
    const stop = onOpenFile(opened);
    renderWithClient(<FileTree pid="demo" />);

    const folder = await screen.findByRole("button", { name: "scenes" });
    expect(folder).toHaveAttribute("aria-expanded", "true");
    const names = screen.getAllByRole("listitem").map((li) => li.firstChild?.textContent);
    expect(names).toEqual(["scenes", "intro.py", "pnp.yaml"]);

    fireEvent.click(screen.getByRole("button", { name: "intro.py" }));
    expect(opened).toHaveBeenCalledWith({ path: "scenes/intro.py" });
    fireEvent.click(folder);
    expect(screen.queryByRole("button", { name: "intro.py" })).not.toBeInTheDocument();
    stop();
  });

  it("creates a file and opens it", async () => {
    const calls = scriptFetch({
      [`GET ${FILES}`]: [tree, tree],
      [`POST ${FILES}`]: [{ status: 201, body: { path: "scenes/new.py", etag: "e1" } }],
    });
    const opened = vi.fn();
    const stop = onOpenFile(opened);
    renderWithClient(<FileTree pid="demo" />);

    fireEvent.click(await screen.findByRole("button", { name: "New file" }));
    fireEvent.change(screen.getByLabelText("New file path"), { target: { value: " scenes/new.py " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(opened).toHaveBeenCalledWith({ path: "scenes/new.py" }));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ path: "scenes/new.py", content: "" });
    stop();
  });

  it("renames a file and tells open tabs", async () => {
    const calls = scriptFetch({
      [`GET ${FILES}`]: [tree, tree],
      [`POST ${FILES}/rename`]: [{ status: 200, body: { path: "scenes/start.py", etag: "e1" } }],
    });
    renderWithClient(
      <>
        <FileTree pid="demo" />
        <MoveSpy />
      </>,
    );

    fireEvent.contextMenu(await screen.findByRole("button", { name: "intro.py" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename…" }));
    fireEvent.change(screen.getByLabelText("New path for scenes/intro.py"), {
      target: { value: "scenes/start.py" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(moves).toHaveBeenCalledWith("scenes/intro.py", "scenes/start.py"));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      from: "scenes/intro.py",
      to: "scenes/start.py",
    });
  });

  it("deletes after confirming, using the file's current etag", async () => {
    const calls = scriptFetch({
      [`GET ${FILES}`]: [tree, tree],
      [`GET ${FILES}/scenes/intro.py`]: [
        { status: 200, body: { path: "scenes/intro.py", content: "", etag: "e7" } },
      ],
      [`DELETE ${FILES}/scenes/intro.py`]: [{ status: 204 }],
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithClient(
      <>
        <FileTree pid="demo" />
        <MoveSpy />
      </>,
    );

    const more = await screen.findByRole("button", { name: "More actions for scenes/intro.py" });
    const del = () => {
      fireEvent.click(more);
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    };
    del();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    del();
    await waitFor(() => expect(moves).toHaveBeenCalledWith("scenes/intro.py", null));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(calls.find((c) => c.method === "DELETE")?.ifMatch).toBe('"e7"');
  });

  it("shows the error when a create is refused", async () => {
    scriptFetch({
      [`GET ${FILES}`]: [tree],
      [`POST ${FILES}`]: [
        { status: 409, body: { error: { code: "already_exists", message: "'pnp.yaml' already exists", details: null } } },
      ],
    });
    renderWithClient(<FileTree pid="demo" />);

    fireEvent.click(await screen.findByRole("button", { name: "New file" }));
    fireEvent.change(screen.getByLabelText("New file path"), { target: { value: "pnp.yaml" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("'pnp.yaml' already exists")).toBeInTheDocument();
  });

  it("disables New file, Rename and Delete while the agent is unreachable", async () => {
    scriptFetch({ [`GET ${FILES}`]: [tree] });
    renderWithClient(<FileTree pid="demo" connected={false} />);
    await screen.findByRole("button", { name: "pnp.yaml" });
    expect(screen.getByRole("button", { name: /New file/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "More actions for pnp.yaml" }));
    expect(screen.getByRole("menuitem", { name: "Rename…" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Open" })).toBeEnabled();
  });
});
