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
  recipientFirstName: "Sarah",
  location: "12 Example St, Sydney",
  claimed: true,
};

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
