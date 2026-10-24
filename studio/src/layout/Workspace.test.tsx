import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, stubFetch } from "../test/fixtures";
import { AGENT } from "../test/studio";
import { LayoutProvider } from "./LayoutContext";
import { LAYOUT_KEY } from "./layoutStore";
import { PanelFrame } from "./PanelFrame";
import { TitleBar } from "./TitleBar";
import { useShortcuts } from "./useShortcuts";
import { Workspace } from "./Workspace";

function Shell({ onNewProject = vi.fn() }: { onNewProject?: () => void }) {
  useShortcuts(onNewProject);
  const frame = (id: "project" | "editor" | "monitor" | "inspector") => (
    <PanelFrame frame={id} panel={id}>
      <p>{id} body</p>
    </PanelFrame>
  );
  return (
    <Workspace
      titleBar={<TitleBar projects={[]} projectId={null} onSelectProject={vi.fn()} onNewProject={onNewProject} onForgetToken={vi.fn()} connected />}
      statusBar={null}
      slots={{ project: frame("project"), editor: frame("editor"), monitor: frame("monitor"), inspector: frame("inspector"), dock: (id) => <p>{id} body</p> }}
    />
  );
}

function renderShell(onNewProject?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LayoutProvider>
        <Shell onNewProject={onNewProject} />
      </LayoutProvider>
    </QueryClientProvider>,
  );
}

const frame = (name: string) => screen.getByRole("region", { name, hidden: true });
const hidden = (name: string) => frame(name).hasAttribute("data-hidden");
const press = (code: string, mods: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(window, { code, ...mods });

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  stubFetch(() => jsonResponse(200, AGENT));
});
afterEach(() => vi.unstubAllGlobals());

describe("Workspace show / hide / maximize", () => {
  it("hides a panel from its header × and shows it again from the rail", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Hide Inspector" }));
    expect(hidden("Inspector")).toBe(true);
    const rail = screen.getByRole("button", { name: "Inspector", pressed: false });
    fireEvent.click(rail);
    expect(hidden("Inspector")).toBe(false);
    expect(rail).toHaveAttribute("aria-pressed", "true");
  });

  it("lists every panel in the Window menu with a check when visible", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Window" }));
    expect(screen.getByRole("menuitemcheckbox", { name: /Editor/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Editor/ }));
    expect(hidden("Editor")).toBe(true);
  });

  it("checks a dock tab open behind another one, and hides it in one choice", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Window" }));
    expect(screen.getByRole("menuitemcheckbox", { name: /Logs/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Logs/ }));
    expect(screen.queryByRole("tab", { name: "Logs" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Window" }));
    expect(screen.getByRole("menuitemcheckbox", { name: /Logs/ })).toHaveAttribute("aria-checked", "false");
  });

  it("Shift+2 focuses the Editor, a second press hides it, a third shows it", () => {
    renderShell();
    press("Digit2", { shiftKey: true });
    expect(frame("Editor")).toHaveAttribute("data-focused");
    press("Digit2", { shiftKey: true });
    expect(hidden("Editor")).toBe(true);
    press("Digit2", { shiftKey: true });
    expect(hidden("Editor")).toBe(false);
  });

  it("maximizes with the header button and restores with `", () => {
    renderShell();
    fireEvent.click(within(frame("Program")).getByRole("button", { name: "Maximize panel" }));
    expect(frame("Program")).toHaveAttribute("data-maximized");
    press("Backquote");
    expect(frame("Program")).not.toHaveAttribute("data-maximized");
  });

  it("Ctrl+` brings the Terminal tab to the front, and hides it on a second press", () => {
    renderShell();
    press("Backquote", { ctrlKey: true });
    expect(screen.getByRole("tab", { name: "Terminal" })).toHaveAttribute("aria-selected", "true");
    press("Backquote", { ctrlKey: true });
    expect(screen.queryByRole("tab", { name: "Terminal" })).not.toBeInTheDocument();
  });

  it("keeps a dock tab mounted while it is hidden, so the shell survives a hide/show", () => {
    renderShell();
    press("Backquote", { ctrlKey: true });
    const body = screen.getByText("terminal body");
    press("Backquote", { ctrlKey: true });
    expect(screen.queryByRole("tab", { name: "Terminal" })).not.toBeInTheDocument();
    expect(body).toBeInTheDocument();
    expect(body.closest("[role=tabpanel]")).toHaveAttribute("hidden");
    press("Backquote", { ctrlKey: true });
    expect(screen.getByText("terminal body")).toBe(body);
    expect(body.closest("[role=tabpanel]")).not.toHaveAttribute("hidden");
  });

  it("Ctrl+N asks for a new project", () => {
    const onNewProject = vi.fn();
    renderShell(onNewProject);
    press("KeyN", { ctrlKey: true });
    expect(onNewProject).toHaveBeenCalled();
  });

  it("keeps the layout across a reload and Reset workspace restores the defaults", () => {
    const { unmount } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Hide Project" }));
    unmount();
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY)!).visible.project).toBe(false);
    renderShell();
    expect(hidden("Project")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Window" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reset workspace" }));
    expect(hidden("Project")).toBe(false);
  });
});
