import { describe, expect, it } from "vitest";
import { makeJob } from "../../test/fixtures";
import {
  MIN_CLIP_PX,
  UNRENDERED_SECONDS,
  allRendered,
  dropIndex,
  layoutClips,
  rulerTicks,
  totalSeconds,
  zoomToPxPerSecond,
} from "./timelineMath";
import { latestArtifacts } from "./useSceneDurations";
import { formatClipLength } from "../monitor/timecode";

const durations = new Map([
  ["intro", 4],
  ["proof", 6.5],
]);

describe("layoutClips", () => {
  it("makes each clip as wide as its last rendered duration, end to end", () => {
    const boxes = layoutClips(["intro", "proof"], durations, 10);
    expect(boxes.map((b) => [b.x, b.width, b.start, b.rendered])).toEqual([
      [0, 40, 0, true],
      [40, 65, 4, true],
    ]);
    expect(totalSeconds(boxes)).toBe(10.5);
    expect(allRendered(boxes)).toBe(true);
  });

  it("draws a never-rendered clip at 5 s and marks it", () => {
    const boxes = layoutClips(["intro", "outro"], durations, 10);
    expect(boxes[1]).toMatchObject({ x: 40, width: UNRENDERED_SECONDS * 10, rendered: false });
    expect(allRendered(boxes)).toBe(false);
  });

  it("scales with zoom and keeps tiny clips clickable", () => {
    expect(layoutClips(["proof"], durations, 20)[0]!.width).toBe(130);
    expect(layoutClips(["intro"], new Map([["intro", 0.1]]), 10)[0]!.width).toBe(MIN_CLIP_PX);
  });

  it("repeats a scene used twice", () => {
    expect(layoutClips(["intro", "intro"], durations, 1).map((b) => b.x)).toEqual([0, 4]);
  });

  it("is empty for no clips", () => {
    expect(totalSeconds(layoutClips([], durations, 10))).toBe(0);
  });
});

describe("dropIndex", () => {
  const boxes = layoutClips(["a", "b", "c"], new Map([["a", 10], ["b", 10], ["c", 10]]), 10);

  it("moves a clip to after every other clip whose centre is left of the drop point", () => {
    expect(dropIndex(boxes, 0, 160)).toBe(1);
    expect(dropIndex(boxes, 0, 290)).toBe(2);
    expect(dropIndex(boxes, 2, 10)).toBe(0);
    expect(dropIndex(boxes, 1, 140)).toBe(1);
  });
});

describe("rulerTicks", () => {
  it("labels every second when zoomed in and every few seconds when zoomed out", () => {
    expect(rulerTicks(3, 100)).toEqual([0, 1, 2, 3]);
    expect(rulerTicks(20, 20)).toEqual([0, 5, 10, 15, 20]);
    expect(rulerTicks(240, 1)).toEqual([0, 120, 240]);
  });
});

describe("zoomToPxPerSecond", () => {
  it("runs from 4 to 200 px/s and clamps", () => {
    expect(zoomToPxPerSecond(0)).toBe(4);
    expect(zoomToPxPerSecond(100)).toBe(200);
    expect(zoomToPxPerSecond(-5)).toBe(4);
    expect(zoomToPxPerSecond(50)).toBeCloseTo(28.28, 1);
  });
});

describe("latestArtifacts", () => {
  it("takes each scene's newest completed render, export units included", () => {
    const jobs = [
      makeJob({ id: "j4", status: "failed" }),
      makeJob({ id: "j3", status: "completed", artifact_id: "new", export_id: "e1" }),
      makeJob({ id: "j2", status: "completed", artifact_id: "old" }),
    ];
    const other = makeJob({ id: "j1", status: "completed", artifact_id: "intro" });
    other.request = { ...other.request, scene: "scenes/intro.py:Intro" };
    const found = latestArtifacts([...jobs, other], ["scenes/proof.py:Proof", "scenes/intro.py:Intro", "missing"]);
    expect([...found]).toEqual([
      ["scenes/proof.py:Proof", "new"],
      ["scenes/intro.py:Intro", "intro"],
    ]);
  });
});

describe("formatClipLength", () => {
  it("shows tenths of a second, rounded, so labels match the block width", () => {
    expect(formatClipLength(5.87)).toBe("5.9s");
    expect(formatClipLength(5.07)).toBe("5.1s");
    expect(formatClipLength(0)).toBe("0.0s");
  });

  it("adds minutes past 60 s", () => {
    expect(formatClipLength(65.24)).toBe("1:05.2");
    expect(formatClipLength(59.96)).toBe("1:00.0");
  });
});
