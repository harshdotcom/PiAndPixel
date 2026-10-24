import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RENDER_OPTIONS, jsonResponse, renderWithClient, stubFetch } from "../test/fixtures";
import { RenderControls } from "./RenderControls";

const formats = {
  landscape: { width: 1920, height: 1080, fps: 30 },
  portrait: { width: 1080, height: 1920, fps: 30 },
  wide: { width: 2400, height: 1000, fps: 30 },
};

function stubAgent() {
  stubFetch(() => jsonResponse(200, { render_options: RENDER_OPTIONS }));
}

function renderControls(pid = "demo") {
  const onRender = vi.fn();
  renderWithClient(<RenderControls pid={pid} formats={formats} disabled={false} busy={false} onRender={onRender} />);
  return onRender;
}

const select = (name: string) => screen.getByRole("combobox", { name }) as HTMLSelectElement;
const option = (name: string) => screen.getByRole("option", { name }) as HTMLOptionElement;

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("RenderControls", () => {
  it("starts at 480p @ 15 and labels each format with its exact output size", async () => {
    stubAgent();
    const onRender = renderControls();

    await waitFor(() => expect(select("Resolution").value).toBe("480p"));
    expect(select("FPS").value).toBe("15");
    expect(option("landscape · 854×480")).toBeInTheDocument();
    expect(option("portrait · 480×854")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Render" }));
    expect(onRender).toHaveBeenCalledWith("landscape", { resolution: "480p", fps: 15 });
  });

  it("renders the picked resolution and fps, labels 2160p as 4K and warns about heavy ones", async () => {
    stubAgent();
    const onRender = renderControls();
    await waitFor(() => expect(select("Resolution")).toBeEnabled());

    expect(screen.queryByText("slower, uses more memory")).not.toBeInTheDocument();
    fireEvent.change(select("Format"), { target: { value: "portrait" } });
    fireEvent.change(select("Resolution"), { target: { value: "720p" } });
    fireEvent.change(select("FPS"), { target: { value: "24" } });
    expect(option("portrait · 720×1280")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Render" }));
    expect(onRender).toHaveBeenCalledWith("portrait", { resolution: "720p", fps: 24 });

    expect(option("4K")).toBeInTheDocument();
    fireEvent.change(select("Resolution"), { target: { value: "2160p" } });
    expect(screen.getByText("slower, uses more memory")).toBeInTheDocument();
    expect(option("portrait · 2160×3840")).toBeInTheDocument();
    // 2.4:1 at 4K would be 5184 px wide: too large, and Render is off for it.
    expect(option("wide · too large")).toBeInTheDocument();
    fireEvent.change(select("Format"), { target: { value: "wide" } });
    expect(option("4K")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Render" })).toBeDisabled();
  });

  it("remembers the last choice per project", async () => {
    stubAgent();
    renderControls("demo");
    await waitFor(() => expect(select("Resolution")).toBeEnabled());
    fireEvent.change(select("Resolution"), { target: { value: "1080p" } });
    fireEvent.change(select("FPS"), { target: { value: "60" } });
    expect(JSON.parse(localStorage.getItem("pnp.output.render.demo")!)).toEqual({ resolution: "1080p", fps: 60 });
  });

  it("starts from the stored choice and ignores values the Agent does not offer", async () => {
    localStorage.setItem("pnp.output.render.demo", JSON.stringify({ resolution: "1440p", fps: 24 }));
    localStorage.setItem("pnp.output.render.other", JSON.stringify({ resolution: "8k", fps: 25 }));
    stubAgent();
    renderControls("demo");
    await waitFor(() => expect(select("Resolution").value).toBe("1440p"));
    expect(select("FPS").value).toBe("24");
  });

  it("falls back to the default for unknown stored values", async () => {
    localStorage.setItem("pnp.output.render.other", JSON.stringify({ resolution: "8k", fps: 25 }));
    stubAgent();
    renderControls("other");
    await waitFor(() => expect(select("Resolution").value).toBe("480p"));
    expect(select("FPS").value).toBe("15");
  });

  it("still works when localStorage throws", async () => {
    // Only localStorage is blocked; the token stays in sessionStorage.
    const { getItem, setItem } = Storage.prototype;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (this === localStorage) throw new Error("blocked");
      return getItem.call(this, key);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (this === localStorage) throw new Error("blocked");
      setItem.call(this, key, value);
    });
    stubAgent();
    const onRender = renderControls();
    await waitFor(() => expect(select("Resolution").value).toBe("480p"));
    fireEvent.change(select("Resolution"), { target: { value: "720p" } });
    fireEvent.click(screen.getByRole("button", { name: "Render" }));
    expect(onRender).toHaveBeenCalledWith("landscape", { resolution: "720p", fps: 15 });
    vi.restoreAllMocks();
  });

  it("has no quality buttons and waits for the Agent's options before rendering", () => {
    stubFetch(() => new Response(null, { status: 503 }));
    renderControls();
    expect(screen.queryByRole("button", { name: "Draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Render" })).toBeDisabled();
  });
});
