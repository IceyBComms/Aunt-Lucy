/**
 * The REAL apiFetch carries the server's refusal `reason` on ApiError.
 *
 * The render tests swap `@/lib/api` for a fake, so they cannot notice if the
 * real one stops passing `reason` through — and OrganisePublish decides whether
 * to show the page's link beneath "This page is already live." from that
 * reason, never from the message. This is the test that would notice.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";

function respondWith(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ status, ok: status >= 200 && status < 300, json: async () => body })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch refusals", () => {
  it("carries the server's reason on the ApiError", async () => {
    respondWith(409, { error: "This page is already live.", reason: "not_draft" });
    const err = await apiFetch("/organiser/pages/p/publish", { method: "POST" }).catch((e: ApiError) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, reason: "not_draft", message: "This page is already live." });
  });

  it("leaves reason undefined when the server sends none — positive control for the shape", async () => {
    respondWith(404, { error: "Page not found." });
    const err = await apiFetch<never>("/organiser/pages/p").catch((e: ApiError) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.reason).toBeUndefined();
  });
});
