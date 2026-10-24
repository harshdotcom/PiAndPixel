import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeJob } from "../test/fixtures";
import { applyEvent, parseEvent, useAgentEvents } from "./events";
import { queryKeys } from "./queryKeys";
import type { AgentEvent } from "./messages";
import type { Job } from "./types";

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  open() {
    act(() => this.onopen?.());
  }

  send(event: unknown) {
    const data = typeof event === "string" ? event : JSON.stringify(event);
    act(() => this.onmessage?.(new MessageEvent("message", { data })));
  }

  drop() {
    act(() => this.onclose?.());
  }
}

const latest = () => FakeSocket.instances.at(-1)!;

const log = (line: string, attempt = 1): AgentEvent => ({
  type: "job.log",
  job_id: "job1",
  project: "demo",
  attempt,
  line,
});

function mount(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useAgentEvents(), { wrapper });
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  sessionStorage.setItem("pnp.token", "tok");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("parseEvent", () => {
  it("accepts the documented shapes", () => {
    expect(parseEvent(JSON.stringify(log("hi")))).toEqual(log("hi"));
  });

  it.each([
    "not json",
    "null",
    "[]",
    JSON.stringify({ type: "job.unknown", job_id: "x", project: "p" }),
    JSON.stringify({ type: "job.status", job_id: 3, project: "p", status: "running" }),
    JSON.stringify({ type: "job.log", job_id: "x", project: "p", line: "l" }),
    JSON.stringify({ type: "export.status", project: "p", status: "running" }),
  ])("ignores %s", (data) => {
    expect(parseEvent(data)).toBeNull();
  });

  it("ignores binary frames", () => {
    expect(parseEvent(new ArrayBuffer(2))).toBeNull();
  });
});

describe("applyEvent", () => {
  it("appends log lines of the cached attempt and keeps the last 50", () => {
    const client = new QueryClient();
    const tail = Array.from({ length: 50 }, (_, i) => `line ${i}`);
    client.setQueryData(queryKeys.job("job1"), makeJob({ attempt: 1, log_tail: tail }));

    applyEvent(client, log("newest"));
    applyEvent(client, log("old attempt", 2));

    const job = client.getQueryData<Job>(queryKeys.job("job1"))!;
    expect(job.log_tail).toHaveLength(50);
    expect(job.log_tail[0]).toBe("line 1");
    expect(job.log_tail.at(-1)).toBe("newest");
  });

  it("ignores log lines of jobs that are not cached", () => {
    const client = new QueryClient();
    applyEvent(client, log("nobody listens"));
    expect(client.getQueryData(queryKeys.job("job1"))).toBeUndefined();
  });

  it("patches render and composite progress", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.job("job1"), makeJob());

    const progress = () => client.getQueryData<Job>(queryKeys.job("job1"))!.progress;
    const ids = { type: "job.progress", job_id: "job1", project: "demo" } as const;

    applyEvent(client, { ...ids, kind: "render", animations_done: 4 });
    expect(progress()).toEqual({ animations_done: 4, pct: null });

    applyEvent(client, { ...ids, kind: "composite", pct: 41 });
    expect(progress()).toEqual({ animations_done: 4, pct: 41 });
  });

  it("invalidates the job and job list on job.status, the export and list on export.status", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    applyEvent(client, {
      type: "job.status", job_id: "job1", project: "demo", kind: "render", export_id: null,
      status: "running", attempt: 1, error: null, error_code: null, artifact_id: null,
    });
    applyEvent(client, {
      type: "export.status", export_id: "e1", project: "demo", status: "running",
      units_done: 1, units_total: 3, artifact_id: null, error: null,
    });

    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.job("job1"),
      queryKeys.jobs("demo"),
      queryKeys.export("e1"),
      queryKeys.exports("demo"),
    ]);
  });
});

describe("useAgentEvents", () => {
  it("connects with the token, resyncs on open and applies messages", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.job("job1"), makeJob({ attempt: 1 }));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = mount(client);

    expect(latest().url).toMatch(/^ws:\/\/[^/]+\/api\/v1\/events\?token=tok$/);
    expect(result.current.connected).toBe(false);

    latest().open();
    expect(result.current.connected).toBe(true);
    const prefixes = invalidate.mock.calls.map(([f]) => f?.queryKey);
    expect(prefixes).toEqual([["jobs"], ["job"], ["exports"], ["export"]]);

    latest().send("garbage");
    latest().send(log("Animation 0"));
    expect(client.getQueryData<Job>(queryKeys.job("job1"))!.log_tail).toEqual(["Animation 0"]);
  });

  it("reconnects with doubling backoff capped at 10 s, reset after a successful open", () => {
    vi.useFakeTimers();
    const { result } = mount(new QueryClient());
    const delays = [1000, 2000, 4000, 8000, 10_000, 10_000];

    for (const delay of delays) {
      latest().drop();
      expect(result.current.connected).toBe(false);
      const count = FakeSocket.instances.length;
      act(() => vi.advanceTimersByTime(delay - 1));
      expect(FakeSocket.instances).toHaveLength(count);
      act(() => vi.advanceTimersByTime(1));
      expect(FakeSocket.instances).toHaveLength(count + 1);
    }

    latest().open();
    latest().drop();
    const count = FakeSocket.instances.length;
    act(() => vi.advanceTimersByTime(1000));
    expect(FakeSocket.instances).toHaveLength(count + 1);
  });

  it("closes the socket and stops reconnecting on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = mount(new QueryClient());
    const socket = latest();

    unmount();
    expect(socket.closed).toBe(true);
    socket.drop();
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
