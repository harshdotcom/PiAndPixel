import { describe, expect, it } from "vitest";
import { joinFoldedPaths, parseLogLine, toProjectPath } from "./traceback";

const JOB = "a".repeat(32);
const REV = "b".repeat(64);
// Every project file the tests reference; parseLogLine links only these.
const FILES = new Set(["scenes/intro.py", "proof.py", "scenes/a.py", "scenes/b.py", "p.py", "scenes/proof.py"]);

describe("toProjectPath", () => {
  it.each([
    [`/home/u/ws/demo/.pnp/jobs/${JOB}/attempt-2/src/scenes/intro.py`, "scenes/intro.py"],
    [`/home/u/ws/demo/.pnp/jobs/${JOB}/src/scenes/intro.py`, "scenes/intro.py"],
    [`/home/u/ws/demo/.pnp/revisions/${REV}/src/proof.py`, "proof.py"],
    [`C:\\ws\\demo\\.pnp\\jobs\\${JOB}\\attempt-1\\src\\scenes\\a.py`, "scenes/a.py"],
    ["scenes/intro.py", "scenes/intro.py"],
    ["intro.py", "intro.py"],
  ])("maps %s to %s", (raw, expected) => {
    expect(toProjectPath(raw)).toBe(expected);
  });

  it.each([
    "/usr/lib/python3.12/site-packages/manim/scene/scene.py",
    "<string>",
    "../outside.py",
    "scenes/../../etc/passwd.py",
    `/ws/demo/.pnp/jobs/${JOB}/attempt-1/src/../x.py`,
    `/ws/demo/.pnp/jobs/${"a".repeat(31)}/src/x.py`,
    `/ws/demo/.pnp/revisions/${REV}/x.py`,
  ])("rejects %s", (raw) => {
    expect(toProjectPath(raw)).toBeNull();
  });
});

describe("parseLogLine", () => {
  it("links a Python traceback frame inside the job scratch copy", () => {
    const line = `  File "/ws/demo/.pnp/jobs/${JOB}/attempt-1/src/scenes/intro.py", line 12, in construct`;
    expect(parseLogLine(line, FILES)).toEqual([
      { text: "  " },
      {
        text: `File "/ws/demo/.pnp/jobs/${JOB}/attempt-1/src/scenes/intro.py", line 12`,
        path: "scenes/intro.py",
        line: 12,
      },
      { text: ", in construct" },
    ]);
  });

  it("links a rich-style path:line reference", () => {
    const line = `│ /ws/demo/.pnp/revisions/${REV}/src/proof.py:7 in construct │`;
    const segments = parseLogLine(line, FILES);
    expect(segments).toHaveLength(3);
    expect(segments[1]).toEqual({
      text: `/ws/demo/.pnp/revisions/${REV}/src/proof.py:7`,
      path: "proof.py",
      line: 7,
    });
    expect(segments.map((s) => s.text).join("")).toBe(line);
  });

  it("links relative paths and keeps several links on one line", () => {
    const segments = parseLogLine("scenes/a.py:3 calls scenes/b.py:40", FILES);
    expect(segments.filter((s) => "path" in s)).toEqual([
      { text: "scenes/a.py:3", path: "scenes/a.py", line: 3 },
      { text: "scenes/b.py:40", path: "scenes/b.py", line: 40 },
    ]);
  });

  it("does not link the bare file names in Manim's log location column", () => {
    const line = "[10/24/26 10:00:00] INFO  Animation 0 : Partial movie file written  scene_file_writer.py:173";
    expect(parseLogLine(line, FILES)).toEqual([{ text: line }]);
    expect(parseLogLine("cairo_renderer.py:89", FILES)).toEqual([{ text: "cairo_renderer.py:89" }]);
    expect(parseLogLine('  File "p.py", line 4, in construct', FILES)).toContainEqual(
      expect.objectContaining({ path: "p.py", line: 4 }),
    );
  });

  it("links only references to files that exist in the project", () => {
    const line = `│ /ws/demo/.pnp/jobs/${JOB}/attempt-1/src/scenes/gone.py:5 in construct │`;
    expect(parseLogLine(line, FILES)).toEqual([{ text: line }]);
    expect(parseLogLine('  File "missing.py", line 2, in f', FILES)).toEqual([
      { text: '  File "missing.py", line 2, in f' },
    ]);
    expect(parseLogLine("scenes/a.py:3", new Set())).toEqual([{ text: "scenes/a.py:3" }]);
  });

  it("does not link Manim's log column even when a project file has the same name", () => {
    const line = "INFO  Rendered Proof  scene.py:241";
    expect(parseLogLine(line, new Set(["scene.py"]))).toEqual([{ text: line }]);
  });

  it("keeps paths outside the project as plain text", () => {
    const line = '  File "/usr/lib/python3.12/site-packages/manim/scene/scene.py", line 260, in render';
    expect(parseLogLine(line, FILES)).toEqual([{ text: line }]);
    expect(parseLogLine('  File "<string>", line 1', FILES)).toEqual([{ text: '  File "<string>", line 1' }]);
  });

  it("returns one plain segment for ordinary and empty lines", () => {
    expect(parseLogLine("Animation 0 : Partial movie file written", FILES)).toEqual([
      { text: "Animation 0 : Partial movie file written" },
    ]);
    expect(parseLogLine("", FILES)).toEqual([{ text: "" }]);
  });
});

describe("joinFoldedPaths", () => {
  const head = `│ /ws/demo/.pnp/jobs/${JOB}/attempt-1 │`;
  const tail = "│ /src/scenes/proof.py:37 in construct    │";

  it("joins a path rich folded across box lines into one link", () => {
    const [joined] = joinFoldedPaths([head, tail, "│   34 │ code │"]);
    expect(joined).toBe(`│ /ws/demo/.pnp/jobs/${JOB}/attempt-1/src/scenes/proof.py:37 in construct │`);
    expect(parseLogLine(joined ?? "", FILES)).toContainEqual(
      expect.objectContaining({ path: "scenes/proof.py", line: 37 }),
    );
  });

  it("joins a fold that falls inside the line number", () => {
    const lines = [`│ /ws/ab/.pnp/jobs/${JOB}/attempt-1/src/p.py:3 │`, "│ 7 in construct │", "│ x │"];
    const [joined, rest] = joinFoldedPaths(lines);
    expect(joined).toBe(`│ /ws/ab/.pnp/jobs/${JOB}/attempt-1/src/p.py:37 in construct │`);
    expect(rest).toBe("│ x │");
    expect(parseLogLine(joined ?? "", FILES)).toContainEqual(expect.objectContaining({ path: "p.py", line: 37 }));
  });

  it("leaves unfolded and unrelated lines alone", () => {
    const lines = ["│ /usr/lib/x.py:3 in f │", "│ construct │", "│ /tmp/only │", "│      │", "plain"];
    expect(joinFoldedPaths(lines)).toEqual(lines);
  });

  // Rich folds at a fixed width, so the cut can land anywhere in the path or line number.
  const ref = `/ws/demo/.pnp/jobs/${JOB}/attempt-1/src/scenes/proof.py:1234`;
  const numberStart = ref.indexOf(":") + 1;
  it.each(Array.from({ length: ref.length - numberStart + 5 }, (_, k) => numberStart - 5 + k))(
    "joins a fold at offset %i and keeps the whole line number",
    (cut) => {
      const lines = [`│ ${ref.slice(0, cut)} │`, `│ ${ref.slice(cut)} in construct │`, "│   34 │ code │"];
      const out = joinFoldedPaths(lines);
      expect(out[0]).toBe(`│ ${ref} in construct │`);
      expect(out.slice(1)).toEqual(["│   34 │ code │"]);
      expect(parseLogLine(out[0] ?? "", FILES)).toContainEqual(
        expect.objectContaining({ path: "scenes/proof.py", line: 1234 }),
      );
    },
  );

  it.each([1, 2])("joins a line number folded over three box lines (first cut after digit %i)", (d) => {
    const at = ref.length - 4 + d;
    const lines = [`│ ${ref.slice(0, at)} │`, `│ ${ref.slice(at, at + 1)} │`, `│ ${ref.slice(at + 1)} in f │`];
    expect(joinFoldedPaths(lines)).toEqual([`│ ${ref} in f │`]);
  });
});
