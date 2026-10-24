import { describe, expect, it } from "vitest";
import { outputLabel, outputSize, resolutionLabel } from "./geometry";

const landscape = { width: 1920, height: 1080, fps: 30 };
const portrait = { width: 1080, height: 1920, fps: 30 };
const square = { width: 1080, height: 1080, fps: 30 };

describe("outputSize", () => {
  // The same vectors as packages/core/tests/test_core_formats.py.
  it.each([
    [landscape, 480, 854, 480],
    [landscape, 720, 1280, 720],
    [landscape, 2160, 3840, 2160],
    [portrait, 480, 480, 854],
    [portrait, 720, 720, 1280],
    [portrait, 1440, 1440, 2560],
    [square, 1080, 1080, 1080],
  ])("scales %o to a %ip short edge", (format, short, width, height) => {
    expect(outputSize(format, short, 3840)).toEqual({ width, height });
  });

  it("rounds the long edge to the nearest even number", () => {
    expect(outputSize({ width: 1000, height: 1003, fps: 30 }, 480, 3840)).toEqual({ width: 480, height: 482 });
    expect(outputSize({ width: 1005, height: 1000, fps: 30 }, 720, 3840)).toEqual({ width: 724, height: 720 });
  });

  it("is null when the long edge would pass the cap", () => {
    const wide = { width: 2400, height: 1000, fps: 30 };
    expect(outputSize(wide, 1440, 3840)).toEqual({ width: 3456, height: 1440 });
    expect(outputSize(wide, 2160, 3840)).toBeNull();
  });
});

describe("labels", () => {
  it("calls 2160p 4K", () => {
    expect(resolutionLabel("2160p")).toBe("4K");
    expect(resolutionLabel("720p")).toBe("720p");
  });

  it("describes the output, falling back to the quality of older records", () => {
    expect(outputLabel({ resolution: "2160p", quality: "final", fps: 60 })).toBe("4K @ 60 fps");
    expect(outputLabel({ quality: "draft" })).toBe("draft");
    expect(outputLabel({ resolution: null, quality: "preview", fps: null })).toBe("preview");
  });
});
