import { describe, expect, it } from "vitest";
import type { FileEntry } from "../api/types";
import { buildTree } from "./fileTree";

const file = (path: string): FileEntry => ({ path, type: "file", size: 1 });
const dir = (path: string): FileEntry => ({ path, type: "dir", size: null });

describe("buildTree", () => {
  it("nests files under their folders, folders first then by name", () => {
    const tree = buildTree([
      file("README.md"),
      file("pnp.yaml"),
      dir("scenes"),
      file("scenes/b.py"),
      dir("scenes/util"),
      file("scenes/util/geo.py"),
      file("scenes/a.py"),
    ]);

    expect(tree.map((n) => n.path)).toEqual(["scenes", "pnp.yaml", "README.md"]);
    const scenes = tree[0]!;
    expect(scenes.type).toBe("dir");
    expect(scenes.children.map((n) => n.name)).toEqual(["util", "a.py", "b.py"]);
    expect(scenes.children[0]!.children).toEqual([
      { name: "geo.py", path: "scenes/util/geo.py", type: "file", children: [] },
    ]);
  });

  it("keeps empty folders and creates folders missing from the list", () => {
    const tree = buildTree([dir("empty"), file("x/y/z.py")]);
    expect(tree.map((n) => n.path)).toEqual(["empty", "x"]);
    expect(tree[1]!.children[0]!.path).toBe("x/y");
    expect(tree[1]!.children[0]!.children[0]!.path).toBe("x/y/z.py");
  });

  it("returns an empty list for an empty project", () => {
    expect(buildTree([])).toEqual([]);
  });
});
