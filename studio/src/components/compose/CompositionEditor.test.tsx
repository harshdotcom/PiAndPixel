import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompositionsResponse } from "../../api/types";
import { jsonResponse, makeScene, renderWithClient, stubFetch, type FakeRequest } from "../../test/fixtures";
import { CompositionEditor } from "./CompositionEditor";

const scenes = [makeScene("Intro"), makeScene("Proof"), makeScene("Outro")];
const [intro, proof, outro] = scenes.map((s) => s.ref) as [string, string, string];

const onDisk: CompositionsResponse = {
  compositions: {
    main: { title: "Main cut", clips: [{ scene: intro, params: {} }, { scene: proof, params: { n: 2 } }] },
    teaser: { title: null, clips: [{ scene: outro, params: {} }] },
  },
  etag: "e1",
};

/** Serves `responses` for GET compositions in turn and records every PUT. */
function stubCompositions(responses: CompositionsResponse[], putStatus = 200) {
  const puts: FakeRequest[] = [];
  let gets = 0;
  stubFetch((req) => {
    if (req.method === "PUT") {
      puts.push(req);
      if (putStatus !== 200) {
        return jsonResponse(putStatus, { error: { code: "conflict", message: "Stale", details: null } });
      }
      return jsonResponse(200, { ...(req.body as object), etag: "e2" });
    }
    return jsonResponse(200, responses[Math.min(gets++, responses.length - 1)]);
  });
  return puts;
}

function renderEditor(onDeleted = vi.fn()) {
  renderWithClient(<CompositionEditor pid="demo" name="main" scenes={scenes} onDeleted={onDeleted} />);
  return onDeleted;
}

const clipScenes = () =>
  within(screen.getByRole("list", { name: "Clips" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent?.match(/scenes\/\S+:\w+/)?.[0]);

afterEach(() => vi.unstubAllGlobals());

describe("CompositionEditor", () => {
  it("reorders, adds and removes clips, then saves them in order with the etag", async () => {
    const puts = stubCompositions([onDisk]);
    renderEditor();
    await screen.findByLabelText("Clip 1");
    expect(screen.getByLabelText("Title")).toHaveValue("Main cut");

    fireEvent.click(screen.getByRole("button", { name: "Move Clip 2 up" }));
    expect(clipScenes()).toEqual([proof, intro]);
    fireEvent.change(screen.getByLabelText("Scene to add"), { target: { value: outro } });
    fireEvent.click(screen.getByRole("button", { name: "Add clip" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Clip 2" }));
    expect(clipScenes()).toEqual([proof, outro]);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]!.headers.get("If-Match")).toBe('"e1"');
    expect(puts[0]!.body).toEqual({
      compositions: {
        main: { title: "Main cut", clips: [{ scene: proof, params: { n: 2 } }, { scene: outro, params: {} }] },
        teaser: onDisk.compositions.teaser,
      },
    });
  });

  it("shows a params JSON error inline and disables Save until it is fixed", async () => {
    stubCompositions([onDisk]);
    renderEditor();
    const params = await screen.findByLabelText("Clip 2 params");

    fireEvent.change(params, { target: { value: '{"n": ' } });
    expect(params).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/^Invalid JSON/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(params, { target: { value: "[1]" } });
    expect(screen.getByText(/must be a JSON object/)).toBeInTheDocument();

    fireEvent.change(params, { target: { value: '{"n": 3}' } });
    expect(screen.queryByText(/JSON/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("disables Save when every clip was removed", async () => {
    stubCompositions([onDisk]);
    renderEditor();
    await screen.findByLabelText("Clip 1");

    fireEvent.click(screen.getByRole("button", { name: "Remove Clip 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Clip 1" }));
    expect(screen.getByText("Add at least one clip.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("reports unsaved edits until they are saved or undone", async () => {
    stubCompositions([onDisk]);
    const onDirtyChange = vi.fn();
    renderWithClient(
      <CompositionEditor pid="demo" name="main" scenes={scenes} onDeleted={vi.fn()} onDirtyChange={onDirtyChange} />,
    );
    await screen.findByLabelText("Clip 1");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Other" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Main cut" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Remove Clip 2" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it("on 412 says pnp.yaml changed and Reload starts again from disk", async () => {
    const changed: CompositionsResponse = {
      compositions: { main: { title: "Edited elsewhere", clips: [{ scene: outro, params: {} }] } },
      etag: "e9",
    };
    stubCompositions([onDisk, changed], 412);
    renderEditor();
    await screen.findByLabelText("Clip 1");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("pnp.yaml changed on disk.");

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Edited elsewhere"));
    expect(clipScenes()).toEqual([outro]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("deletes after confirmation by saving the other compositions", async () => {
    const puts = stubCompositions([onDisk]);
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    const onDeleted = renderEditor();
    await screen.findByLabelText("Clip 1");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(puts).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(puts[0]!.body).toEqual({ compositions: { teaser: onDisk.compositions.teaser } });
  });
});
