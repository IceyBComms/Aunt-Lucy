/**
 * Nothing leaves a draft (Kate's ruling, 14 Sep 2026).
 *
 * P2: "held" is an absence, and a rule that holds EVERYTHING passes every
 * hold test perfectly while no invite ever goes out again. So the first block
 * is the positive control — a live page with a due invite really does send —
 * and every refusal below is only meaningful beside it.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { canSendInvite, SETTLED_PAGE_STATUSES, LIVE_PAGE_STATUS } from "./inviteSendRule";

const NOW = new Date("2026-09-14T09:00:00Z");
const due = { scheduledFor: new Date("2026-09-14T08:59:00Z"), contactOptedOut: false };

describe("what may send — the positive control", () => {
  it("sends a due invite on a live page", () => {
    expect(canSendInvite({ status: "active" }, due, NOW)).toEqual({ send: true });
  });

  it("sends an invite due at exactly this instant (step 2 inserts with now)", () => {
    expect(canSendInvite({ status: "active" }, { scheduledFor: NOW, contactOptedOut: false }, NOW)).toEqual({
      send: true,
    });
  });
});

describe("what is HELD — not yet, not never", () => {
  it("holds an invite on a DRAFT page — the 14 Sep bug", () => {
    expect(canSendInvite({ status: "draft" }, due, NOW)).toEqual({
      send: false,
      outcome: "hold",
      reason: "page_not_live",
    });
  });

  it("holds on pending_approval — not live either", () => {
    expect(canSendInvite({ status: "pending_approval" }, due, NOW)).toMatchObject({
      outcome: "hold",
      reason: "page_not_live",
    });
  });

  it("holds on a status nobody has invented yet — fails closed, not open", () => {
    expect(canSendInvite({ status: "scheduled" }, due, NOW)).toMatchObject({ outcome: "hold" });
  });

  it("holds a scheduled wave on a live page until it is due", () => {
    const later = { scheduledFor: new Date("2026-09-14T09:01:00Z"), contactOptedOut: false };
    expect(canSendInvite({ status: "active" }, later, NOW)).toMatchObject({
      outcome: "hold",
      reason: "not_due",
    });
  });
});

describe("what is CANCELLED — the dispatcher's existing refusals, unchanged", () => {
  it("cancels on a closed page", () => {
    expect(canSendInvite({ status: "closed" }, due, NOW)).toMatchObject({ outcome: "cancel", reason: "page_closed" });
  });

  it("cancels when the page is gone", () => {
    expect(canSendInvite(null, due, NOW)).toMatchObject({ outcome: "cancel", reason: "page_missing" });
    expect(canSendInvite(undefined, due, NOW)).toMatchObject({ outcome: "cancel", reason: "page_missing" });
  });

  it("cancels when the contact has opted out, even on a live page", () => {
    expect(canSendInvite({ status: "active" }, { ...due, contactOptedOut: true }, NOW)).toMatchObject({
      outcome: "cancel",
      reason: "contact_opted_out",
    });
  });

  it("never SENDS to an opted-out contact on a draft either", () => {
    expect(canSendInvite({ status: "draft" }, { ...due, contactOptedOut: true }, NOW).send).toBe(false);
  });
});

describe("every page status in the schema is classified", () => {
  // Read the enum from the schema source rather than importing @workspace/db,
  // which would open a pool. A status added to page_status must land on one
  // side of this line on purpose.
  const schema = fs.readFileSync(
    path.resolve(__dirname, "../../../../lib/db/src/schema/supportPages.ts"),
    "utf8",
  );
  const block = schema.match(/pgEnum\("page_status",\s*\[([^\]]*)\]/);
  const statuses = block ? [...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]) : [];

  it("finds the enum (or this test is reading the wrong shape)", () => {
    expect(statuses).toContain("draft");
    expect(statuses).toContain("active");
    expect(statuses).toContain("closed");
  });

  it("only ONE status sends, and it is active", () => {
    const sending = statuses.filter((s) => canSendInvite({ status: s }, due, NOW).send);
    expect(sending).toEqual([LIVE_PAGE_STATUS]);
  });

  it("the dispatcher claims exactly the statuses with a final answer — none of them hold", () => {
    for (const s of statuses) {
      const holds = canSendInvite({ status: s }, due, NOW);
      const isHold = !holds.send && holds.outcome === "hold";
      expect({ status: s, claimed: (SETTLED_PAGE_STATUSES as readonly string[]).includes(s) }).toEqual({
        status: s,
        claimed: !isHold,
      });
    }
  });
});

/**
 * P5: a pure rule the routes forgot to call guards nothing. Read the source,
 * the established shape here (pagePublish.test.ts, routeFooterCoverage).
 */
describe("every place an invite goes on the wire decides through the rule", () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf8");
  const slice = (src: string, from: string, to: string) => {
    const start = src.indexOf(from);
    return start < 0 ? "" : src.slice(start, src.indexOf(to, start + from.length));
  };

  it("step 2's route (organiser invites) sends only from inside placeInvite", () => {
    const route = slice(
      read("../routes/invites.ts"),
      '"/organiser/pages/:pageId/slots/:slotId/invites"',
      "\n);",
    );
    expect(route).toContain("placeInvite(");
    const guardAt = route.indexOf("placeInvite(");
    expect(route.indexOf("sendSms(")).toBeGreaterThan(guardAt);
    expect(route.indexOf("sendHelperInviteEmail(")).toBeGreaterThan(guardAt);
    // The route no longer stamps an outcome on its own, outside the guard.
    expect(route.slice(0, guardAt)).not.toContain('status: "sent"');
  });

  it("/manage Send now sends only from inside placeInvite", () => {
    const fn = slice(read("../routes/manage.ts"), "async function dispatchOrQueue(", "\n}\n");
    expect(fn).toContain("placeInvite(");
    const guardAt = fn.indexOf("placeInvite(");
    expect(fn.indexOf("sendSms(")).toBeGreaterThan(guardAt);
    expect(fn.indexOf("sendHelperInviteEmail(")).toBeGreaterThan(guardAt);
  });

  it("the dispatcher claims only settled pages AND asks the rule before it sends", () => {
    const route = slice(read("../routes/internal.ts"), '"/internal/dispatch-invites"', "\n});");
    expect(route).toContain("inArray(supportPagesTable.status, [...SETTLED_PAGE_STATUSES])");
    expect(route).toContain(".innerJoin(supportPagesTable, eq(helperInvitesTable.pageId, supportPagesTable.id))");
    const guardAt = route.indexOf("canSendInvite(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(route.indexOf("sendSms(")).toBeGreaterThan(guardAt);
    expect(route.indexOf("sendHelperInviteEmail(")).toBeGreaterThan(guardAt);
  });

  it("no other route sends an invite at all (sweep; update this list on purpose)", () => {
    const routesDir = path.resolve(__dirname, "../routes");
    const senders = fs
      .readdirSync(routesDir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /sendHelperInviteEmail\(|trustedInviteSms\(|generalInviteSms\(|secondWaveSms\(/.test(read(`../routes/${f}`)))
      .sort();
    expect(senders).toEqual(["internal.ts", "invites.ts", "manage.ts"]);
  });
});
