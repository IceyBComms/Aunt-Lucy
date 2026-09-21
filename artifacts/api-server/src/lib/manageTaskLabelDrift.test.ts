/**
 * routes/manage.ts really calls the lookup, in BOTH places (#127) — and no
 * display table anywhere still says "School pickup" (Kate's ruling, 21 Sep
 * 2026; see the consolidation row #136).
 *
 * The unit test beside this one proves taskName() returns a human name. It
 * cannot prove the route uses it — and the route is where the bug lived. So
 * this reads manage.ts as text, the same shape as pageClosureDrift.test.ts and
 * legalEntityDrift.test.ts.
 *
 * TWO PLACES, NOT ONE. The GET payload and the PATCH response both built the
 * label. Fixing only the GET would have looked right until the family edited a
 * task, at which point the raw key came back in the response and the screen
 * broke again — the hardest kind of bug to believe you have fixed.
 *
 * ⚠️ No pattern here may span a line break: the repo has no .gitattributes and
 * these files are CRLF on disk (#124/#128).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (rel: string) =>
  fs.readFileSync(path.resolve(import.meta.dirname, rel), "utf8");

const manage = read("../routes/manage.ts");
const lines = manage.split(/\r?\n/);

describe("the raw-key fallback is gone from routes/manage.ts", () => {
  it("no label is built from a slotType fallback", () => {
    // Positive control: we are reading the real file.
    expect(manage).toContain("label:");
    expect(manage).not.toMatch(/label:\s*\S+\.customLabel\s*\?\?\s*\S+\.slotType/);
  });

  it("both TASK label sites go through taskName()", () => {
    // Only lines that name a task. manage.ts also carries a `label:` on a log
    // line (inviteSms:…), which is a metric name no human ever reads — sweeping
    // it in here is how this test would start failing for reasons that have
    // nothing to do with #127.
    const taskLabelLines = lines
      .filter((line) => /^\s*label:/.test(line))
      .filter((line) => /customLabel|slotType|taskName\(/.test(line));

    // Two, and exactly two: the GET payload and the PATCH response. A third
    // would be a new place for the raw key to escape from.
    expect(taskLabelLines).toHaveLength(2);
    for (const line of taskLabelLines) {
      expect(line).toContain("taskName(");
    }
  });

  it("taskName is imported rather than re-implemented locally", () => {
    expect(manage).toMatch(/^\s*taskName,$/m);
    expect(manage).toContain('from "../lib/item17Copy"');

    // A display-name table copied into the route would defeat the whole point
    // of a single lookup, so no CODE line here may name a task. Comment lines
    // are stripped first: the fix's own comment quotes "Dog walking" as the
    // thing the email said, and that is documentation, not a second table.
    const code = lines.filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
    expect(code).not.toContain('"Dog walking"');
    expect(code).not.toContain('"School run"');
    expect(code).not.toContain('"school run"');
  });
});

/**
 * EVERY PLACE THAT NAMES slot type school_pickup FOR A HUMAN.
 *
 * ⚠️ THIS LIST IS THE EVIDENCE FOR ROW #136. Seven files hold eight separate
 * task-name tables, which is exactly how "School pickup", "School Pickup" and
 * the raw enum key all ended up live at the same time — three spellings and a
 * database key, on four screens, for one task. Consolidating them into a single
 * shared lookup is its own job and is NOT done here; until it is, this test is
 * what stops them drifting apart again.
 *
 * Capitalisation deliberately varies: each table follows its OWN siblings
 * ("Child Care" next door means "School Run", "Child care" means "School run").
 * Unifying that is part of the consolidation job, not of a rename.
 */
const DISPLAY_TABLES: { file: string; expected: string }[] = [
  // api-server
  { file: "./email.ts", expected: '"School run"' },
  { file: "./item17Copy.ts", expected: '"school run"' },
  { file: "./occasionSuggestions.ts", expected: '"School run for the big kids"' },
  // rally
  { file: "../../../rally/src/components/SlotCard.tsx", expected: '"School Run"' },
  { file: "../../../rally/src/pages/InviteClaim.tsx", expected: '"School Run"' },
  { file: "../../../rally/src/pages/ReleaseSlot.tsx", expected: '"School run"' },
  { file: "../../../rally/src/components/GiftActivation.tsx", expected: '"School run"' },
  { file: "../../../rally/src/pages/OrganiseAddSlots.tsx", expected: '"School Run"' },
  { file: "../../../rally/src/preview035.tsx", expected: '"School run for the big kids"' },
];

/**
 * The display strings only: lines that assign a label, with comment lines
 * dropped. The comments in these files legitimately quote "school pickup" as
 * the name that USED to be there (#127's own history, #058's reasoning), and a
 * test that forbade the words outright would force us to delete the record of
 * why the rename happened.
 */
const displayLines = (source: string) =>
  source
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .filter((line) => /label:|school_pickup:/.test(line));

describe('no display table says "School pickup" any more', () => {
  for (const { file, expected } of DISPLAY_TABLES) {
    it(`${file.split("/").pop()} names it "school run"`, () => {
      const labels = displayLines(read(file));

      // Positive control: this file really does still carry display labels.
      // Without it, a file that lost its table entirely would pass silently.
      expect(labels.length).toBeGreaterThan(0);
      expect(labels.join("\n")).toContain(expected);

      // The ruling, on every label line in the file — not just the school one,
      // because a second table could be added below the first.
      for (const line of labels) {
        expect(line).not.toMatch(/school\s*pickup/i);
      }
    });
  }

  it("the ENUM KEY is untouched in every one of them", () => {
    // Display text only. If a rename had reached the key, stored rows would
    // stop matching their own table and every task would fall back to "task".
    for (const { file } of DISPLAY_TABLES) {
      expect(read(file)).toContain("school_pickup");
    }
  });

  it("the tables listed here are all of them — a new one must be added above", () => {
    // A cheap guard against the list going stale: nine entries, seven of which
    // hold a slot-type table and two of which hold a seeded label. If someone
    // adds a tenth place that names tasks, this number is the reminder to put
    // it in DISPLAY_TABLES rather than let it drift.
    expect(DISPLAY_TABLES).toHaveLength(9);
  });
});
