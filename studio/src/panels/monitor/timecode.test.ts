import { describe, expect, it } from "vitest";
import { formatDuration, formatTimecode, frameAt } from "./timecode";

describe("formatTimecode", () => {
  it.each([
    [0, 15, "00:00:00:00"],
    [0.2, 15, "00:00:00:03"],
    [1, 15, "00:00:01:00"],
    [12 + 5 / 30, 30, "00:00:12:05"],
    [40 + 7 / 24, 24, "00:00:40:07"],
    [3725.5, 60, "01:02:05:30"],
  ])("%f s at %i fps is %s", (seconds, fps, expected) => {
    expect(formatTimecode(seconds, fps)).toBe(expected);
  });

  it("never shows a frame number at or above the frame rate", () => {
    expect(formatTimecode(0.99999, 15)).toBe("00:00:00:14");
  });

  it("treats invalid input as zero", () => {
    expect(formatTimecode(Number.NaN, 30)).toBe("00:00:00:00");
    expect(formatTimecode(-3, 30)).toBe("00:00:00:00");
    expect(formatTimecode(2, 0)).toBe("00:00:02:00");
  });
});

describe("frameAt", () => {
  it("floors to the frame shown at that time", () => {
    expect(frameAt(1.5, 15)).toBe(22);
    expect(frameAt(0.2, 15)).toBe(3);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [4.9, "0:04"],
    [65, "1:05"],
    [3723, "1:02:03"],
  ])("%f s is %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
