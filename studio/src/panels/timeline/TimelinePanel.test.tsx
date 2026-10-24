import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompositionsResponse } from "../../api/types";
import { makeJob } from "../../test/fixtures";
import { INTRO, OUTRO, PROOF, fakeAgent, makeArtifact, renderInStudio } from "../../test/studio";
import { SelectionSection } from "../inspector/SelectionSection";
import { TimelinePanel } from "./TimelinePanel";

const onDisk = (): CompositionsResponse => ({
  compositions: {
    main: { title: "Main cut", clips: [{ scene: INTRO, params: {} }, { scene: PROOF, params: { n: 2 } }] },
    teaser: { title: null, clips: [{ scene: OUTRO, params: {} }] },
  },
  etag: "e1",
});

function renderTimeline() {
  renderInStudio(
    <>
      <TimelinePanel />
      <SelectionSection />
    </>,
  );
}

const clipNames = () => within(screen.getByRole("list", { name: "Track V1" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
const puts = (agent: ReturnType<typeof fakeAgent>) => agent.requests.filter((r) => r.method === "PUT");

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("TimelinePanel", () => {
  it("draws clips by their last rendered duration, dashed when never rendered", async () => {
    fakeAgent({ compositions: onDisk(), jobs: [makeJob({ status: "completed", artifact_id: "a1" })], artifacts: [makeArtifact("a1", 6)] });
    renderTimeline();
    const proof = await screen.findByRole("button", { name: "Clip 2: Proof" });
    await waitFor(() => expect(proof).toHaveTextContent("6.0s"));
    expect(screen.getByRole("button", { name: "Clip 1: Intro" })).toHaveTextContent("not rendered");
  });

  it("adds and removes clips, then saves them in order with the etag", async () => {
    const agent = fakeAgent({ compositions: onDisk() });
    renderTimeline();
    fireEvent.click(await screen.findByRole("button", { name: "Clip 1: Intro" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Clip 1: Intro" }), { key: "Delete" });
    fireEvent.click(screen.getByRole("button", { name: "Add clip" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Outro/ }));
    expect(clipNames()).toEqual(["Clip 1: Proof", "Clip 2: Outro"]);
    expect(screen.getByText("● unsaved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts(agent)).toHaveLength(1));
    expect(puts(agent)[0]!.headers.get("If-Match")).toBe('"e1"');
    expect(puts(agent)[0]!.body).toEqual({
      compositions: {
        main: { title: "Main cut", clips: [{ scene: PROOF, params: { n: 2 } }, { scene: OUTRO, params: {} }] },
        teaser: onDisk().compositions.teaser,
      },
    });
    await waitFor(() => expect(screen.queryByText("● unsaved")).not.toBeInTheDocument());
  });

  it("edits a selected clip's params in the Inspector and blocks Save while they are invalid", async () => {
    fakeAgent({ compositions: onDisk() });
    renderTimeline();
    fireEvent.click(await screen.findByRole("button", { name: "Clip 2: Proof" }));
    const params = screen.getByLabelText("Clip 2 params");
    fireEvent.change(params, { target: { value: '{"n": ' } });
    expect(params).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/^Invalid JSON/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(params, { target: { value: "[1]" } });
    expect(screen.getByText(/must be a JSON object/)).toBeInTheDocument();
    fireEvent.change(params, { target: { value: '{"n": 3}' } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("on 412 says pnp.yaml changed and Reload starts again from disk", async () => {
    const agent = fakeAgent({ compositions: onDisk(), putStatus: 412 });
    renderTimeline();
    fireEvent.click(await screen.findByRole("button", { name: "Clip 1: Intro" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove clip" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("pnp.yaml changed on disk.");
    agent.compositions = { compositions: { main: { title: null, clips: [{ scene: OUTRO, params: {} }] } }, etag: "e9" };
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(clipNames()).toEqual(["Clip 1: Outro"]));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("deletes a composition after confirmation by saving the others", async () => {
    const agent = fakeAgent({ compositions: onDisk() });
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    renderTimeline();
    await screen.findByRole("button", { name: "Clip 1: Intro" });
    fireEvent.click(screen.getByRole("button", { name: "Composition actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete composition…" }));
    await waitFor(() => expect(puts(agent)[0]?.body).toEqual({ compositions: { teaser: onDisk().compositions.teaser } }));
  });

  it("validates a new composition's name, creates it with the first scene and opens it", async () => {
    const agent = fakeAgent({ compositions: onDisk() });
    renderTimeline();
    await screen.findByRole("tab", { name: "main" });
    fireEvent.click(screen.getByRole("button", { name: "New composition" }));
    const input = screen.getByLabelText("New composition name");
    fireEvent.change(input, { target: { value: "bad name" } });
    expect(screen.getByText(/letters, digits/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "main" } });
    expect(screen.getByText('"main" already exists.')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "short" } });
    fireEvent.submit(input);
    await waitFor(() => expect(screen.getByRole("tab", { name: "short" })).toHaveAttribute("aria-selected", "true"));
    expect(puts(agent)[0]!.body).toMatchObject({ compositions: { short: { title: null, clips: [{ scene: INTRO, params: {} }] } } });
  });

  it("offers to create one when there are no compositions", async () => {
    fakeAgent();
    renderTimeline();
    fireEvent.click(await screen.findByRole("button", { name: "Create one" }));
    expect(screen.getByLabelText("New composition name")).toBeInTheDocument();
  });

  it("exports the saved composition with the Output settings and a fresh Idempotency-Key per click", async () => {
    const agent = fakeAgent({ compositions: onDisk() });
    renderTimeline();
    const exportButton = await screen.findByRole("button", { name: "Export" });
    await waitFor(() => expect(exportButton).toBeEnabled());
    fireEvent.click(exportButton);
    await waitFor(() => expect(agent.requests.filter((r) => r.url.endsWith("/exports"))).toHaveLength(1));
    fireEvent.click(exportButton);
    await waitFor(() => expect(agent.requests.filter((r) => r.url.endsWith("/exports"))).toHaveLength(2));
    const posts = agent.requests.filter((r) => r.url.endsWith("/exports"));
    expect(posts[0]!.body).toEqual({ composition: "main", format: "landscape", resolution: "480p", fps: 15 });
    const keys = posts.map((p) => p.headers.get("Idempotency-Key"));
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("will not export unsaved edits", async () => {
    fakeAgent({ compositions: onDisk() });
    renderTimeline();
    fireEvent.click(await screen.findByRole("button", { name: "Clip 1: Intro" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Clip 1: Intro" }), { key: "Backspace" });
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export" })).toHaveAttribute("title", expect.stringMatching(/Save the composition first/));
  });
});
