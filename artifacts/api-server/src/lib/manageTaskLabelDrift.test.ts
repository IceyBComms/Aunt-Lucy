/**
 * routes/manage.ts really calls the lookup, in BOTH places (#127).
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

const manage = fs.readFileSync(
  path.resolve(import.meta.dirname, "../routes/manage.ts"),
  "utf8",
);

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
