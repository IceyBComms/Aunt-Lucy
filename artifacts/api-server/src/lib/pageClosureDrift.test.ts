/**
 * The closed-page message exists in three files, and they have to agree
 * (bug #090).
 *
 * routes/pages.ts SENDS it, lib/pageClosureCopy.ts NAMES it, and rally's
 * use-rally.ts MATCHES ON IT to tell the server's three different 404s apart.
 * That matching is deliberate — the server alone decides whether a slug
 * resolves to a real page — but it means a copy tweak in one file silently
 * breaks the branch in another, and the symptom is not an error: a closed page
 * quietly falls back to "This page doesn't exist or has been removed", which is
 * exactly the fault (#028, three times now) this work exists to fix.
 *
 * Same shape as liftWaitDurationDrift.test.ts and legalEntityDrift.test.ts:
 * read the other files as text, assert they still line up.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CLOSED_PAGE_MESSAGE } from "./pageClosureCopy";

const read = (rel: string) => fs.readFileSync(path.resolve(import.meta.dirname, rel), "utf8");

describe("the closed-page message does not drift", () => {
  it("routes/pages.ts sends exactly the string pageClosureCopy names", () => {
    expect(read("../routes/pages.ts")).toContain(CLOSED_PAGE_MESSAGE);
  });

  it("rally's 404-reason table carries the same string", () => {
    const hook = read("../../../rally/src/hooks/use-rally.ts");
    expect(hook).toContain(CLOSED_PAGE_MESSAGE);
    // And the other two reasons are still told apart, because a table with one
    // row would match the closed page and swallow the not-live one.
    expect(hook).toContain("This support page isn't available yet.");
  });

  it("the public message still says nothing about why", () => {
    // 🛑 Ruling 6 guarded at the one place that could quietly widen it. It
    // names no person, no occasion and no reason — anyone holding the link
    // reads this, including people the family never invited.
    expect(CLOSED_PAGE_MESSAGE).not.toMatch(
      /died|death|passed|funeral|ill|sick|recover|no longer needs/i,
    );
  });

  it("SupportPage.tsx renders a closed branch rather than discarding it", () => {
    // The #028 fault was the server's reason being computed and then thrown
    // away by a generic "Page not found". This asserts the branch is present
    // and reached BEFORE that generic one.
    const page = read("../../../rally/src/pages/SupportPage.tsx");
    const closedAt = page.indexOf("if (closed) {");
    const genericAt = page.indexOf("if (isError || !page) {");
    expect(closedAt).toBeGreaterThan(-1);
    expect(genericAt).toBeGreaterThan(closedAt);
  });
});
