/**
 * ROW #136 — the three sentences that a label alone could never get right.
 *
 * All three used to be built from the task's HEADING. Two of them lower-cased
 * it, which reads fine on the mass and gerund nouns (child care, dog walking,
 * shopping) BY LUCK and wrong on every count noun: "still down for meal",
 * "still down for errand", "still down for visit". The third did not even
 * lower-case it, so it read "you can't do School run?" — capitalised
 * mid-sentence AND missing its article.
 *
 * Lower-casing is not a grammar. There is now a written-down mid-sentence form
 * with its article, in @workspace/task-copy, and these are the sentences that
 * use it — checked for every task type, not just the school run that happened
 * to be in front of us.
 *
 * This lives in rally because the copy is rally's: the family-side and
 * helper-side SCREEN microcopy is UI. The package's own coverage test is in
 * api-server/src/lib/taskCopy.test.ts.
 */
import { describe, expect, it } from "vitest";
import { SLOT_TYPES, TASK_COPY, taskNoun } from "@workspace/task-copy";
import { family, helper as copy } from "@/lib/item17Copy";

const SENTENCES: { name: string; build: (task: string) => string }[] = [
  {
    name: "the release page's 'note sent' line",
    build: (task) => copy.fixedNote.sent("Kate", task),
  },
  {
    name: "the release page's cancel blurb",
    build: (task) => copy.fixedNote.cancelBlurb(task, "Kate"),
  },
  {
    name: "the manage screen's cancel dialog title",
    build: (task) => family.cancelClaimed.title(task),
  },
];

describe("the three repaired sentences read as sentences, for every task type", () => {
  for (const { name, build } of SENTENCES) {
    for (const type of SLOT_TYPES) {
      it(`${name} — ${type}`, () => {
        const noun = taskNoun(type, null);
        const sentence = build(noun);

        // Positive control: the task name really is in the sentence. Without
        // it, the two checks below would pass on a sentence that had dropped
        // the task entirely.
        expect(sentence).toContain(noun);

        // No CAPITAL mid-sentence. This is the "you can't do School run?" bug.
        expect(sentence, `heading form leaked into: ${sentence}`).not.toContain(
          TASK_COPY[type].label,
        );
      });
    }
  }

  it("the heading and the mid-sentence form really are different strings", () => {
    // Positive control for the "no capital mid-sentence" check above: if the
    // two forms were the same string it would be unfailable.
    for (const type of SLOT_TYPES) {
      expect(TASK_COPY[type].noun, type).not.toBe(TASK_COPY[type].label);
    }
  });

  it("the three, spelled out", () => {
    expect(copy.fixedNote.sent("Kate", taskNoun("school_pickup", null))).toBe(
      "Sent — Kate has your note. You're still down for the school run.",
    );
    expect(copy.fixedNote.cancelBlurb(taskNoun("school_pickup", null), "Kate")).toContain(
      "Plans changed and you can't do the school run?",
    );
    expect(family.cancelClaimed.title(taskNoun("errand", null))).toBe("Cancel an errand?");
    expect(family.cancelClaimed.title(taskNoun("meal", null))).toBe("Cancel a meal?");
  });

  it("a hand-typed label still wins, exactly as it did", () => {
    const typed = "Bring the good sourdough";
    expect(copy.fixedNote.sent("Kate", taskNoun("meal", typed))).toBe(
      "Sent — Kate has your note. You're still down for Bring the good sourdough.",
    );
  });
});

/**
 * ── SABOTAGE LOG ─────────────────────────────────────────────────────────────
 * Each applied to the real source, the suite run, the change reverted. Every
 * mutation was confirmed present in the file before the red was believed.
 *
 * 1. ReleaseSlot passes slotLabel (the heading) where it now passes slotNoun
 *      → helperNote.test.tsx FAILS on "still down for the school run"; this
 *        file stays green, because it tests the COPY function rather than the
 *        screen. Both are needed: one proves the words, one proves the wiring.
 * 2. task-copy's school_pickup noun changed from "the school run" to
 *    "school run" (the article dropped, i.e. the old lower-cased heading)
 *      → "every mid-sentence noun carries an article" FAILS in
 *        api-server/src/lib/taskCopy.test.ts, and "the three, spelled out"
 *        FAILS here.
 * 3. task-copy's school_pickup LABEL changed to "School Run"
 *      → "every label is SENTENCE CASE" FAILS (api-server), and every
 *        per-type sentence case here FAILS on the leaked heading.
 */
