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

  it("the shared queued send claims only settled pages AND asks the rule before it sends", () => {
    // The claim's SQL is read directly in inviteClaimQuery.test.ts; here, that
    // the sender uses that claim, and decides before it renders or sends.
    const fn = slice(read("./queuedInviteSender.ts"), "export async function sendQueuedInvites(", "\n}\n");
    const claimAt = fn.indexOf("claimQueuedInvites(");
    const guardAt = fn.indexOf("canSendInvite(");
    expect(claimAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(claimAt);
    expect(fn.indexOf("sendSms(")).toBeGreaterThan(guardAt);
    expect(fn.indexOf("sendHelperInviteEmail(")).toBeGreaterThan(guardAt);
    expect(read("./inviteClaimQuery.ts")).toContain("inArray(supportPagesTable.status, [...SETTLED_PAGE_STATUSES])");
  });

  it("the cron dispatcher sends through it, for every page", () => {
    const route = slice(read("../routes/internal.ts"), '"/internal/dispatch-invites"', "\n});");
    expect(route).toContain("cronAuthorised(req, res)");
    expect(route).toContain("await sendQueuedInvites();");
  });

  it("publishing sends that page's held invitations — only AFTER it is really live, and never blocks the answer", () => {
    // ✅ Kate's ruling, 14 Sep 2026: publishing sends that page's held
    // invitations straight away.
    const route = slice(
      read("../routes/organiser.ts"),
      'router.post("/organiser/pages/:pageId/publish"',
      "\n});",
    );
    const releaseAt = route.indexOf('releaseHeldInvitesOnGoLive(updated.id, "publish", sendQueuedInvites)');
    expect(releaseAt).toBeGreaterThan(-1);
    // After the guard, after the conditional draft → active flip, after the
    // refusal for a page that was not flipped, and after the response.
    expect(releaseAt).toBeGreaterThan(route.indexOf("canPublish("));
    expect(releaseAt).toBeGreaterThan(route.indexOf('.set({ status: "active" })'));
    expect(releaseAt).toBeGreaterThan(route.indexOf("if (!updated)"));
    expect(releaseAt).toBeGreaterThan(route.indexOf("res.json({ slug: updated.slug"));
    // Not awaited into the response. (The helper never throws — goLiveInvites.test.ts.)
    expect(route).toContain("void releaseHeldInvitesOnGoLive(updated.id");
  });

  it("SCHEDULED activation sends each page's held invitations too — after the response, only for pages this run flipped", () => {
    // ✅ Kate, 14 Sep 2026: when a page goes live its invitations go,
    // independent of what made it live. Bug #025's shape was two paths to the
    // same event with only one widened; this is the second path.
    const route = slice(
      read("../routes/internal.ts"),
      'router.post("/internal/activate-scheduled-pages"',
      "\n});",
    );
    const flipAt = route.indexOf('.set({ status: "active" })');
    const recordAt = route.indexOf("wentLive.push(page.id)");
    const replyAt = route.indexOf("res.json({ considered: due.length, activated })");
    const releaseAt = route.indexOf('releaseHeldInvitesOnGoLive(pageId, "scheduled_activation", sendQueuedInvites)');
    expect(flipAt).toBeGreaterThan(-1);
    // A page is recorded only when THIS run's conditional flip returned it.
    expect(route).toMatch(/if \(flipped\.length > 0\) \{[^}]*wentLive\.push\(page\.id\)/);
    expect(recordAt).toBeGreaterThan(flipAt);
    // Every recorded page is released, after the reply, not awaited into it.
    expect(releaseAt).toBeGreaterThan(replyAt);
    expect(route).toMatch(/void \(async \(\) => \{\s*for \(const pageId of wentLive\) \{\s*await releaseHeldInvitesOnGoLive\(pageId/);
  });

  it("a gift activated for right now — created already live — goes through the same helper", () => {
    const src = read("../routes/gifts.ts");
    const createAt = src.indexOf('status: scheduledActivateAt ? "draft" : "active"');
    const replyAt = src.indexOf("res.status(201).json({", createAt);
    const releaseAt = src.indexOf('releaseHeldInvitesOnGoLive(page.id, "gift_activation", sendQueuedInvites)', createAt);
    expect(createAt).toBeGreaterThan(-1);
    expect(releaseAt).toBeGreaterThan(replyAt);
    expect(replyAt).toBeGreaterThan(createAt);
  });

  it("EVERY write that makes a page live is followed by the release (sweep; update this list on purpose)", () => {
    // The class, not the instance. Any code in routes/ or lib/ that writes a
    // page `active` — an update or a page created live — must call
    // releaseHeldInvitesOnGoLive AFTER that write, in the same file. A new
    // go-live path that doesn't is this test failing, not eight days live.
    const goesLive = /\.set\(\{ status: "active" \}\)|\? "draft" : "active"/g;
    const writers: string[] = [];
    for (const dir of ["routes", "lib"]) {
      const abs = path.resolve(__dirname, "..", dir);
      for (const f of fs.readdirSync(abs)) {
        if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
        const src = fs.readFileSync(path.join(abs, f), "utf8");
        for (const m of src.matchAll(goesLive)) {
          writers.push(`${dir}/${f}`);
          const after = src.slice(m.index!);
          expect({ file: `${dir}/${f}`, releases: /releaseHeldInvitesOnGoLive\(/.test(after) }).toEqual({
            file: `${dir}/${f}`,
            releases: true,
          });
        }
      }
    }
    expect(writers.sort()).toEqual(["routes/gifts.ts", "routes/internal.ts", "routes/organiser.ts"]);
  });

  it("nothing else sends an invite at all (sweep over routes AND lib; update this list on purpose)", () => {
    const sendsAnInvite = /(?<!function )\b(sendHelperInviteEmail|trustedInviteSms|generalInviteSms|secondWaveSms)\(/;
    const senders: string[] = [];
    for (const dir of ["routes", "lib"]) {
      const abs = path.resolve(__dirname, "..", dir);
      for (const f of fs.readdirSync(abs)) {
        if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
        if (sendsAnInvite.test(fs.readFileSync(path.join(abs, f), "utf8"))) senders.push(`${dir}/${f}`);
      }
    }
    expect(senders.sort()).toEqual(["lib/queuedInviteSender.ts", "routes/invites.ts", "routes/manage.ts"]);
  });
});
