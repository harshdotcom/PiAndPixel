import { describe, expect, it } from "vitest";
import { draftClip, moveClip, nameProblem, parseParams, toComposition } from "./clips";

describe("moveClip", () => {
  const clips = ["a", "b", "c"];

  it("moves a clip up or down by one", () => {
    expect(moveClip(clips, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveClip(clips, 1, 1)).toEqual(["a", "c", "b"]);
    expect(clips).toEqual(["a", "b", "c"]);
  });

  it("leaves the list alone for moves past either end", () => {
    expect(moveClip(clips, 0, -1)).toBe(clips);
    expect(moveClip(clips, 2, 1)).toBe(clips);
  });
});

describe("parseParams", () => {
  it("accepts a JSON object", () => {
    expect(parseParams('{"color": "BLUE", "n": 3}')).toEqual({ params: { color: "BLUE", n: 3 } });
  });

  it.each(["{", "", "nul"])("reports invalid JSON %j", (text) => {
    expect(parseParams(text)).toEqual({ error: expect.stringMatching(/^Invalid JSON/) });
  });

  it.each(["[]", "null", "3", '"x"'])("refuses %s, which is not an object", (text) => {
    expect(parseParams(text)).toEqual({ error: expect.stringMatching(/must be a JSON object/) });
  });
});

describe("nameProblem", () => {
  it("accepts names the Agent accepts", () => {
    expect(nameProblem("main", [])).toBeNull();
    expect(nameProblem("A1_b-2", [])).toBeNull();
    expect(nameProblem("x".repeat(64), [])).toBeNull();
  });

  it.each(["-main", "_x", "has space", "dot.name", "x".repeat(65)])("refuses %j", (name) => {
    expect(nameProblem(name, [])).toMatch(/letters, digits/);
  });

  it("refuses an existing name", () => {
    expect(nameProblem("main", ["main"])).toBe('"main" already exists.');
  });
});

describe("toComposition", () => {
  it("builds the composition with parsed params and a null empty title", () => {
    const clips = [draftClip("a.py:A", { n: 1 }), draftClip("b.py:B")];
    expect(toComposition("  ", clips)).toEqual({
      title: null,
      clips: [
        { scene: "a.py:A", params: { n: 1 } },
        { scene: "b.py:B", params: {} },
      ],
    });
  });

  it("is null with no clips or any invalid params", () => {
    expect(toComposition("T", [])).toBeNull();
    expect(toComposition("T", [{ ...draftClip("a.py:A"), paramsText: "{" }])).toBeNull();
  });

  it("gives every draft clip its own id", () => {
    expect(draftClip("a.py:A").id).not.toBe(draftClip("a.py:A").id);
  });
});
