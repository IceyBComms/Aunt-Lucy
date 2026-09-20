/**
 * The trusted invite's "Yes, I'll help with this" — sent EXACTLY as the button
 * sends it.
 *
 * Every rehearsal from July to September sent this claim with a JSON body. The
 * real button never has, and on Express 5 that difference was a crash that
 * failed every invited helper for eight weeks (found 16 Sep 2026). So the claim
 * here is not a hand-written request: it goes through rally's own claimInvite
 * (src/lib/inviteClaimRequest.ts) and rally's own apiFetch. The only thing
 * swapped is where fetch points — method, headers and body are whatever the
 * page would send.
 *
 * The server side is the same wiring app.ts uses (applyBodyParsers, the router,
 * createErrorHandler), over real HTTP, against an in-memory store.
 *
 * Every refusal test is an ABSENCE claim ("nothing was written"), which a request
 * that never reached the route would pass for free — so each one also checks a
 * reply only that branch produces.
 *
 * WHAT THIS DOES NOT CATCH, STATED PLAINLY: the store is in-memory. The Drizzle
 * store in routes/invites.ts (its `is_claimed = false` guard, the relation load)
 * is not exercised here.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  createInviteClaimRouter,
  type InviteClaimPage,
  type InviteClaimRecord,
  type InviteClaimSlot,
  type InviteClaimStore,
  type InviteClaimedEvent,
} from "./inviteClaim";
import { applyBodyParsers, createErrorHandler } from "./requestHygiene";

const RALLY = path.resolve(__dirname, "../../../rally/src");
const TOKEN = "t".repeat(48);

type ClaimInvite = (token: string) => Promise<{ cancelToken?: string; calendarUrl?: string | null }>;
let claimInvite: ClaimInvite;

let page: InviteClaimPage;
let slot: InviteClaimSlot & { claimedByName: string | null; claimedNameVisible: boolean | null };
let invite: Omit<InviteClaimRecord, "slot" | "page">;
let writes: string[];
let claimedEvents: InviteClaimedEvent[];
let errors: object[];
let sent: { url: string; init: RequestInit | undefined }[];

const store: InviteClaimStore = {
  async findByToken(token) {
    if (token !== TOKEN) return null;
    return { ...invite, slot: { ...slot }, page: { ...page } };
  },
  async claimSlot(slotId, fields) {
    writes.push(`claimSlot:${slotId}`);
    if (slotId !== slot.id || slot.isClaimed) return null;
    Object.assign(slot, { isClaimed: true, ...fields });
    return { ...slot };
  },
  async markInviteClaimed(inviteId, now) {
    writes.push(`markInviteClaimed:${inviteId}`);
    invite.claimedAt = now;
  },
};

let server: Server;
let origin: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  // Loaded by path, at run time: rally's files are not part of this package's
  // TypeScript project, and `import.meta.env.BASE_URL` in rally's api.ts is
  // supplied by Vitest ("/"), exactly as Vite supplies it in the browser.
  ({ claimInvite } = (await import(path.join(RALLY, "lib/inviteClaimRequest.ts"))) as {
    claimInvite: ClaimInvite;
  });

  const app = express();
  applyBodyParsers(app);
  app.use(
    "/api",
    createInviteClaimRouter({
      store,
      onClaimed: (event) => claimedEvents.push(event),
      log: { info: () => {}, warn: () => {} },
    }),
  );
  app.use(createErrorHandler({ error: (obj) => errors.push(obj) }));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  page = {
    id: "page-1",
    status: "active",
    origin: "crisis_free",
    recipientName: "Sam Example",
    location: "Northcote",
    situationDescription: "Home with a newborn",
    slug: "s1ug",
  };
  slot = {
    id: "slot-1",
    isClaimed: false,
    slotType: "school_pickup",
    customLabel: null,
    slotDate: "2026-09-20",
    slotTime: "15:15",
    liftWaitMode: null,
    notes: "Gate B",
    dietaryNotes: null,
    headcount: null,
    claimedByName: null,
    claimedNameVisible: null,
  };
  invite = { id: "invite-1", name: "Jo", mobile: "+61400000000", email: null, claimedAt: null };
  writes = [];
  claimedEvents = [];
  errors = [];
  sent = [];

  // Point the page's own relative fetch at this server, and record what it sent.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    sent.push({ url, init });
    return realFetch(`${origin}${url}`, init);
  });
});

afterEach(() => vi.unstubAllGlobals());

/**
 * A live page as each of the three paths leaves it. Liveness must not depend on
 * which door the page came through — Kate's failing page on 16 Sep was a CRISIS
 * page, so crisis goes first. The statuses are the ones each path actually
 * writes; "go-live writes" below reads that from source.
 */
const LIVE_PAGES_BY_PATH = [
  { origin: "crisis_free", how: "crisis page, published via /organiser/pages/:id/publish" },
  { origin: "organiser", how: "organiser page, published via /organiser/pages/:id/publish" },
  { origin: "gift", how: "gift activated now (gifts.ts)" },
  { origin: null, how: "older gift page (origin null), switched on by the scheduled activation cron" },
] as const;

describe("the claim, sent as the button sends it", () => {
  it("really is bodiless — the request under test is the real one", async () => {
    await claimInvite(TOKEN);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(`/api/invite/${TOKEN}/claim`);
    expect(sent[0].init?.method).toBe("POST");
    expect(sent[0].init?.body).toBeUndefined();
    expect(new Headers(sent[0].init?.headers).has("Content-Type")).toBe(false);
  });

  it.each(LIVE_PAGES_BY_PATH)(
    "on a live $how, CLAIMS the slot for that helper — the positive control",
    async ({ origin: pageOrigin }) => {
    page.origin = pageOrigin;
    const res = await claimInvite(TOKEN);

    expect(res.cancelToken).toMatch(/^[0-9a-f]{48}$/);
    expect(slot.isClaimed).toBe(true);
    expect(slot.claimedByName).toBe("Jo");
    // Nothing asked, so hidden from other helpers — as before this fix.
    expect(slot.claimedNameVisible).toBe(false);
    expect(invite.claimedAt).toBeInstanceOf(Date);
    expect(writes).toEqual(["claimSlot:slot-1", "markInviteClaimed:invite-1"]);
    expect(claimedEvents).toHaveLength(1);
    expect(claimedEvents[0].page.origin).toBe(pageOrigin);
    expect(errors).toEqual([]);
    },
  );
});

describe("a page that isn't live cannot be claimed", () => {
  // ⚠️ "closed" LEFT THIS LIST ON 20 SEPTEMBER 2026 (bug #090) and has its own
  // block below. It used to be refused with the not-live wording — "this link
  // will work as soon as it's switched on" — which is true of a draft and a lie
  // about a page that has stopped.
  for (const status of ["draft", "pending_approval"]) {
    it(`${status}: refused with 409 page_not_live, nothing written, nothing sent`, async () => {
      page.status = status;

      const err = (await claimInvite(TOKEN).catch((e: unknown) => e)) as {
        status?: number;
        reason?: string;
      };

      // Proof the request reached the route: only the not-live branch says this.
      expect(err).toMatchObject({
        status: 409,
        reason: "page_not_live",
        // Kate's approved copy, 16 Sep 2026 — word-for-word, first name only.
        message:
          "Sam's page is still being set up. Hang on to this message — this link will work as soon as it's switched on.",
      });
      expect(slot.isClaimed).toBe(false);
      expect(slot.claimedByName).toBeNull();
      expect(invite.claimedAt).toBeNull();
      expect(writes).toEqual([]);
      expect(claimedEvents).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  it("closed: refused as CLOSED, never as not-yet-live and never as broken", async () => {
    // Bug #090. An invitation to a closed page reads as closed: it does not
    // promise the link will work later, it does not say the link is invalid or
    // expired, and — ruling 6 — it says nothing about why and does not name the
    // recipient.
    page.status = "closed";

    const err = (await claimInvite(TOKEN).catch((e: unknown) => e)) as {
      status?: number;
      reason?: string;
      message?: string;
    };

    expect(err).toMatchObject({ status: 409, reason: "page_closed" });
    expect(err.message).not.toMatch(/switched on|still being set up/);
    expect(err.message).not.toMatch(/invalid|expired/i);
    expect(err.message).not.toMatch(/Sam/);
    // Nothing written, nothing sent — the same floor as the not-live branch.
    expect(slot.isClaimed).toBe(false);
    expect(slot.claimedByName).toBeNull();
    expect(invite.claimedAt).toBeNull();
    expect(writes).toEqual([]);
    expect(claimedEvents).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("a page row that has gone is refused the same way", async () => {
    const original = store.findByToken;
    store.findByToken = async (token) => {
      const record = await original(token);
      return record && { ...record, page: null };
    };
    try {
      const err = await claimInvite(TOKEN).catch((e: unknown) => e);
      expect(err).toMatchObject({ status: 409, reason: "page_not_live" });
      expect(writes).toEqual([]);
      expect(claimedEvents).toEqual([]);
    } finally {
      store.findByToken = original;
    }
  });
});

describe("go-live writes — every path's live status is the one the claim accepts", () => {
  const routes = path.resolve(__dirname, "../routes");
  const read = (f: string) => fs.readFileSync(path.join(routes, f), "utf8");

  const SETS_ACTIVE = '.set({ status: "active" })';

  it("publish (organiser AND crisis pages) sets active", () => {
    expect(read("organiser.ts")).toContain(SETS_ACTIVE);
  });

  it("crisis setup hands over to that same publish", () => {
    const crisisPage = fs.readFileSync(path.join(RALLY, "pages/HardestTimes.tsx"), "utf8");
    expect(crisisPage).toContain("setLocation(`/organise/create/${res.pageId}/slots`)");
    const publish = fs.readFileSync(path.join(RALLY, "pages/OrganisePublish.tsx"), "utf8");
    expect(publish).toContain("`/organiser/pages/${pageId}/publish`");
  });

  it("gift activation sets active (or draft, for a scheduled go-live)", () => {
    expect(read("gifts.ts")).toContain('status: scheduledActivateAt ? "draft" : "active"');
  });

  it("the scheduled activation cron flips draft to active", () => {
    expect(read("internal.ts")).toContain(SETS_ACTIVE);
  });

  it("and active is the one live status", async () => {
    const { LIVE_PAGE_STATUS } = await import("./inviteSendRule");
    expect(LIVE_PAGE_STATUS).toBe("active");
  });
});

describe("looking at the invite", () => {
  const look = async () => {
    const res = await realFetch(`${origin}/api/invite/${TOKEN}`);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it("a live page shows the task — positive control", async () => {
    const { status, body } = await look();
    expect(status).toBe(200);
    expect(body.pageLive).toBe(true);
    expect(body.slot).toMatchObject({ id: "slot-1", notes: "Gate B" });
  });

  it("a draft shows 'Not live yet' and gives away nothing about the task", async () => {
    page.status = "draft";
    const { status, body } = await look();
    expect(status).toBe(200);
    expect(body).toEqual({ pageLive: false, helperName: "Jo", page: { recipientName: "Sam Example" } });
  });

  it("a closed page's invite reads as a dead link", async () => {
    page.status = "closed";
    const { status } = await look();
    expect(status).toBe(404);
  });
});

describe("the invite page uses the shared request, not its own copy", () => {
  const source = fs.readFileSync(path.join(RALLY, "pages/InviteClaim.tsx"), "utf8");

  it("calls claimInvite", () => {
    expect(source).toMatch(/await claimInvite\(token\)/);
  });

  it("does not build the claim request itself", () => {
    expect(source).not.toMatch(/\/claim`/);
  });
});
