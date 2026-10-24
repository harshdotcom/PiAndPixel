import { describe, expect, it } from "vitest";
import { shortOs } from "./agentInfo";

describe("shortOs", () => {
  it("keeps the system name and the architecture", () => {
    expect(shortOs("Linux-7.0.0-38-generic-x86_64-with-glibc2.43")).toBe("Linux x86_64");
    expect(shortOs("macOS-14.5-arm64-arm-64bit")).toBe("macOS arm64");
  });

  it("returns a plain name unchanged", () => {
    expect(shortOs("Linux")).toBe("Linux");
  });
});
