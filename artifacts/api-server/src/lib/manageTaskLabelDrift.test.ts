/**
 * routes/manage.ts really calls the shared lookup, in all three places (#127).
 *
 * The unit test beside this one proves the lookup returns a human name. It
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

  it("every TASK label site goes through the shared lookup", () => {
    // Only lines that name a task. manage.ts also carries a `label:` on a log
    // line (inviteSms:…), which is a metric name no human ever reads — sweeping
    // it in here is how this test would start failing for reasons that have
    // nothing to do with #127.
    const taskLabelLines = lines
      .filter((line) => /^\s*label:/.test(line))
      .filter((line) => /customLabel|slotType|manageTaskName\(/.test(line));

    // Three, and exactly three: the GET payload, the PATCH response, and the
    // POST /manage/:token/tasks response added in Part C (21 September 2026).
    // A FOURTH would be a new place for the raw key to escape from — this
    // count is the guard, so it goes up only alongside a site that has been
    // read and shown to call it.
    expect(taskLabelLines).toHaveLength(3);
    for (const line of taskLabelLines) {
      expect(line).toContain("manageTaskName(");
    }
  });

  it("the name is imported rather than re-implemented locally", () => {
    // Row #136 — it now comes from the shared package both artifacts import,
    // in its HEADING form, because these three sites are a heading on the
    // family's task list.
    expect(manage).toMatch(/^\s*taskLabel as manageTaskName,$/m);
    expect(manage).toContain('from "@workspace/task-copy"');

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

/*
 * ── DELETED 21 SEPTEMBER 2026 (row #136) ─────────────────────────────────────
 *
 * A second half of this file listed the NINE places that named a task for a
 * human — eight display tables in seven files, plus two seeded labels — and
 * asserted that none of them had drifted back to "School pickup". It was the
 * interim guard row #136 asked for, and row #136 also said it should be DELETED
 * by the consolidation job rather than kept beside it.
 *
 * This is that job. The eight tables are gone. Every task name in the product
 * now comes from @workspace/task-copy, which api-server and rally both import,
 * and the test that replaces this one lives there: it asserts the package
 * covers every slot_type enum value, that every form of every name is
 * non-empty, and that every label is sentence case. A table cannot drift from
 * itself.
 *
 * The describe ABOVE stays. It is a different guard, for a different bug: it
 * proves routes/manage.ts calls the shared lookup instead of falling back to
 * the raw enum key (#127), which is about the ROUTE, not about how many tables
 * exist.
 */
