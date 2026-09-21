/**
 * The helper's claim confirmation email — the words, not the chrome (#135).
 *
 * WHAT THIS GUARDS. This email is the one message every single helper is
 * guaranteed to receive, and until 21 Sep 2026 it ended on a dead end: "If
 * anything changes, just let the person looking after the page know." A helper
 * has no way to reach that person from this email, and no reason to think it is
 * their job — so the line asked them to do something impossible at the exact
 * moment they had just done something kind. Kate's ruling: delete it, and let
 * the release line say the true thing on its own.
 *
 * Both parts change together or neither does. An assertion on the HTML alone
 * would pass with the plain-text part still carrying the dead end, and every
 * multipart email carries both.
 */
import { describe, expect, it } from "vitest";
import { buildHtml, buildPlainText, type ClaimEmailParams } from "./email";

const BASE: ClaimEmailParams = {
  slotId: "slot-1",
  helperFirstName: "Priya",
  helperContact: "priya@example.com",
  recipientName: "Tammy",
  slotType: "meal",
  customLabel: null,
  slotDate: "2026-09-22",
  slotTime: "18:00",
  liftWaitMode: null,
  notes: null,
  dietaryNotes: null,
  headcount: null,
  location: null,
  releaseUrl: "https://auntlucy.com.au/release/abc123",
  calendarUrl: "https://auntlucy.com.au/api/calendar/xyz789.ics",
};

/** Kate's ruling, 21 Sep 2026 — reproduced verbatim, and the test of record. */
const RELEASE_LINE_TEXT =
  "Something come up? You can release this slot — no need to explain. " +
  "It goes straight back on the page for someone else.";

const DEAD_END = "If anything changes, just let the person looking after the page know.";

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("the dead-end line is gone from BOTH parts", () => {
  it("is absent from the HTML — and the HTML really rendered", () => {
    const html = buildHtml(BASE);
    // Positive control first: an empty string would pass the absence check.
    expect(html).toContain("Hi Priya,");
    expect(html).toContain("Dropping off a meal");
    expect(html).not.toContain(DEAD_END);
  });

  it("is absent from the plain text — and the plain text really rendered", () => {
    const text = buildPlainText(BASE);
    expect(text).toContain("Hi Priya,");
    expect(text).toContain("What: Dropping off a meal");
    expect(text).not.toContain(DEAD_END);
  });

  it("is absent even on the sparsest email we can build", () => {
    // No optional detail at all, so nothing else can be hiding the line.
    const sparse: ClaimEmailParams = { ...BASE, slotTime: null, calendarUrl: undefined };
    expect(buildHtml(sparse)).not.toContain(DEAD_END);
    expect(buildPlainText(sparse)).not.toContain(DEAD_END);
  });
});

describe("the release line says the true thing, once, in both parts", () => {
  it("the plain text carries the approved sentence exactly once", () => {
    expect(occurrences(buildPlainText(BASE), RELEASE_LINE_TEXT)).toBe(1);
  });

  it("the HTML carries it once, with 'release this slot' as the link", () => {
    const html = buildHtml(BASE);
    // The HTML splits the same sentence around the anchor, so it is asserted
    // in the three pieces the anchor divides it into — never as one regex
    // across them, and never across a line break (#124/#128: CRLF on disk).
    expect(occurrences(html, "Something come up? You can ")).toBe(1);
    expect(occurrences(html, ">release this slot</a>")).toBe(1);
    expect(
      occurrences(html, " — no need to explain. It goes straight back on the page for someone else."),
    ).toBe(1);
    expect(html).toContain(`href="${BASE.releaseUrl}"`);
  });

  it("the old release wording is gone from both parts", () => {
    const old = "No worries at all";
    expect(buildHtml(BASE)).not.toContain(old);
    expect(buildPlainText(BASE)).not.toContain(old);
  });

  it("the plain text still puts the URL on its own line under the sentence", () => {
    // Plain text cannot hyperlink, so the sentence is useless without it.
    expect(buildPlainText(BASE)).toContain(`for someone else.\n${BASE.releaseUrl}\n`);
  });
});
