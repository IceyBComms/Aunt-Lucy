/**
 * When a page goes live, its invitations go (#113) — the helper every go-live
 * path calls. Its wiring into each path is read from source in
 * inviteSendRule.test.ts; here, what it does when called.
 */
import { describe, expect, it, vi } from "vitest";
import { releaseHeldInvitesOnGoLive } from "./goLiveInvites";

describe("releaseHeldInvitesOnGoLive", () => {
  it("sends for exactly the page that went live — the positive control", async () => {
    const send = vi.fn(async () => ({ claimed: 2 }));
    await releaseHeldInvitesOnGoLive("page-A", "scheduled_activation", send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ pageId: "page-A" });
  });

  it("never throws when the send rejects — the page is live whatever happens", async () => {
    const send = vi.fn(() => Promise.reject(new Error("Neon dropped the connection")));
    await expect(releaseHeldInvitesOnGoLive("page-A", "publish", send)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never throws when the send throws synchronously either", async () => {
    const send = vi.fn((): Promise<{ claimed: number }> => {
      throw new Error("renderer blew up before returning a promise");
    });
    await expect(releaseHeldInvitesOnGoLive("page-A", "publish", send)).resolves.toBeUndefined();
  });

  it("one page's failure does not stop the next page in a scheduled run", async () => {
    const sentFor: string[] = [];
    const send = vi.fn(async ({ pageId }: { pageId: string }) => {
      if (pageId === "page-1") throw new Error("boom");
      sentFor.push(pageId);
      return { claimed: 1 };
    });
    for (const id of ["page-1", "page-2"]) await releaseHeldInvitesOnGoLive(id, "scheduled_activation", send);
    expect(sentFor).toEqual(["page-2"]);
  });
});
