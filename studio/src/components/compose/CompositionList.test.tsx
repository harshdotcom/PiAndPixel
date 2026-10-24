import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompositionsResponse } from "../../api/types";
import { jsonResponse, makeScene, renderWithClient, stubFetch, type FakeRequest } from "../../test/fixtures";
import { CompositionList } from "./CompositionList";

const scenes = [makeScene("Intro"), makeScene("Proof")];
const onDisk: CompositionsResponse = {
  compositions: { main: { title: null, clips: [{ scene: scenes[1]!.ref, params: {} }] } },
  etag: "e1",
};

function stubCompositions() {
  const puts: FakeRequest[] = [];
  stubFetch((req) => {
    if (req.method === "PUT") {
      puts.push(req);
      return jsonResponse(200, { ...(req.body as object), etag: "e2" });
    }
    return jsonResponse(200, onDisk);
  });
  return puts;
}

afterEach(() => vi.unstubAllGlobals());

describe("CompositionList", () => {
  it("lists the compositions and selects one", async () => {
    stubCompositions();
    const onSelect = vi.fn();
    renderWithClient(<CompositionList pid="demo" scenes={scenes} selected="main" onSelect={onSelect} />);

    const main = await screen.findByRole("button", { name: "main" });
    expect(main).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(main);
    expect(onSelect).toHaveBeenCalledWith("main");
  });

  it("validates the new name, then creates it with the first scene and selects it", async () => {
    const puts = stubCompositions();
    const onSelect = vi.fn();
    renderWithClient(<CompositionList pid="demo" scenes={scenes} selected={null} onSelect={onSelect} />);
    await screen.findByRole("button", { name: "main" });
    const input = screen.getByLabelText("New composition name");
    const create = screen.getByRole("button", { name: "New" });

    fireEvent.change(input, { target: { value: "bad name" } });
    expect(screen.getByText(/letters, digits/)).toBeInTheDocument();
    expect(create).toBeDisabled();
    fireEvent.change(input, { target: { value: "main" } });
    expect(screen.getByText('"main" already exists.')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "teaser" } });
    fireEvent.click(create);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("teaser"));
    expect(puts[0]!.headers.get("If-Match")).toBe('"e1"');
    expect(puts[0]!.body).toEqual({
      compositions: {
        ...onDisk.compositions,
        teaser: { title: null, clips: [{ scene: scenes[0]!.ref, params: {} }] },
      },
    });
  });

  it("cannot create a composition without scenes", async () => {
    stubCompositions();
    renderWithClient(<CompositionList pid="demo" scenes={[]} selected={null} onSelect={vi.fn()} />);
    await screen.findByRole("button", { name: "main" });

    expect(screen.getByLabelText("New composition name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "New" })).toBeDisabled();
    expect(screen.getByText("Add a scene first.")).toBeInTheDocument();
  });
});
