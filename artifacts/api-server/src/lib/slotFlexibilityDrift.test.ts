/**
 * The form's default answer and the server's stored one must never disagree.
 *
 * The /manage "Add a task" form shows an answer to "Does the time matter?"
 * before anything is sent, so it needs the flexible/fixed default on the
 * browser side — and rally cannot import from api-server (its only workspace
 * dependency is @workspace/api-client-react). The mapping is therefore
 * duplicated in rally/src/lib/slotFlexibility.ts.
 *
 * THIS TEST IS WHAT MAKES THAT DUPLICATION SAFE. A drift here is not cosmetic:
 * the form would show "Roughly then is fine" while the row it created said
 * fixed — the screen telling the family one thing and the helper's own screen
 * another, which is a sharper version of the bug the shared validator exists to
 * prevent. Same arrangement, and the same reason, as liftWaitDurationDrift.
 *
 * If the mapping ever moves into a shared package, delete this test and import
 * from there — the cross-package file read is the price of the duplication, not
 * something to keep for its own sake.
 *
 * ⚠️ Rows #124/#128: this clone is CRLF on disk with no `.gitattributes`. The
 * table is parsed line by line; no pattern below spans a line break.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { defaultFlexibility } from "./slotFlexibility";
import { VALID_SLOT_TYPES } from "./newTaskInput";

const RALLY_SOURCE = path.resolve(
  __dirname,
  "../../../rally/src/lib/slotFlexibility.ts",
);

/** Pull rally's table out of the source text, without importing rally. */
function rallyDefaults(): Record<string, string> {
  const src = fs.readFileSync(RALLY_SOURCE, "utf8");
  const start = src.indexOf("export const DATED_SLOT_FLEXIBILITY");
  if (start < 0) {
    throw new Error("DATED_SLOT_FLEXIBILITY not found in rally's slotFlexibility.ts");
  }
  const end = src.indexOf("};", start);
  const out: Record<string, string> = {};
  for (const line of src.slice(start, end).split(/\r?\n/)) {
    const m = line.match(/^\s*(\w+):\s*"(flexible|fixed)",/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

describe("the flexible/fixed default, both sides", () => {
  it("rally's source file is where this test thinks it is", () => {
    // Guards the guard: a moved file would otherwise make this suite throw
    // rather than fail with something readable.
    expect(fs.existsSync(RALLY_SOURCE)).toBe(true);
  });

  it("the table really was parsed — every task type is in it", () => {
    // Positive control. Without this, a regex that matched NOTHING would make
    // every agreement test below pass over an empty object.
    const table = rallyDefaults();
    expect(Object.keys(table).sort()).toEqual([...VALID_SLOT_TYPES].sort());
  });

  for (const slotType of VALID_SLOT_TYPES) {
    it(`agrees on a dated ${slotType}`, () => {
      // `true` because every task created through either door is dated — both
      // the wizard and the /manage form refuse one without a date.
      expect(rallyDefaults()[slotType]).toBe(defaultFlexibility(slotType, true));
    });
  }

  it("the two that matter most are what the brief says", () => {
    // Anchors the comparison to the RULE rather than to whatever both sides
    // happen to say: two files could agree and both be wrong.
    expect(rallyDefaults().meal).toBe("flexible");
    expect(rallyDefaults().school_pickup).toBe("fixed");
  });
});
