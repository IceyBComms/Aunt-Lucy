import { describe, it, expect } from "vitest";
import {
  buildClaimIcs,
  calendarFeedUrl,
  calendarSubscribeUrl,
  type CalendarClaimData,
} from "./calendarFeed";

// Pure ICS generation — no network, no DB. Guards the two contracts that matter
// most: a live claim renders as a real appointment, and a released claim renders
// as an explicit STATUS:CANCELLED (not a disappearance) so a subscribed calendar
// cleans the entry up.

const base: CalendarClaimData = {
  slotId: "abc-123",
  slotType: "meal",
  customLabel: null,
  slotDate: "2026-08-15",
  slotTime: "15:00",
  liftWaitMode: null,
  recipientFirstName: "Sarah",
  location: "12 Example St, Sydney",
  claimed: true,
};

/**
 * ICS folds any line past ~75 octets onto a continuation line (CRLF + a single
 * leading space), so a long DESCRIPTION never appears contiguously in the raw
 * output. Unfold before matching on content.
 */
const unfold = (ics: string) => ics.split("\r\n ").join("");

describe("buildClaimIcs", () => {
  it("renders a claimed, timed task as a CONFIRMED appointment", () => {
    const ics = buildClaimIcs(base);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:slot-abc-123@auntlucy.com.au");
    expect(ics).toContain("STATUS:CONFIRMED");
    // Floating wall-clock (no trailing Z), so "3:00pm" stays 3:00pm on the
    // helper's device rather than being shifted by the server's UTC.
    expect(ics).toContain("DTSTART:20260815T150000");
    expect(ics).not.toContain("DTSTART:20260815T150000Z");
    // Location is included when present (already emailed to this same helper).
    expect(ics).toContain("LOCATION:12 Example St");
  });

  it("renders a released task as a CANCELLED event on the SAME UID", () => {
    const ics = buildClaimIcs({ ...base, claimed: false });
    expect(ics).toContain("UID:slot-abc-123@auntlucy.com.au");
    expect(ics).toContain("STATUS:CANCELLED");
    // A cancel must supersede any CONFIRMED copy the client cached.
    expect(ics).toContain("SEQUENCE:1");
  });

  it("keeps the SAME UID across states so a cancel lands on the held entry", () => {
    const uidOf = (s: string) => s.match(/UID:(.+)/)?.[1]?.trim();
    expect(uidOf(buildClaimIcs(base))).toBe(
      uidOf(buildClaimIcs({ ...base, claimed: false })),
    );
  });

  it("omits LOCATION when there is none", () => {
    const ics = buildClaimIcs({ ...base, location: null });
    expect(ics).not.toContain("LOCATION:");
  });

  it("renders a dated-but-timeless task as an all-day event", () => {
    const ics = buildClaimIcs({ ...base, slotTime: null });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260815");
    expect(ics).not.toContain("DTSTART:20260815T");
  });

  // ── Bug #033 — the wait-or-not answer changes the DIARY ENTRY, not just
  // the words. A helper who blocks out an hour for something that takes half a
  // day cancels, so the duration is the part that actually had to change.

  it("blocks out half a day for a lift where the helper waits", () => {
    const ics = buildClaimIcs({ ...base, slotType: "errand", liftWaitMode: "wait" });
    expect(ics).toContain("DTSTART:20260815T150000");
    // 15:00 + 240 minutes = 19:00, NOT the one-hour default.
    expect(ics).toContain("DTEND:20260815T190000");
  });

  it("blocks out a short slot for a drop-off, and says so in the title", () => {
    const ics = buildClaimIcs({ ...base, slotType: "errand", liftWaitMode: "drop_off" });
    // 15:00 + 45 minutes = 15:45.
    expect(ics).toContain("DTEND:20260815T154500");
    expect(ics).toMatch(/SUMMARY:.*drop off only/i);
  });

  it("gives a waiting lift a description a helper can act on", () => {
    const ics = buildClaimIcs({ ...base, slotType: "errand", liftWaitMode: "wait" });
    expect(unfold(ics)).toMatch(/DESCRIPTION:.*allow for the whole appointment/i);
  });

  // The guarantee that keeps every non-lift task untouched. If this fails,
  // a dated "pick up a prescription" errand has started carrying a
  // wait-or-not answer nobody gave.
  it("is unchanged for an unanswered task: one-hour default, no title suffix, no description", () => {
    const ics = buildClaimIcs(base);
    // 15:00 + the untouched 60-minute default = 16:00.
    expect(ics).toContain("DTEND:20260815T160000");
    expect(ics).toContain("SUMMARY:Helping Sarah: a meal");
    expect(unfold(ics)).not.toContain("DESCRIPTION:");
  });

  it("returns an empty calendar (no event) for an undated offer", () => {
    const ics = buildClaimIcs({ ...base, slotDate: null, slotTime: null });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("uses a custom label verbatim in the title", () => {
    const ics = buildClaimIcs({
      ...base,
      slotType: "other",
      customLabel: "Water the garden",
    });
    expect(ics).toContain("SUMMARY:Helping Sarah: Water the garden");
  });
});

describe("calendar link helpers", () => {
  it("builds the https download URL and the webcal subscribe URL", () => {
    // getAppBaseUrl falls back to localhost when APP_URL is unset; assert on the
    // shape rather than the host so the test is env-independent.
    expect(calendarFeedUrl("TOKENXYZ")).toMatch(
      /^https?:\/\/.+\/api\/calendar\/TOKENXYZ\.ics$/,
    );
    expect(calendarSubscribeUrl("TOKENXYZ")).toMatch(
      /^webcal:\/\/.+\/api\/calendar\/TOKENXYZ\.ics$/,
    );
  });
});
