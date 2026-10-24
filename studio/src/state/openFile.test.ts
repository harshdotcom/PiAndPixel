import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { onOpenFile, requestOpenFile, useOpenFileRequests } from "./openFile";

describe("openFile", () => {
  it("delivers requests to listeners until they unsubscribe", () => {
    const listener = vi.fn();
    const off = onOpenFile(listener);
    requestOpenFile({ path: "scenes/proof.py", line: 12 });
    off();
    requestOpenFile({ path: "pnp.yaml" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ path: "scenes/proof.py", line: 12 });
  });

  it("hook calls the latest handler and stops on unmount", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ fn }) => useOpenFileRequests(fn), {
      initialProps: { fn: first },
    });
    rerender({ fn: second });
    requestOpenFile({ path: "a.py" });
    unmount();
    requestOpenFile({ path: "b.py" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
