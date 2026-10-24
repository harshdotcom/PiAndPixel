import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REFRESH_DELAY_MS, useRefreshProjectLists } from "./files";
import { queryKeys } from "./queryKeys";

afterEach(() => vi.useRealTimers());

describe("useRefreshProjectLists", () => {
  it("refetches the file tree, scenes and compositions once activity has settled", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useRefreshProjectLists("demo"), { wrapper });

    act(() => {
      result.current();
      vi.advanceTimersByTime(REFRESH_DELAY_MS - 1);
      result.current();
      vi.advanceTimersByTime(REFRESH_DELAY_MS - 1);
    });
    expect(invalidate).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual([
      queryKeys.files("demo"),
      queryKeys.scenes("demo"),
      queryKeys.compositions("demo"),
      queryKeys.project("demo"),
    ]);
  });
});
