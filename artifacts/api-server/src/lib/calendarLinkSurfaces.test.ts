import { describe, it, expect } from "vitest";
import { buildHtml, buildPlainText, type ClaimEmailParams } from "./email";
import { calendarFeedUrl, calendarSubscribeUrl } from "./calendarFeed";

// Bug #037 — the guard on the fix, written at the level the bug lived at.
//
// webcal:// was the only fault: pasted into Outlook desktop it silently failed,
// while the same feed given to Outlook as an https address subscribed and
// rendered correctly. It is the client's scheme handling and is unreachable
// from the server, so the fix was to stop relying on it. The subscription is
// parked, not abandoned — routes/calendar.ts is untouched.
//
// These tests exist so the two things that were wrong cannot come back quietly:
// a webcal:// URL on a surface a helper sees, and a promise that a downloaded
// calendar file updates itself.

const base: ClaimEmailParams = {
  slotId: "slot-abc-123",
  helperFirstName: "Jane",
  helperContact: "jane@example.com",
  recipientName: "Sarah Chen",
  slotType: "meal",
  customLabel: null,
  slotDate: "2026-08-28",
  slotTime: "18:00",
  liftWaitMode: null,
  notes: null,
  dietaryNotes: null,
  headcount: null,
  location: "Marrickville",
  releaseUrl: "https://www.auntlucy.com.au/release/" + "c".repeat(48),
  calendarUrl: calendarFeedUrl("d".repeat(48)),
};

/** Every rendered helper-facing part of the claim confirmation. */
const surfaces = (params: ClaimEmailParams) => [
  ["claim confirmation email (HTML)", buildHtml(params)],
  ["claim confirmation email (plain text)", buildPlainText(params)],
];

describe("bug #037 — no webcal:// reaches a helper", () => {
  it("emits no webcal:// on any rendered surface", () => {
    for (const [name, body] of surfaces(base)) {
      expect(body, name).not.toContain("webcal:");
    }
  });

  it("still emits no webcal:// when there is no calendar link at all", () => {
    // An undated "whenever suits" offer isn't an appointment, so the caller
    // passes calendarUrl: null and the block is skipped entirely.
    for (const [name, body] of surfaces({ ...base, slotDate: null, calendarUrl: null })) {
      expect(body, name).not.toContain("webcal:");
      expect(body, name).not.toContain("/api/calendar/");
    }
  });

  it("offers the https .ics download, and links it rather than printing it raw in HTML", () => {
    const html = buildHtml(base);
    expect(html).toContain(`href="${base.calendarUrl}"`);
    expect(html).toContain("Add this to your calendar");
    // The HTML part — what nearly every helper sees — shows no bare URL text.
    expect(html).not.toContain(`>${base.calendarUrl}<`);

    // Plain text cannot hyperlink, so it carries the URL on its own line, the
    // same treatment releaseUrl already gets.
    expect(buildPlainText(base)).toContain(base.calendarUrl!);
  });
});

describe("bug #037 — nothing promises a downloaded file will update", () => {
  it("makes no update promise on any rendered surface", () => {
    // A downloaded .ics is read once and finished with: it never updates, on
    // any client. Even the parked subscription only refreshes about once a day,
    // so it could not have honoured this either. Changes reach helpers by email
    // and SMS, which the product already does.
    for (const [name, body] of surfaces(base)) {
      expect(body, name).not.toMatch(/update[sd]? if the time changes/i);
      expect(body, name).not.toMatch(/it updates/i);
      expect(body, name).not.toMatch(/stay(s)? in step/i);
    }
  });

  it("keeps the approved wording verbatim", () => {
    // "Add this to your calendar so it's there when you need it."
    //
    // The two parts terminate that sentence differently, and deliberately: HTML
    // closes with a full stop because the link is on the words, while plain
    // text closes with a colon because the URL follows on the next line. That
    // is the treatment releaseUrl already gets in the same email.
    const html = buildHtml(base);
    expect(html).toContain(">Add this to your calendar</a> so it's there when you need it.");

    const text = buildPlainText(base);
    expect(text).toContain("Add this to your calendar so it's there when you need it:");

    // Neither part says anything after that sentence about the file changing.
    for (const [name, body] of surfaces(base)) {
      expect(body, name).toContain("Add this to your calendar");
      expect(body, name).toContain("so it's there when you need it");
    }
  });
});

describe("bug #037 — the parked subscription is still buildable", () => {
  it("keeps calendarSubscribeUrl working so it can be un-parked", () => {
    // Deliberately unused by any surface. Kept because a deleted function takes
    // its reason with it — see the comment on calendarSubscribeUrl.
    expect(calendarSubscribeUrl("TOKENXYZ")).toMatch(
      /^webcal:\/\/.+\/api\/calendar\/TOKENXYZ\.ics$/,
    );
    // Same address, two schemes: the parked subscribe form and the shipped one.
    expect(calendarSubscribeUrl("TOKENXYZ").replace(/^webcal:/, "https:")).toBe(
      calendarFeedUrl("TOKENXYZ").replace(/^http:/, "https:"),
    );
  });
});
