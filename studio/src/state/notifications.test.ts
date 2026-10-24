import { describe, expect, it } from "vitest";
import type { JobStatus } from "../api/types";
import { finished, type Watched } from "./notifications";

const item = (key: string, status: JobStatus): Watched => ({ key, status, title: key, source: { kind: "job", id: key } });

describe("finished", () => {
  it("reports items that went from unfinished to completed or failed", () => {
    const before = new Map<string, JobStatus>([
      ["a", "running"],
      ["b", "queued"],
      ["c", "completed"],
      ["d", "running"],
      ["e", "running"],
    ]);
    const now = [item("a", "completed"), item("b", "failed"), item("c", "completed"), item("d", "cancelled"), item("e", "running"), item("new", "completed")];
    expect(finished(before, now).map((i) => i.key)).toEqual(["a", "b"]);
  });

  it("reports nothing on the first load", () => {
    expect(finished(new Map(), [item("a", "completed")])).toEqual([]);
  });
});
