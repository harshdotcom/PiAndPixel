import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "../../api/types";
import { onOpenFile } from "../../state/openFile";
import { jsonResponse, renderWithClient, stubFetch, type FakeRequest } from "../../test/fixtures";
import { PROOF, fakeAgent, renderInStudio } from "../../test/studio";
import { NewProjectDialog } from "./NewProjectDialog";
import { ProjectPanel } from "./ProjectPanel";

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("ProjectPanel ▸ Scenes", () => {
  it("double-click opens the scene's file at its class, and Render renders that scene", async () => {
    const agent = fakeAgent();
    const opened = vi.fn();
    const stop = onOpenFile(opened);
    renderInStudio(<ProjectPanel pid="demo" />);
    fireEvent.click(screen.getByRole("tab", { name: "Scenes" }));
    fireEvent.doubleClick(await screen.findByRole("button", { name: /^Proof/ }));
    expect(opened).toHaveBeenCalledWith({ path: "scenes/proof.py", line: 4 });
    const render = screen.getByRole("button", { name: "Render Proof" });
    await waitFor(() => expect(render).toBeEnabled());
    fireEvent.click(render);
    await waitFor(() => expect(agent.requests.find((r) => r.method === "POST")?.body).toMatchObject({ scene: PROOF }));
    stop();
  });

  it("switches the Renders tab between list and grid", async () => {
    fakeAgent();
    renderInStudio(<ProjectPanel pid="demo" />);
    expect(screen.queryByRole("button", { name: "Grid view" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Renders" }));
    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("NewProjectDialog", () => {
  it("creates a project from the picked template card", async () => {
    const posts: FakeRequest[] = [];
    stubFetch((req) => {
      if (req.method === "POST") {
        posts.push(req);
        return jsonResponse(201, { id: "my-film", name: "My film", description: "", error: null } satisfies ProjectSummary);
      }
      return jsonResponse(200, [
        { id: "pythagoras", name: "Pythagoras explainer", description: "Proof" },
        { id: "blank", name: "Blank", description: "One scene" },
      ]);
    });
    const onCreated = vi.fn();
    renderWithClient(<NewProjectDialog onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.click(await screen.findByRole("radio", { name: /Blank/ }));
    expect(screen.getByRole("radio", { name: /Blank/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: " My film " } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("my-film"));
    expect(posts[0]!.body).toEqual({ name: "My film", template: "blank", description: null });
  });

  it("closes on Escape", () => {
    stubFetch(() => jsonResponse(200, []));
    const onClose = vi.fn();
    renderWithClient(<NewProjectDialog onClose={onClose} onCreated={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
