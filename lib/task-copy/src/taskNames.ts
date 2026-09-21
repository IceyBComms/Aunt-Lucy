/**
 * THE ONE TASK LIST. Every human-readable name for a task type lives here and
 * nowhere else — both packages import it (row #136, Kate's ruling 21 Sep 2026).
 *
 * ── Why this package exists ──────────────────────────────────────────────────
 * Seven files used to hold eight separate task-name tables, and that is how
 * "School Pickup", "School pickup", "school pickup" and the raw key
 * school_pickup were all live at the same time, on four screens, for one task.
 * Each table was written where it was needed, none was wrong on its own, and
 * nothing ever compared them. A drift test held the line for a while; it is
 * deleted alongside this file's arrival, because one source has nothing to
 * drift from.
 *
 * ⚠️ NEVER add a second table beside this one — not in a route, not in a
 * component, not "just for this screen". If a surface needs a form that isn't
 * here, add a COLUMN, not a table. The test file next door asserts every
 * slot_type enum value is covered and every form is non-empty.
 *
 * ⚠️ DISPLAY TEXT ONLY. The enum keys (school_pickup, child_care, …) are the
 * database's, and a rename here must never reach them or stored rows would stop
 * matching their own names.
 *
 * Emoji and icons are deliberately NOT here: they are a rally concern and stay
 * where they are.
 */

/** Every slot_type the database knows, in the order a person meets them. */
export const SLOT_TYPES = [
  "meal",
  "school_pickup",
  "child_care",
  "errand",
  "dog_walking",
  "shopping",
  "visit",
  "other",
] as const;

export type SlotType = (typeof SLOT_TYPES)[number];

/**
 * The four forms one task name genuinely needs. Lower-casing a label is not a
 * grammar — "you can't do School run?" and "still down for meal" are what that
 * produced — so each form is written out rather than derived.
 */
export interface TaskCopy {
  /**
   * A heading or a picker option: "Meal", "School run".
   *
   * SENTENCE CASE, always (Kate's ruling, 21 Sep 2026). Title Case and sentence
   * case were both in use and each old table was internally consistent; one
   * capitalisation goes with one word.
   */
  label: string;
  /**
   * Mid-sentence, WITH its article: "a meal", "the school run".
   *
   * This is the form the three broken sentences needed — "You're still down for
   * the school run.", "Plans changed and you can't do the school run?" — and
   * the reason a label alone was never enough.
   */
  noun: string;
  /**
   * Mid-sentence where an article cannot go: "A note about tomorrow's school
   * run", not "tomorrow's the school run".
   */
  shortNoun: string;
  /**
   * What the helper is doing, as a phrase that can head an email or sit in a
   * text: "Dropping off a meal", "Running an errand".
   */
  instruction: string;
}

/**
 * ⚠️ `other` is the one type the eight old tables never agreed on. They said,
 * variously: "Other", "Help", "Something else", "Helping out", "task", "the
 * task" and "this task". There was no majority to follow, so one of each form
 * is chosen here and the disagreement is recorded rather than hidden:
 *
 *   • label "Something else" — the warmest of the three picker words, and the
 *     only one that also reads on a card. ("Other" is cold; "Help" is vague.)
 *   • noun "the task" / shortNoun "task" — Kate's ruling, 16 Sep 2026: not
 *     "help", because "A note about tomorrow's help" reads wrong.
 *   • instruction "Helping out" — as the claim email has always said.
 */
export const TASK_COPY: Record<SlotType, TaskCopy> = {
  meal: {
    label: "Meal",
    noun: "a meal",
    shortNoun: "meal",
    instruction: "Dropping off a meal",
  },
  // KATE'S RULING, 21 Sep 2026 (#127): "school run", never "school pickup". A
  // pickup sounds like collecting them at the end of the day; the real task is
  // getting them there and home again. The ENUM KEY is unchanged.
  school_pickup: {
    label: "School run",
    noun: "the school run",
    shortNoun: "school run",
    instruction: "School run",
  },
  child_care: {
    label: "Child care",
    noun: "looking after the kids",
    shortNoun: "child care",
    instruction: "Looking after the kids",
  },
  errand: {
    label: "Errand",
    noun: "an errand",
    shortNoun: "errand",
    instruction: "Running an errand",
  },
  dog_walking: {
    label: "Dog walking",
    noun: "walking the dog",
    shortNoun: "dog walking",
    instruction: "Dog walking",
  },
  shopping: {
    label: "Shopping",
    noun: "the shopping",
    shortNoun: "shopping",
    instruction: "Shopping",
  },
  visit: {
    label: "Visit",
    noun: "a visit",
    shortNoun: "visit",
    instruction: "Visiting",
  },
  other: {
    label: "Something else",
    noun: "the task",
    shortNoun: "task",
    instruction: "Helping out",
  },
};

/** A stored slot_type, or `other` for anything this build doesn't know. */
function copyFor(slotType: string): TaskCopy {
  return TASK_COPY[slotType as SlotType] ?? TASK_COPY.other;
}

/**
 * The family's own wording always wins. Every accessor below takes it, and every
 * one of them prefers it — a hand-typed customLabel is what the family wrote and
 * what shows on the live page, and no default replaces it.
 */
function withCustom(customLabel: string | null | undefined, fallback: string): string {
  const typed = customLabel?.trim();
  return typed || fallback;
}

/** Heading / picker form: "Meal", "School run" — or the family's own wording. */
export function taskLabel(slotType: string, customLabel?: string | null): string {
  return withCustom(customLabel, copyFor(slotType).label);
}

/** Mid-sentence with its article: "the school run" — or the family's wording. */
export function taskNoun(slotType: string, customLabel?: string | null): string {
  return withCustom(customLabel, copyFor(slotType).noun);
}

/** Mid-sentence, no article: "school run" — or the family's own wording. */
export function taskShortNoun(slotType: string, customLabel?: string | null): string {
  return withCustom(customLabel, copyFor(slotType).shortNoun);
}

/** What the helper is doing: "Dropping off a meal" — or the family's wording. */
export function taskInstruction(slotType: string, customLabel?: string | null): string {
  return withCustom(customLabel, copyFor(slotType).instruction);
}
