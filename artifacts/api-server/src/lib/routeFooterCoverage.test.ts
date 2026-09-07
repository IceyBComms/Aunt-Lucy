/**
 * Bug #106 — every route in the app must render the shared site footer.
 *
 * ── WHY THIS TEST EXISTS ────────────────────────────────────────────────────
 * The class is "which routes render the shared footer", and it has produced a
 * finding on THREE separate occasions, each time by accident rather than by
 * anyone asking the question:
 *
 *   #041  the public support page had "Powered by Aunt Lucy" and nothing else.
 *   #106  /hardest-times — the FREE CRISIS FORM, which collects a name, an
 *         email and what has happened to someone — offered no route to the
 *         privacy policy at the point of collection, and no identity on the
 *         one page in the product #095's buyer read as a scam.
 *   #106  ReleaseSlot, found sideways during the #037 build: a token-gated
 *         page a helper reaches from an SMS, often the only Aunt Lucy page
 *         they will ever see, with no privacy route, no terms and no identity.
 *
 * All three were the same fault. The sweep that would have caught all three at
 * once was asked for in #106's own row, twice, and never run — because nothing
 * failed when it wasn't. P5: a constraint guarded only by a comment is not
 * guarded. This is the guard.
 *
 * ── WHY IT READS SOURCE RATHER THAN RENDERING ───────────────────────────────
 * rally has no test runner and no DOM harness; api-server has vitest. Reading
 * the other package's source is the established shape here — legalEntityDrift,
 * liftWaitDurationDrift and calendarLinkSurfaces all do it. A renderer would
 * catch more (a footer behind a condition that never fires), but it would need
 * a whole test stack rally does not have, and the fault this guards is a file
 * with no footer in it at all. Cheap and real beats thorough and unbuilt.
 *
 * ── WHAT IT DOES NOT CATCH, STATED PLAINLY ─────────────────────────────────
 * The unit is the FILE, not the screen. Several routes render more than one
 * screen from one component — ReleaseSlot has four, InviteClaim has four — and
 * deleting the footer from one of them leaves the others, so this stays green.
 * Proved, not assumed: removing the only footer from Welcome.tsx turned it red
 * and named the file; that is the fault it guards. Screen-level coverage needs
 * a renderer, and the honest note is that the sweep on 7 Sep 2026 was done by
 * hand and this only stops a WHOLE ROUTE going bare again.
 *
 * Loading spinners are deliberately bare, here as everywhere in this app — a
 * footer under a spinner is furniture on a screen nobody rests on.
 *
 * ── ADDING A ROUTE ──────────────────────────────────────────────────────────
 * Render <SiteFooter compact />. Kate's ruling, 7 Sep 2026: the POLICY LINKS
 * and the IDENTITY belong on every route; the brand paragraph does not, and
 * `compact` is exactly that split. The homepage and /employers are the two
 * pages someone came to in order to find out what this is, so they keep the
 * full mode.
 *
 * If a route genuinely should not have one, add it to NO_FOOTER below WITH A
 * REASON. An entry without a reason is not allowed — an allow-list nobody has
 * to justify is just the bug with a longer name.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PAGES_DIR = path.resolve(__dirname, "../../../rally/src/pages");
const APP_TSX = path.resolve(__dirname, "../../../rally/src/App.tsx");

/**
 * Routes that correctly render no footer.
 *
 * EMPTY, DELIBERATELY, as of the 7 Sep 2026 sweep: all nineteen unswept routes
 * were misses and every one was fixed. Not a single "correctly has none" in
 * the set. Keep it that way if you can — and if you cannot, say why here.
 */
const NO_FOOTER: Record<string, string> = {
  // "SomePage.tsx": "why this route is the exception",
};

const pageFiles = () =>
  fs
    .readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .sort();

describe("bug #106 — the shared footer reaches every route", () => {
  it("finds the pages directory and some pages in it", () => {
    // If this ever goes quiet because the path moved, the rest of the file
    // would pass over an empty list and guard nothing.
    expect(fs.existsSync(PAGES_DIR), PAGES_DIR).toBe(true);
    expect(pageFiles().length).toBeGreaterThan(15);
  });

  it("renders SiteFooter on every page component, or names it in NO_FOOTER", () => {
    const missing: string[] = [];
    for (const file of pageFiles()) {
      if (file in NO_FOOTER) continue;
      const src = fs.readFileSync(path.join(PAGES_DIR, file), "utf-8");
      if (!/<SiteFooter\b/.test(src)) missing.push(file);
    }
    expect(
      missing,
      `These routes render no <SiteFooter/>. On a page that collects a name, ` +
        `an email or what has happened to someone, that means no privacy ` +
        `route at the point of collection and no identity anyone can check. ` +
        `Add <SiteFooter compact />, or add the file to NO_FOOTER with a reason.`,
    ).toEqual([]);
  });

  it("every NO_FOOTER entry carries a reason", () => {
    for (const [file, reason] of Object.entries(NO_FOOTER)) {
      expect(reason.trim().length, `${file} is allow-listed with no reason`).toBeGreaterThan(15);
      expect(
        fs.existsSync(path.join(PAGES_DIR, file)),
        `${file} is allow-listed but no longer exists — delete the entry`,
      ).toBe(true);
    }
  });

  it("every page component is actually routed, so the list above is the route list", () => {
    // The guard is worth what its list is worth. If someone adds a component
    // to src/pages that App.tsx never routes, this test would be policing a
    // file nobody can reach — and, worse, a REAL route living somewhere else
    // would slip past unguarded.
    const app = fs.readFileSync(APP_TSX, "utf-8");
    const unrouted = pageFiles()
      .map((f) => f.replace(/\.tsx$/, ""))
      .filter((name) => !app.includes(`@/pages/${name}`));
    expect(unrouted, "components in src/pages that App.tsx does not import").toEqual([]);
  });

  it("uses compact mode everywhere except the two pages that tell the story", () => {
    // Kate's ruling: the brand paragraph is for someone who came to find out
    // what this is. Everywhere else it is the product talking about itself
    // beside someone's worst week. Full mode is Home and Employers, and
    // adding a third needs a decision, not a default.
    const fullMode: string[] = [];
    for (const file of pageFiles()) {
      const src = fs.readFileSync(path.join(PAGES_DIR, file), "utf-8");
      const tags = src.match(/<SiteFooter\b[^/>]*\/>/g) ?? [];
      if (tags.some((t) => !/\bcompact\b/.test(t))) fullMode.push(file);
    }
    expect(fullMode.sort()).toEqual(["Employers.tsx", "Home.tsx"]);
  });
});
