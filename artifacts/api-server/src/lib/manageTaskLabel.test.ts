/**
 * A task on the family's own screen is never a raw enum key (#127).
 *
 * WHAT WENT WRONG. routes/manage.ts built `label: s.customLabel ?? s.slotType`,
 * so any task the family never hand-typed a label for arrived at Manage.tsx as
 * "dog_walking" or "errand" — and was rendered verbatim in six places: the
 * claimed list, the task card, the Cancel button's aria-label, the invite
 * picker, the edit form's placeholder and the cancel dialog's title. The same
 * task's claim email said "Dropping off a meal" the same morning, because the
 * emails go through a lookup and this payload did not.
 *
 * THE FIX IS THE LOOKUP, NOT A TABLE OF STRINGS IN THE ROUTE. taskName() in
 * item17Copy.ts is the one the sent messages already use, which is what makes
 * Kate's 21 Sep rename ("school pickup" → "school run") a one-file change.
 *
 * Two halves, both needed: the lookup behaves (below), and the route actually
 * calls it (manageTaskLabelDrift.test.ts).
 */
import { describe, expect, it } from "vitest";
import { taskName, taskLabel } from "./item17Copy";

/** Every value the slot_type enum can hold. */
const EVERY_SLOT_TYPE = [
  "meal",
  "school_pickup",
  "child_care",
  "errand",
  "dog_walking",
  "shopping",
  "visit",
  "other",
];

describe("an unlabelled task reaches the screen as a human name", () => {
  for (const slotType of EVERY_SLOT_TYPE) {
    it(`${slotType} → a display name with no underscore and no raw key`, () => {
      const name = taskName(slotType, null);
      // Positive control: something was actually returned.
      expect(name.length).toBeGreaterThan(0);
      // The fault, exactly: an underscore on the family's screen.
      expect(name).not.toContain("_");
      // A single-word type ("meal", "errand") legitimately reads the same as
      // its key. The multi-word ones are where the leak was visible, and they
      // must not come back unchanged.
      if (slotType.includes("_")) expect(name).not.toBe(slotType);
    });
  }

  it("the names themselves, so a silent reword is a failing test", () => {
    expect(EVERY_SLOT_TYPE.map((t) => taskName(t, null))).toEqual([
      "meal",
      // Kate's ruling, 21 Sep 2026 (#127) — a "pickup" sounds like collecting
      // them at the end of the day; the task is there AND home again.
      "school run",
      "child care",
      "errand",
      "dog walking",
      "shopping",
      "visit",
      "task",
    ]);
  });
});

describe("the edges", () => {
  it("an unknown slot type falls back to a word, never to the key", () => {
    // A type added to the DB enum before this table catches up.
    expect(taskName("lawn_mowing", null)).toBe("task");
    expect(taskName("lawn_mowing", null)).not.toContain("_");
    expect(taskLabel("lawn_mowing", null)).toBe("the task");
  });

  it("a hand-typed label still wins — the positive control for the fallback", () => {
    expect(taskName("dog_walking", "Walk Pookey before lunch")).toBe("Walk Pookey before lunch");
    expect(taskName("school_pickup", "Get the big kids")).toBe("Get the big kids");
  });

  it("a whitespace-only label is treated as no label, not as a blank task name", () => {
    expect(taskName("meal", "   ")).toBe("meal");
  });
});

describe("the school_pickup rename is display text only", () => {
  it("both forms say 'school run', and neither says 'school pickup'", () => {
    expect(taskName("school_pickup", null)).toBe("school run");
    expect(taskLabel("school_pickup", null)).toBe("the school run");
    expect(taskName("school_pickup", null)).not.toContain("pickup");
    expect(taskLabel("school_pickup", null)).not.toContain("pickup");
  });

  it("the ENUM KEY is untouched — the lookup is still keyed on school_pickup", () => {
    // If the key had been renamed too, this would fall through to "task" and
    // every stored row would lose its name.
    expect(taskName("school_pickup", null)).not.toBe("task");
  });
});
