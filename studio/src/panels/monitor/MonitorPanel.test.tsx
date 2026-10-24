import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeJob } from "../../test/fixtures";
import { INTRO, OUTRO, PROOF, fakeAgent, makeArtifact, renderInStudio } from "../../test/studio";
import { MonitorPanel } from "./MonitorPanel";

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("MonitorPanel", () => {
  it("shows the placeholder before anything was rendered", async () => {
    fakeAgent();
    renderInStudio(<MonitorPanel />);
    expect(await screen.findByText("Render a scene to preview it")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("plays the newest completed render with its own fps in the timecode", async () => {
    fakeAgent({ jobs: [makeJob({ status: "completed", artifact_id: "a1" })], artifacts: [makeArtifact("a1", 6)] });
    renderInStudio(<MonitorPanel />);
    const video = await screen.findByLabelText("Program video");
    expect(video).toHaveAttribute("src", "/s/a1");
    expect(video).not.toHaveAttribute("controls");
    expect(screen.getByLabelText("Current time")).toHaveTextContent("00:00:00:00");
    fireEvent.click(screen.getByRole("button", { name: "Safe areas" }));
    expect(screen.getByLabelText("Safe area guides")).toBeInTheDocument();
  });

  it("shows the newest render of the scene ● Render would render, and follows the Scene select", async () => {
    const job = (id: string, scene: string) => makeJob({ id, status: "completed", artifact_id: id, request: { ...makeJob().request, scene } });
    fakeAgent({ jobs: [job("outro", OUTRO), job("intro", INTRO)], artifacts: [makeArtifact("outro", 5), makeArtifact("intro", 6)] });
    renderInStudio(<MonitorPanel />);
    await waitFor(() => expect(screen.getByLabelText("Program video")).toHaveAttribute("src", "/s/intro"));
    expect(screen.getByRole("combobox", { name: "Scene" })).toHaveValue(INTRO);
    fireEvent.change(screen.getByRole("combobox", { name: "Scene" }), { target: { value: OUTRO } });
    await waitFor(() => expect(screen.getByLabelText("Program video")).toHaveAttribute("src", "/s/outro"));
  });

  it("names the select the render scene while another scene's render is on screen", async () => {
    fakeAgent({ jobs: [makeJob({ status: "completed", artifact_id: "a1" })], artifacts: [makeArtifact("a1", 6)] });
    renderInStudio(<MonitorPanel />);
    await screen.findByLabelText("Program video");
    expect(await screen.findByRole("combobox", { name: "Render scene" })).toHaveValue(INTRO);
  });

  it("shows measured progress while rendering, never a percentage", async () => {
    const started = new Date(Date.now() - 4000).toISOString();
    fakeAgent({ jobs: [makeJob({ status: "running", started_at: started, progress: { animations_done: 3, pct: null } })] });
    renderInStudio(<MonitorPanel />);
    expect(await screen.findByText(/Rendering… 3 animations · 0:0[3-5]/)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
    // Along the monitor's bottom edge, like the export bar (docs/ui-design.md §1).
    expect(bar).toHaveClass("absolute", "bottom-0", "inset-x-0");
  });

  it("renders the scene picked in its header with the footer's settings", async () => {
    const agent = fakeAgent();
    renderInStudio(<MonitorPanel />);
    await screen.findByRole("option", { name: "Proof" });
    fireEvent.change(screen.getByRole("combobox", { name: "Scene" }), { target: { value: PROOF } });
    const render = screen.getByRole("button", { name: /Render/ });
    await waitFor(() => expect(render).toBeEnabled());
    fireEvent.click(render);
    await waitFor(() => expect(agent.requests.find((r) => r.method === "POST")?.body).toEqual({ scene: PROOF, format: "landscape", resolution: "480p", fps: 15, params: {} }));
  });

  it("disables Render while the agent is disconnected", async () => {
    fakeAgent();
    renderInStudio(<MonitorPanel />, false);
    await screen.findByRole("option", { name: "Proof" });
    expect(screen.getByRole("button", { name: /Render/ })).toBeDisabled();
  });
});
