import { describe, expect, it } from "vitest";
import { draftComposition, draftFrom, isDirty, moveClipTo, rebase } from "./compositionDraft";

const composition = { title: "Cut", clips: [{ scene: "a.py:A", params: {} }, { scene: "b.py:B", params: { n: 2 } }] };

describe("composition drafts", () => {
  it("is clean when opened and dirty after an edit, clean again when undone", () => {
    const draft = draftFrom(composition, "e1");
    expect(isDirty(draft)).toBe(false);
    expect(isDirty({ ...draft, title: "Other" })).toBe(true);
    expect(isDirty({ ...draft, title: "Cut" })).toBe(false);
  });

  it("turns back into the composition to save, or null while params are invalid", () => {
    const draft = draftFrom(composition, "e1");
    expect(draftComposition(draft)).toEqual(composition);
    const broken = { ...draft, clips: draft.clips.map((c) => ({ ...c, paramsText: "{" })) };
    expect(draftComposition(broken)).toBeNull();
  });

  it("rebases only drafts made from the etag our save replaced", () => {
    const a = draftFrom(composition, "e1");
    const b = draftFrom(composition, "e0");
    const rebased = rebase({ a, b }, "e1", "e2");
    expect(rebased.a!.baseEtag).toBe("e2");
    expect(rebased.b!.baseEtag).toBe("e0");
  });
});

describe("moveClipTo", () => {
  it("moves a clip to a new index and ignores out-of-range moves", () => {
    expect(moveClipTo(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveClipTo(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    const same = ["a", "b"];
    expect(moveClipTo(same, 0, 5)).toBe(same);
    expect(moveClipTo(same, 1, 1)).toBe(same);
  });
});
