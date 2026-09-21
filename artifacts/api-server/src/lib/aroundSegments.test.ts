/**
 * WHAT "around" COSTS IN A TEXT MESSAGE (row #145, 21 September 2026).
 *
 * Row #145 adds one word — "around" — to how a FLEXIBLE task's time reads, and
 * four of the product's SMS bodies carry a task's time. Seven characters is
 * nothing until it crosses a segment boundary, at which point Kate pays for
 * another whole message on every text of that kind, for every helper.
 *
 * So this file measures rather than assumes. Each template is rendered TWICE
 * from identical inputs — once FIXED, which is byte-for-byte what it sent
 * before this change, and once FLEXIBLE, which is what it sends now — and both
 * are measured with the real billing rules (lib/smsSegments.ts).
 *
 * TWO THINGS IT GUARDS, and they are different:
 *   1. ENCODING. "around" is plain Latin, so a GSM-7 body must stay GSM-7. A
 *      body that flipped to UCS-2 would lose more than half its capacity and
 *      the cost would not be seven characters, it would be double. THIS IS THE
 *      ONE THAT MUST NEVER REGRESS, and it is asserted.
 *   2. SEGMENTS. Printed, and asserted only as "no worse than one more". A
 *      template genuinely sitting on a boundary is a copy decision for Kate,
 *      not a failure — but it must not pass unnoticed, which is what the
 *      printed table is for.
 *
 * ⚠️ P2 — the positive control is the FIXED rendering. If the "around" wording
 * were dropped from the formatter, the two columns would be identical, so the
 * first test asserts they DIFFER. Without it every assertion here passes on a
 * product that never says "around" at all.
 */
import { describe, expect, it } from "vitest";
import { measureSms } from "./smsSegments";
import { buildInviteSmsBody } from "./sms";
import { helperClaimConfirmed, helperTaskChanged, taskLabel, whenClause, whenLabel } from "./item17Copy";
import { helperClosureMessage } from "./pageClosureCopy";
import type { SlotFlexibility } from "@workspace/task-copy";

/** A production-shaped release link: 48 hex characters on the live host = 84. */
const LINK = `https://www.auntlucy.com.au/release/${"a".repeat(48)}`;
const INVITE_URL = `https://www.auntlucy.com.au/invite/${"b".repeat(32)}`;

const DATE = "2026-09-23";
const TIME = "16:00";

/** Every SMS body that carries a task's time, rendered from one flexibility. */
const TEMPLATES: Record<string, (f: SlotFlexibility) => string> = {
  "invite SMS": (f) =>
    buildInviteSmsBody({
      recipientName: "Tammy",
      slotTypeLabel: "meal",
      slotDate: DATE,
      slotTime: TIME,
      flexibility: f,
      helperName: "Jane",
      inviteUrl: INVITE_URL,
    }),

  "claim confirmation SMS": (f) =>
    helperClaimConfirmed({
      helperFirstName: "Jane",
      recipientFirstName: "Tammy",
      task: taskLabel("meal", null),
      whenClause: whenClause(DATE, TIME, f),
      releaseLink: LINK,
    }),

  "task changed SMS": (f) =>
    helperTaskChanged({
      helperFirstName: "Jane",
      recipientFirstName: "Tammy",
      task: taskLabel("meal", null),
      newDetail: whenLabel(DATE, TIME, f),
      releaseLink: LINK,
    }),

  "page closed SMS": (f) =>
    helperClosureMessage({
      helperName: "Jane",
      recipientName: "Tammy Hughes",
      closerFirst: "Bree",
      slotType: "meal",
      customLabel: null,
      slotDate: DATE,
      slotTime: TIME,
      flexibility: f,
      occasion: "new_baby",
      note: null,
    }),
};

const NAMES = Object.keys(TEMPLATES);

describe("row #145 — the segment cost of one word", () => {
  it("the flexible rendering really does differ from the fixed one", () => {
    // P2's positive control. Drop "around" from the formatter and this is the
    // test that goes red; every measurement below would otherwise still pass.
    for (const name of NAMES) {
      const before = TEMPLATES[name]("fixed");
      const after = TEMPLATES[name]("flexible");
      expect(after, name).not.toBe(before);
      expect(after, name).toContain("around 4:00pm");
      expect(before, name).toContain("4:00pm");
      expect(before, name).not.toContain("around");
    }
  });

  it("stays GSM-7 — the word is plain Latin and must not change the encoding", () => {
    for (const name of NAMES) {
      const before = measureSms(TEMPLATES[name]("fixed"));
      const after = measureSms(TEMPLATES[name]("flexible"));
      // The claim confirmation is deliberately GSM-7 (see item17Copy); none of
      // these may be pushed out of it by row #145.
      expect(after.encoding, `${name} encoding`).toBe(before.encoding);
    }
  });

  it("costs at most one extra segment, and prints the table", () => {
    const rows: string[] = [];
    for (const name of NAMES) {
      const before = measureSms(TEMPLATES[name]("fixed"));
      const after = measureSms(TEMPLATES[name]("flexible"));
      rows.push(
        `${name.padEnd(24)} ${before.encoding}  ${String(before.chars).padStart(4)} chars / ` +
          `${before.segments} seg  ->  ${String(after.chars).padStart(4)} chars / ${after.segments} seg`,
      );
      expect(after.chars - before.chars, `${name} chars`).toBe(7);
      expect(after.segments - before.segments, `${name} segments`).toBeLessThanOrEqual(1);
    }
    // eslint-disable-next-line no-console
    console.log("\nrow #145 SMS segment cost\n" + rows.join("\n") + "\n");
  });
});
