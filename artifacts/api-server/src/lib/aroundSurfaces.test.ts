/**
 * ROW #145 — EVERY SERVER-SIDE SURFACE THAT SHOWS A TASK'S TIME SAYS "around".
 *
 * Kate added a dated errand with a time of 4:00 PM on /manage and chose "Around
 * then is fine". The answer WAS stored — established in a test against the real
 * route before anything was changed — and then not one helper-facing surface
 * mentioned it. The public card read "4:00pm", exactly as a school run does.
 *
 * So the fault was entirely on the reading side, and this file is the reading
 * side: each message and each feed is built TWICE from identical inputs, once
 * FIXED and once FLEXIBLE, and the two are compared. The rally screens have
 * their own file (rally/src/test/aroundOnScreen.test.tsx); the formatter's own
 * matrix is in taskCopy.test.ts; the SMS cost is in aroundSegments.test.ts.
 *
 * ⚠️ P2. "the fixed one does not say around" passes for free against a product
 * that never says it anywhere, so every negative here is paired with the
 * positive from the SAME inputs, in the same test.
 *
 * ⚠️ WHY BOTH PARTS OF AN EMAIL. A multipart email carries HTML and plain text,
 * and the word has to reach both. An assertion on one alone would pass with the
 * other still printing a bare time — which is the exact asymmetry #135's
 * sabotage caught on this same email.
 */
import { describe, expect, it } from "vitest";
import {
  buildHtml,
  buildPlainText,
  buildRecipientClaimNotificationEmail,
  type ClaimEmailParams,
  type RecipientClaimItem,
} from "./email";
import { buildClaimIcs, type CalendarClaimData } from "./calendarFeed";
import type { SlotFlexibility } from "@workspace/task-copy";

/** Kate's own case: Wednesday 23 September, 4:00 PM. */
const DATE = "2026-09-23";
const TIME = "16:00";
const FLEXIBLE = "around 4:00pm";
const FIXED = "4:00pm";

const claimEmail = (flexibility: SlotFlexibility): ClaimEmailParams => ({
  slotId: "slot-1",
  helperFirstName: "Priya",
  helperContact: "priya@example.com",
  recipientName: "Tammy",
  slotType: "errand",
  customLabel: null,
  slotDate: DATE,
  slotTime: TIME,
  flexibility,
  liftWaitMode: null,
  notes: null,
  dietaryNotes: null,
  headcount: null,
  location: null,
  releaseUrl: "https://example.test/release/tok",
  calendarUrl: "https://example.test/api/calendar/tok.ics",
});

const recipientClaim = (flexibility: SlotFlexibility): RecipientClaimItem => ({
  helperName: "Priya",
  slotType: "errand",
  customLabel: null,
  slotDate: DATE,
  slotTime: TIME,
  flexibility,
  note: null,
});

const calendarClaim = (flexibility: SlotFlexibility): CalendarClaimData => ({
  slotId: "slot-1",
  slotType: "errand",
  customLabel: null,
  slotDate: DATE,
  slotTime: TIME,
  flexibility,
  liftWaitMode: null,
  recipientFirstName: "Tammy",
  location: null,
  claimed: true,
});

/**
 * "The fixed rendering says the time WITHOUT the word" — said once, because
 * getting it wrong in one place is how a negative assertion stops biting.
 */
function expectAroundOnlyWhenFlexible(name: string, render: (f: SlotFlexibility) => string) {
  const fixed = render("fixed");
  const flexible = render("flexible");
  expect(flexible, `${name}: flexible`).toContain(FLEXIBLE);
  expect(fixed, `${name}: fixed still shows the time`).toContain(FIXED);
  expect(fixed, `${name}: fixed says nothing about around`).not.toContain("around");
}

describe("the helper's claim confirmation email", () => {
  it("says 'at around 4:00pm' in the HTML part, and a bare time when fixed", () => {
    expectAroundOnlyWhenFlexible("html", (f) => buildHtml(claimEmail(f)));
    expect(buildHtml(claimEmail("flexible"))).toContain(
      "Wednesday 23 September at around 4:00pm",
    );
  });

  it("says the same in the PLAIN TEXT part — both halves or neither", () => {
    expectAroundOnlyWhenFlexible("text", (f) => buildPlainText(claimEmail(f)));
    expect(buildPlainText(claimEmail("flexible"))).toContain(
      "When: Wednesday 23 September at around 4:00pm",
    );
  });
});

describe("the family's 'someone has claimed' email", () => {
  const build = (f: SlotFlexibility, part: "html" | "text") =>
    buildRecipientClaimNotificationEmail({
      to: "tammy@example.test",
      recipientFirstName: "Tammy",
      manageLink: "https://example.test/manage/tok",
      claims: [recipientClaim(f)],
    })[part];

  it("names the time the same way the helper was told it", () => {
    expectAroundOnlyWhenFlexible("recipient html", (f) => build(f, "html"));
    expectAroundOnlyWhenFlexible("recipient text", (f) => build(f, "text"));
  });
});

describe("the calendar feed", () => {
  it("carries the word in the event TITLE, where a helper scanning a week sees it", () => {
    const flexible = buildClaimIcs(calendarClaim("flexible"));
    const fixed = buildClaimIcs(calendarClaim("fixed"));

    // A calendar entry cannot say this any other way: the block sits at 4pm
    // whether the family can move it or not.
    expect(flexible).toContain("SUMMARY:Helping Tammy: an errand (around 4:00pm)");
    // Positive control from the same render: the fixed title is the one that
    // shipped before, unchanged.
    expect(fixed).toContain("SUMMARY:Helping Tammy: an errand");
    expect(fixed).not.toContain("around");
  });

  it("an UNTIMED task's title is untouched — it is an all-day entry that already says so", () => {
    const ics = buildClaimIcs({ ...calendarClaim("flexible"), slotTime: null });
    expect(ics).toContain("SUMMARY:Helping Tammy: an errand");
    expect(ics).not.toContain("around");
    expect(ics).toContain("Any time that day.");
  });

  it("a lift that is ALSO flexible gets one bracket, not two", () => {
    const ics = buildClaimIcs({
      ...calendarClaim("flexible"),
      liftWaitMode: "wait",
    });
    // ICS escapes a comma inside a text value, so on the wire this is a
    // backslash before it — asserted as it is actually written, not as it
    // reads. (The rest of the title folds onto a continuation line, which is
    // why the match stops here.)
    expect(ics).toContain("(around 4:00pm\\,");
    // And the wait answer is still in there — it drives the duration, so losing
    // it would be a bigger fault than the one this row is about.
    expect(ics).not.toContain(") (");
  });
});
