/**
 * "Is this a valid new task?" — asked in exactly one place.
 *
 * WHY THIS FILE EXISTS
 * There are now TWO ways a task gets added to a page: the setup wizard
 * (POST /organiser/pages/:pageId/slots, an account holder mid-setup) and the
 * running page (POST /manage/:token/tasks, a recipient or manager with no
 * account at all — Part C, 21 September 2026). They are different doors into
 * the same act, and the rules that matter are identical on both:
 *
 *   • a school run or minding the kids is ALWAYS trusted-only, whoever adds it
 *   • a lift has to say whether the helper waits, and has to carry a time
 *   • dietary notes and a headcount belong to a meal and nothing else
 *
 * Kate's instruction, and the reason this is a module rather than a copied
 * block: two versions of "is this task valid" will drift, and the drifted one
 * is the one a family hits. A sensitivity rule that holds on one door and not
 * the other is not a cosmetic bug — it is a stranger being shown the task that
 * says which school, at what time.
 *
 * NO DATABASE IN HERE, deliberately — the same split as lib/setupPersonGrant
 * and lib/notifyTargets, for the same reason. The decision is pure, so it can
 * be exercised without a live Neon branch, and the two routes can be proven to
 * give the same answers to the same inputs.
 *
 * This validates CREATION only. Editing an existing task is a patch — every
 * field optional, sensitivity deliberately not editable — and stays where it
 * is, in the PATCH handler.
 */
import { defaultFlexibility, type SlotFlexibility } from "./slotFlexibility";
import { asLiftWaitMode, isLiftCandidate, type LiftWaitMode } from "./liftWaitMode";

/** Every slot type a task may be. The enum's own values, in the DB's order. */
export const VALID_SLOT_TYPES = [
  "meal",
  "school_pickup",
  "child_care",
  "errand",
  "dog_walking",
  "shopping",
  "visit",
  "other",
] as const;

/**
 * The two types that are trusted-only whatever anyone ticks.
 *
 * Both hand a helper a child. There is no form state, and no door, in which
 * that becomes an "anyone can help" task — so this is forced in the validator
 * rather than trusted to the UI, which is the half a scripted request skips.
 */
export const SENSITIVE_SLOT_TYPES = ["school_pickup", "child_care"] as const;

export function isSensitiveSlotType(slotType: string): boolean {
  return (SENSITIVE_SLOT_TYPES as readonly string[]).includes(slotType);
}

/** Raw, client-shaped input. Every field is whatever arrived over the wire. */
export interface NewTaskInput {
  slotType?: unknown;
  customLabel?: unknown;
  slotDate?: unknown;
  slotTime?: unknown;
  notes?: unknown;
  trustedHelpersOnly?: unknown;
  dietaryNotes?: unknown;
  headcount?: unknown;
  liftWaitMode?: unknown;
  /**
   * "Does the time matter?" — the answer, when the form asked it.
   *
   * Omitted (the setup wizard, which does not ask) falls back to the category
   * default, so the two doors still give identical answers to identical input.
   * An unrecognised value is ignored rather than refused: this is a preference,
   * not a fact, and the default it falls back to is always safe.
   */
  flexibility?: unknown;
}

/** A clean row, ready to insert. Nothing here needs re-checking downstream. */
export interface NewTaskValues {
  slotType: (typeof VALID_SLOT_TYPES)[number];
  customLabel: string | null;
  slotDate: string;
  slotTime: string | null;
  liftWaitMode: LiftWaitMode | null;
  notes: string | null;
  trustedHelpersOnly: boolean;
  dietaryNotes: string | null;
  headcount: number | null;
  flexibility: SlotFlexibility;
}

export type NewTaskResult =
  | { ok: true; values: NewTaskValues }
  | { ok: false; error: string };

/**
 * Coerce a client-supplied headcount into a sane positive integer, or null.
 * Accepts a number or a numeric string (a form input often sends the latter).
 * Caps at 100 — a meal train, not a wedding — so a scripted request can't stash
 * an absurd value. Anything non-positive or unparseable becomes null (the field
 * is always optional).
 */
export function parseHeadcount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  const rounded = Math.floor(n);
  if (rounded < 1) return null;
  return Math.min(rounded, 100);
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validate and normalise a new task. The error strings are the ones already
 * shipped on the organiser path — they are approved copy a person actually
 * reads, so they are reproduced here rather than reworded, and BOTH doors now
 * answer with them.
 */
export function validateNewTask(input: NewTaskInput): NewTaskResult {
  const slotType = typeof input.slotType === "string" ? input.slotType : "";
  if (!slotType || !(VALID_SLOT_TYPES as readonly string[]).includes(slotType)) {
    return { ok: false, error: "A valid slot type is required." };
  }

  const slotDate = asTrimmedString(input.slotDate);
  if (!slotDate || !/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
    return { ok: false, error: "A valid date (YYYY-MM-DD) is required." };
  }

  const slotTime = asTrimmedString(input.slotTime) || null;

  // Bug #033 — the wait-or-not answer, lift-only. A task created through either
  // door is ALWAYS dated (the check above refuses otherwise), so every errand
  // here is a lift candidate. A mode sent on any other type is dropped, never
  // stored: a wait-or-not question on a meal is nonsense.
  const isLift = isLiftCandidate(slotType, true);
  const waitMode = isLift ? asLiftWaitMode(input.liftWaitMode) : null;

  // BOTH are REQUIRED when a task is being CREATED by the person who knows the
  // details — the setup person or whoever is running the page. That is not the
  // same bar as the recipient's activation screen, where the same two are
  // strongly prompted but never block, because someone whose hospital hasn't
  // given them a time yet must still be able to make their page live.
  if (isLift && !waitMode) {
    return {
      ok: false,
      error:
        "For a lift, say whether the helper waits — it's the difference between a short trip and half a day.",
    };
  }
  if (isLift && !slotTime) {
    return {
      ok: false,
      error: "A lift needs a time so the helper knows when to be there.",
    };
  }

  // Forced, not offered. See SENSITIVE_SLOT_TYPES above.
  const trustedHelpersOnly =
    isSensitiveSlotType(slotType) || input.trustedHelpersOnly === true;

  // Meal detail fields (bug #006) are meal-only — never persisted on any other
  // type, so a stray dietary note or headcount on a dog walk can't sneak in.
  const isMeal = slotType === "meal";
  const dietaryNotes = isMeal
    ? asTrimmedString(input.dietaryNotes).slice(0, 500) || null
    : null;
  const headcount = isMeal ? parseHeadcount(input.headcount) : null;

  return {
    ok: true,
    values: {
      slotType: slotType as NewTaskValues["slotType"],
      customLabel: asTrimmedString(input.customLabel).slice(0, 120) || null,
      slotDate,
      slotTime,
      liftWaitMode: waitMode,
      notes: asTrimmedString(input.notes).slice(0, 500) || null,
      trustedHelpersOnly,
      dietaryNotes,
      headcount,
      // Item 17. Whoever is adding it may say; otherwise the category default
      // stands. A created task is always dated, so a dated errand reads as a
      // lift → fixed; a meal stays flexible regardless. The page runner can
      // flip it later on /manage either way.
      flexibility:
        input.flexibility === "flexible" || input.flexibility === "fixed"
          ? input.flexibility
          : defaultFlexibility(slotType, true),
    },
  };
}
