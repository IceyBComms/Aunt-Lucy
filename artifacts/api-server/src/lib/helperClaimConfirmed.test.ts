import { describe, it, expect } from "vitest";
import { helperClaimConfirmed, taskLabel, whenClause } from "./item17Copy";
import { measureSms } from "./smsSegments";

// The claim-confirmation SMS (bug #013). Two things are worth pinning: the
// sentence reads correctly for an undated task, and the copy stays GSM-7 — one
// curly apostrophe or em dash would drop the per-segment capacity from 153
// characters to 67 and turn a two-segment message into five.

// A production-shaped release URL: 48 hex characters on the live host = 84.
const LINK = `https://www.auntlucy.com.au/release/${"a".repeat(48)}`;

const build = (slotType: string, customLabel: string | null, date: string | null, time: string | null) =>
  helperClaimConfirmed({
    helperFirstName: "Jane",
    recipientFirstName: "Sarah",
    task: taskLabel(slotType, customLabel),
    whenClause: whenClause(date, time),
    releaseLink: LINK,
  });

describe("helperClaimConfirmed", () => {
  it("reads correctly for a dated task", () => {
    expect(build("meal", null, "2026-08-28", "18:00")).toBe(
      "Thanks Jane, you're helping Sarah with a meal on Friday 28 August at 6:00pm. " +
        `Change or cancel any time: ${LINK}`,
    );
  });

  it("does not say 'on whenever suits' for an undated task", () => {
    const body = build("meal", null, null, null);
    expect(body).toContain("with a meal whenever suits.");
    expect(body).not.toContain("on whenever suits");
  });

  it("prefers the recipient's own wording for the task", () => {
    expect(build("other", "the Tuesday washing", null, null)).toContain(
      "with the Tuesday washing whenever suits.",
    );
  });

  it("always carries the release link, and only that link", () => {
    const body = build("school_pickup", null, "2026-08-28", "15:15");
    expect(body).toContain(LINK);
    // One URL by design: the calendar subscription lives on the page this opens.
    expect(body.match(/https?:\/\/|webcal:\/\//g)).toHaveLength(1);
  });

  it("stays GSM-7 — no curly apostrophe, no em dash", () => {
    for (const body of [
      build("meal", null, "2026-08-28", "18:00"),
      build("meal", null, null, null),
      build("school_pickup", null, "2026-08-28", "15:15"),
      build("child_care", null, "2026-12-01", "09:30"),
    ]) {
      expect(measureSms(body).encoding).toBe("GSM-7");
    }
  });

  it("bills as the two segments Kate signed off, not more", () => {
    for (const body of [
      build("meal", null, "2026-08-28", "18:00"),
      build("meal", null, null, null),
      build("child_care", null, "2026-12-01", "09:30"),
    ]) {
      expect(measureSms(body).segments).toBe(2);
    }
  });
});
