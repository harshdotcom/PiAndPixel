import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, TOKEN_KEY, apiFetch, captureTokenFromHash, onUnauthorized } from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("captureTokenFromHash", () => {
  it("moves the token from the hash into sessionStorage and strips the hash", () => {
    window.history.replaceState(null, "", "/studio?x=1#token=abc-123_XY");

    expect(captureTokenFromHash()).toBe("abc-123_XY");
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe("abc-123_XY");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname + window.location.search).toBe("/studio?x=1");
  });

  it("falls back to the stored token when the hash has none", () => {
    sessionStorage.setItem(TOKEN_KEY, "stored");
    window.history.replaceState(null, "", "/#other=1");

    expect(captureTokenFromHash()).toBe("stored");
    expect(window.location.hash).toBe("#other=1");
  });

  it("returns null when there is no token anywhere", () => {
    expect(captureTokenFromHash()).toBeNull();
  });
});

describe("apiFetch", () => {
  it("sends the Bearer token", async () => {
    sessionStorage.setItem(TOKEN_KEY, "secret");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/v1/agent")).resolves.toEqual({ ok: true });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer secret");
  });

  it("on 401 clears the token, notifies listeners and throws ApiError", async () => {
    sessionStorage.setItem(TOKEN_KEY, "wrong");
    const body = { error: { code: "unauthorized", message: "Bad token", details: null } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, body)));
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);

    const error = await apiFetch("/api/v1/projects").catch((e: unknown) => e);
    unsubscribe();

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "unauthorized", message: "Bad token" });
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("maps the agent error body and keeps the token on other errors", async () => {
    sessionStorage.setItem(TOKEN_KEY, "secret");
    const body = { error: { code: "conflict", message: "Project exists", details: null } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(409, body)));

    await expect(apiFetch("/api/v1/projects")).rejects.toMatchObject({
      status: 409,
      code: "conflict",
    });
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe("secret");
  });

  it("adds the first validation detail to the message", async () => {
    const details = [{ loc: ["body", "quality"], msg: "Input should be 'draft'", type: "enum" }];
    const body = { error: { code: "validation_error", message: "Request validation failed", details } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, body)));

    await expect(apiFetch("/api/v1/projects/p/renders")).rejects.toMatchObject({
      status: 422,
      message: "Request validation failed: quality: Input should be 'draft'",
      details,
    });
  });

  it("reports an unreachable agent as a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(apiFetch("/api/v1/agent")).rejects.toMatchObject({ code: "network_error" });
  });
});
