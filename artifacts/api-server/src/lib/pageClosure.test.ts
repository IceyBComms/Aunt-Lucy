/**
 * Closing a page — the rule (bug #090).
 *
 * ⚠️ P2. Every ABSENCE here is asserted beside something only the real
 * behaviour produces. "No message was sent to Priya" passes for free if the
 * rule returned an empty list for everybody, so each of those assertions sits
 * next to a positive control from the SAME call — the person who SHOULD be told
 * is in the list — and the sabotage log at the bottom of this file records what
 * was broken to prove each one is load-bearing.
 *
 * ⚠️ P8's amendment. A green run here proves the RULE is right. It does NOT
 * prove the route still calls it, so the last describe block reads the route
 * source and asserts the wiring. That is a text check, not an execution one,
 * and its limits are written out there.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  canClosePage,
  canReopenPage,
  closureAudience,
  closureCancellations,
  hasAlreadyHappened,
  type ClosureGrant,
  type ClosureSlot,
} from "./pageClosure";
import type { NotifyTarget } from "./notifyTargets";

// 2026-09-20 is a Sunday. 14:00 in Sydney (UTC+10, no daylight saving yet).
const NOW = new Date("2026-09-20T04:00:00Z");
const TODAY = "2026-09-20";
const TOMORROW = "2026-09-21";
const YESTERDAY = "2026-09-19";

const RECIPIENT: ClosureGrant = {
  id: "g-recipient",
  token: "tok-recipient",
  role: "recipient",
  revokedAt: null,
};
const MANAGER: ClosureGrant = {
  id: "g-manager",
  token: "tok-manager",
  role: "manager",
  revokedAt: null,
};
const REVOKED_MANAGER: ClosureGrant = { ...MANAGER, revokedAt: new Date("2026-09-01") };

const ACTIVE = { status: "active" };
const CLOSED = { status: "closed" };

function slot(over: Partial<ClosureSlot> = {}): ClosureSlot {
  return {
    id: "slot-1",
    slotType: "meal",
    customLabel: null,
    slotDate: TOMORROW,
    slotTime: null,
    isClaimed: true,
    claimedByName: "Priya",
    claimedByContact: "priya@example.com",
    ...over,
  };
}

function target(over: Partial<NotifyTarget> = {}): NotifyTarget {
  return {
    mobile: null,
    email: "someone@example.com",
    token: "tok-other",
    isRecipient: false,
    personName: "Someone",
    ...over,
  };
}

// ─── May this person close it? (ruling 7) ────────────────────────────────────

describe("who may close a page", () => {
  it("a recipient grant can close it — the positive control for everything below", () => {
    expect(canClosePage(RECIPIENT, ACTIVE)).toEqual({ ok: true });
  });

  it("an unrevoked manager grant can close it", () => {
    expect(canClosePage(MANAGER, ACTIVE)).toEqual({ ok: true });
  });

  it("a REVOKED manager grant cannot — beside the unrevoked one that can", () => {
    expect(canClosePage(REVOKED_MANAGER, ACTIVE).ok).toBe(false);
    expect(canClosePage(REVOKED_MANAGER, ACTIVE)).toMatchObject({ status: 401 });
    // The positive control: same page, same shape of grant, only revokedAt differs.
    expect(canClosePage(MANAGER, ACTIVE).ok).toBe(true);
  });

  it("a RECIPIENT grant can close it even when revoked — they can never be locked out", () => {
    // Ruling 7. This is the one asymmetry in the rule and the reason the route
    // resolves the token itself instead of using the middleware, which filters
    // revoked grants out in SQL before any rule could see them.
    expect(canClosePage({ ...RECIPIENT, revokedAt: new Date("2026-09-01") }, ACTIVE)).toEqual({
      ok: true,
    });
  });

  it("a helper cannot: there is no grant, and no grant is a refusal", () => {
    // A helper holds a claim link (slots.cancel_token), which resolves to a
    // SLOT. It has never resolved to a grant, so the only thing a helper's
    // credential can produce here is null.
    expect(canClosePage(null, ACTIVE)).toMatchObject({ ok: false, status: 401 });
    expect(canClosePage(undefined, ACTIVE)).toMatchObject({ ok: false, status: 401 });
  });

  it("an already-closed page refuses, with 409 rather than 401", () => {
    expect(canClosePage(RECIPIENT, CLOSED)).toMatchObject({ ok: false, status: 409 });
    // Positive control: the same grant on the same page when it is open.
    expect(canClosePage(RECIPIENT, ACTIVE).ok).toBe(true);
  });

  it("a page that isn't live yet can still be closed", () => {
    // Deliberate: a gift page scheduled to go live next Tuesday, or a draft
    // holding queued invitations, is exactly the thing somebody may want
    // stopped before it starts.
    expect(canClosePage(RECIPIENT, { status: "draft" })).toEqual({ ok: true });
  });
});

describe("who may reopen a page", () => {
  it("the same people, on a closed page", () => {
    expect(canReopenPage(RECIPIENT, CLOSED)).toEqual({ ok: true });
    expect(canReopenPage(MANAGER, CLOSED)).toEqual({ ok: true });
  });

  it("a revoked manager cannot; a revoked recipient still can", () => {
    expect(canReopenPage(REVOKED_MANAGER, CLOSED).ok).toBe(false);
    expect(canReopenPage({ ...RECIPIENT, revokedAt: new Date() }, CLOSED).ok).toBe(true);
  });

  it("a page that isn't closed refuses", () => {
    expect(canReopenPage(RECIPIENT, ACTIVE)).toMatchObject({ ok: false, status: 409 });
    expect(canReopenPage(RECIPIENT, CLOSED).ok).toBe(true);
  });
});

// ─── Has it happened? (ruling 2, and Kate's 0(d) ruling) ─────────────────────

describe("has this task already happened", () => {
  it("yesterday has; tomorrow has not", () => {
    expect(hasAlreadyHappened({ slotDate: YESTERDAY, slotTime: null }, NOW)).toBe(true);
    expect(hasAlreadyHappened({ slotDate: TOMORROW, slotTime: null }, NOW)).toBe(false);
  });

  it("TODAY with no time has NOT — the day isn't over", () => {
    expect(hasAlreadyHappened({ slotDate: TODAY, slotTime: null }, NOW)).toBe(false);
  });

  it("today, before now, has; today, after now, has not", () => {
    // NOW is 14:00 in Sydney.
    expect(hasAlreadyHappened({ slotDate: TODAY, slotTime: "09:00" }, NOW)).toBe(true);
    expect(hasAlreadyHappened({ slotDate: TODAY, slotTime: "18:00" }, NOW)).toBe(false);
  });

  it("a stored HH:MM:SS compares the same as HH:MM", () => {
    expect(hasAlreadyHappened({ slotDate: TODAY, slotTime: "09:00:00" }, NOW)).toBe(true);
    expect(hasAlreadyHappened({ slotDate: TODAY, slotTime: "18:00:00" }, NOW)).toBe(false);
  });

  it("UNDATED is treated as FUTURE — Kate's ruling, 20 September 2026", () => {
    // The product has no completion state, so "did the meal happen?" is
    // unanswerable for an undated offer. Telling beats silence: someone who
    // already delivered reads that the page closed and shrugs; someone who had
    // not turns up with food at a house in crisis.
    expect(hasAlreadyHappened({ slotDate: null, slotTime: null }, NOW)).toBe(false);
  });
});

// ─── Which claims are cancelled? ─────────────────────────────────────────────

describe("which claims closure cancels", () => {
  it("a claim on a FUTURE task is cancelled", () => {
    const { cancelled, leftAlone } = closureCancellations([slot({ slotDate: TOMORROW })], NOW);
    expect(cancelled.map((s) => s.id)).toEqual(["slot-1"]);
    expect(leftAlone).toEqual([]);
  });

  it("a claim on a task that has ALREADY HAPPENED is left alone", () => {
    const past = slot({ id: "past", slotDate: YESTERDAY });
    const future = slot({ id: "future", slotDate: TOMORROW });
    const { cancelled, leftAlone } = closureCancellations([past, future], NOW);
    // The absence…
    expect(cancelled.map((s) => s.id)).not.toContain("past");
    // …beside the positive control from the SAME call. Without this line the
    // absence would pass for a rule that cancelled nothing at all.
    expect(cancelled.map((s) => s.id)).toEqual(["future"]);
    expect(leftAlone.map((s) => s.id)).toEqual(["past"]);
  });

  it("an UNCLAIMED task is neither cancelled nor told about", () => {
    const open = slot({ id: "open", isClaimed: false, claimedByName: null, claimedByContact: null });
    const taken = slot({ id: "taken" });
    const { cancelled, leftAlone } = closureCancellations([open, taken], NOW);
    expect(cancelled.map((s) => s.id)).toEqual(["taken"]);
    expect(leftAlone).toEqual([]);
  });

  it("an undated claim is cancelled", () => {
    const { cancelled } = closureCancellations([slot({ slotDate: null })], NOW);
    expect(cancelled).toHaveLength(1);
  });
});

// ─── Who is told? ────────────────────────────────────────────────────────────

describe("who closure tells", () => {
  const OTHER = target({ token: "tok-other", email: "sister@example.com" });
  const CLOSER = target({ token: RECIPIENT.token, email: "closer@example.com" });

  it("a cancelled claim produces EXACTLY ONE message to its helper", () => {
    const { cancelled } = closureCancellations([slot()], NOW);
    const audience = closureAudience({
      cancelled,
      targets: [],
      closerGrantToken: RECIPIENT.token,
      tellHelpers: true,
    });
    expect(audience.helpers).toHaveLength(1);
    expect(audience.helpers[0]).toMatchObject({ contact: "priya@example.com", name: "Priya" });
  });

  it("a task that already happened produces NO message — beside the one that does", () => {
    const { cancelled } = closureCancellations(
      [slot({ id: "past", slotDate: YESTERDAY, claimedByContact: "past@example.com" }), slot()],
      NOW,
    );
    const audience = closureAudience({
      cancelled,
      targets: [],
      closerGrantToken: RECIPIENT.token,
      tellHelpers: true,
    });
    const contacts = audience.helpers.map((h) => h.contact);
    expect(contacts).not.toContain("past@example.com");
    // Positive control from the same call.
    expect(contacts).toEqual(["priya@example.com"]);
  });

  it("someone INVITED who never claimed gets nothing", () => {
    // The strongest form this guarantee can take: an invitation is not an input
    // to this rule at all, so there is no row here to reach an un-claimed
    // invitee through. What IS here is the unclaimed slot their invitation
    // pointed at, and it produces no message while the claimed one does.
    const invitedNeverClaimed = slot({
      id: "invited",
      isClaimed: false,
      claimedByName: null,
      claimedByContact: null,
    });
    const { cancelled } = closureCancellations([invitedNeverClaimed, slot()], NOW);
    const audience = closureAudience({
      cancelled,
      targets: [],
      closerGrantToken: RECIPIENT.token,
      tellHelpers: true,
    });
    expect(audience.helpers.map((h) => h.slotId)).not.toContain("invited");
    expect(audience.helpers.map((h) => h.slotId)).toEqual(["slot-1"]);
  });

  it("a cancelled claim with no contact is cancelled but not messaged", () => {
    const unreachable = slot({ id: "unreachable", claimedByContact: null });
    const { cancelled } = closureCancellations([unreachable, slot()], NOW);
    expect(cancelled.map((s) => s.id)).toContain("unreachable");
    const audience = closureAudience({
      cancelled,
      targets: [],
      closerGrantToken: RECIPIENT.token,
      tellHelpers: true,
    });
    expect(audience.helpers.map((h) => h.slotId)).toEqual(["slot-1"]);
  });

  it("the OTHER grant-holders are told, and the closer never is", () => {
    const audience = closureAudience({
      cancelled: [],
      targets: [CLOSER, OTHER],
      closerGrantToken: RECIPIENT.token,
      tellHelpers: true,
    });
    expect(audience.others.map((t) => t.email)).toEqual(["sister@example.com"]);
  });

  it("'I'll tell people myself' cancels the same claims, sends the helpers NOTHING, and still tells the others", () => {
    // Ruling 3, and all three halves of it in one call.
    const slots = [slot(), slot({ id: "slot-2", claimedByContact: "sam@example.com" })];
    const { cancelled } = closureCancellations(slots, NOW);

    const told = closureAudience({
      cancelled,
      targets: [CLOSER, OTHER],
      closerGrantToken: RECIPIENT.token,
      tellHelpers: true,
    });
    const silent = closureAudience({
      cancelled,
      targets: [CLOSER, OTHER],
      closerGrantToken: RECIPIENT.token,
      tellHelpers: false,
    });

    // Same claims cancelled either way — the cancellation is not the choice.
    expect(cancelled.map((s) => s.id)).toEqual(["slot-1", "slot-2"]);
    // Nothing to the helpers…
    expect(silent.helpers).toEqual([]);
    // …beside the positive control: the same input, told, reaches both of them.
    expect(told.helpers).toHaveLength(2);
    // The other grant-holders are told either way.
    expect(silent.others.map((t) => t.email)).toEqual(["sister@example.com"]);
  });
});

// ─── The wiring (P8's amendment) ─────────────────────────────────────────────

describe("the route still calls the rule", () => {
  /**
   * ⚠️ READ THIS BEFORE TRUSTING A GREEN RUN.
   *
   * Everything above proves the RULE. None of it proves the ROUTE calls it: a
   * close endpoint that skipped canClosePage entirely, or cancelled every claim
   * rather than the ones closureCancellations picked, would leave this whole
   * file green.
   *
   * These read the route and library SOURCE and assert the calls are present.
   * That is a text check with real limits — it cannot tell you the arguments
   * are right, or that a call is reached rather than sitting past a return. It
   * catches the failure it is aimed at, which is the rule being quietly
   * detached from the thing that performs it, and nothing more.
   *
   * ⚠️ AND IT DOES NOT RUN IN CI. There is no CI on this repo; these run when
   * somebody runs `pnpm --filter @workspace/api-server test`.
   */
  const read = (rel: string) =>
    fs.readFileSync(path.resolve(import.meta.dirname, rel), "utf8");
  const route = read("../routes/manage.ts");
  const dbHalf = read("./pageClosureDb.ts");

  it("the close route exists and asks canClosePage first", () => {
    expect(route).toContain('router.post("/manage/:token/close"');
    const routeAt = route.indexOf('router.post("/manage/:token/close"');
    const ruleAt = route.indexOf("canClosePage(", routeAt);
    const performAt = route.indexOf("performClosure(", routeAt);
    expect(ruleAt).toBeGreaterThan(routeAt);
    // The refusal is asked BEFORE anything is written or sent.
    expect(performAt).toBeGreaterThan(ruleAt);
  });

  it("the reopen route exists and asks canReopenPage first", () => {
    const routeAt = route.indexOf('router.post("/manage/:token/reopen"');
    expect(routeAt).toBeGreaterThan(-1);
    const ruleAt = route.indexOf("canReopenPage(", routeAt);
    const performAt = route.indexOf("performReopen(", routeAt);
    expect(ruleAt).toBeGreaterThan(routeAt);
    expect(performAt).toBeGreaterThan(ruleAt);
  });

  it("the confirm screen's preview uses the SAME rule the close route runs", () => {
    // Two implementations of "which claims are live and still ahead of us"
    // would drift, and the one that drifted would be the one a family read
    // before pressing the button.
    const previewAt = route.indexOf('router.get(\n  "/manage/:token/closure-preview"');
    expect(previewAt).toBeGreaterThan(-1);
    expect(route.indexOf("closureCancellations(", previewAt)).toBeGreaterThan(previewAt);
    expect(dbHalf).toContain("closureCancellations(");
  });

  it("closure decides who to tell through closureAudience, not by hand", () => {
    expect(dbHalf).toContain("closureAudience(");
    expect(dbHalf).toContain("closerGrantToken: opts.grant.token");
  });

  it("the close route resolves its own token, NOT through requireManagementToken", () => {
    // The middleware filters revoked grants out in SQL and 410s closed pages,
    // either of which would make ruling 7 and ruling 5 unreachable.
    const closeRoute = route.slice(
      route.indexOf('router.post("/manage/:token/close"'),
      route.indexOf('router.post("/manage/:token/reopen"'),
    );
    expect(closeRoute).not.toContain("requireManagementToken");
    expect(closeRoute).toContain("loadClosureContext(");
  });

  it("closing writes the status AND the date; reopening writes only the status", () => {
    expect(dbHalf).toContain("status: CLOSED_PAGE_STATUS, closedAt: now");
    const reopenAt = dbHalf.indexOf("export async function performReopen");
    const reopenBody = dbHalf.slice(reopenAt);
    expect(reopenBody).toContain("status: REOPENED_PAGE_STATUS");
    // ⚠️ Ruling 5. Reopening must not put the claims back, and the cheapest
    // proof of that is that it does not touch the slots table at all.
    expect(reopenBody).not.toContain("slotsTable");
    expect(reopenBody).not.toContain("isClaimed");
  });

  it("the free-text note is never written to the database", () => {
    // It will collect sensitive detail ("Tammy passed away on Friday"). There
    // is no column for it, deliberately, so there is nothing to retain — and
    // this fails if one is ever quietly added without revisiting that decision.
    expect(dbHalf).not.toMatch(/closureNote|closure_note|closingNote/);
  });
});
