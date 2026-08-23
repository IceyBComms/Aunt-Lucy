/**
 * Bug #033 — "does the helper wait?", the on-screen side.
 *
 * A lift is the one task whose size a helper cannot guess from its name.
 * Dropping someone at an appointment is a twenty-minute favour; waiting and
 * bringing them home can be half a day. Until this, nothing in the product said
 * which — so a helper could claim expecting the first and lose an afternoon.
 *
 * ⚠️ THE LABELS BELOW ARE DELIBERATELY FUNCTIONAL, NOT WARM, AND ARE EXPECTED TO
 * CHANGE AT REVIEW. Everything here is display text. The stored values
 * ('drop_off' | 'wait' | 'pick_up') are stable and semantic, and nothing keys
 * off the words — rewording is a one-file edit, no migration, no data change.
 * Never compare against a label.
 *
 * This is the single source of truth for the UI strings. The message BODIES
 * Aunt Lucy actually SENDS (SMS/email) live in the backend's own copy module,
 * api-server/src/lib/liftWaitMode.ts — the frontend/backend package split is why
 * this copy sits in exactly two files, same as item17Copy.
 *
 * Australian English throughout.
 */

/** Stored values. Stable and semantic — never rendered raw to a human. */
export type LiftWaitMode = "drop_off" | "wait" | "pick_up";

/** Display order of the three-way control. Drop-off first: it is the mildest. */
export const LIFT_WAIT_MODES: readonly LiftWaitMode[] = [
  "drop_off",
  "wait",
  "pick_up",
];

/**
 * Narrow an unknown value to a LiftWaitMode, or null.
 *
 * ⚠️ NULL IS THE IMPORTANT CASE and it is every pre-existing task: "not a lift,
 * or nobody has said yet". Every caller must render NOTHING for null — no chip,
 * no clause, no empty brackets. A dated "pick up a prescription" errand is a
 * null task and must look exactly as it did before this existed.
 */
export function asLiftWaitMode(value: unknown): LiftWaitMode | null {
  return typeof value === "string" &&
    (LIFT_WAIT_MODES as readonly string[]).includes(value)
    ? (value as LiftWaitMode)
    : null;
}

/**
 * Is this task one we should ASK the wait-or-not question about?
 *
 * A dated errand. That is not a guess — it is the convention the codebase
 * already runs on: there is no 'lift' slot type, the occasion pre-fill models
 * "A lift to an appointment" as a dated errand, and slotFlexibility.ts already
 * reads a dated errand as a lift (fixed) and an undated one as laundry
 * (flexible). This reuses that reading rather than adding a second, competing
 * definition of what a lift is.
 *
 * It cleanly separates the pre-fills too: "A lift to an appointment" is dated,
 * while "Pick up a prescription" and "An errand or a lift" are undated, so
 * neither is ever asked.
 *
 * ⚠️ This gates the CONTROL on the setup forms only. It must never gate the
 * DISPLAY of an answer: display is gated on the answer being set, so a dated
 * errand nobody answered renders exactly nothing, everywhere.
 */
export function isLiftCandidate(slotType: string, hasDate: boolean): boolean {
  return slotType === "errand" && hasDate;
}

// ─── The three labels (REVIEW-VOLATILE — change here, nowhere else) ──────────

/** The control's own options. Mirrored in the backend module; keep in step. */
export const LIFT_WAIT_MODE_LABELS: Record<LiftWaitMode, string> = {
  drop_off: "Drop off only",
  wait: "Wait and bring them home",
  pick_up: "Pick up only",
};

/**
 * The one-line hint under each option, so the person setting the task up
 * understands they are describing the SIZE of the ask, not just the logistics.
 */
export const LIFT_WAIT_MODE_HINTS: Record<LiftWaitMode, string> = {
  drop_off: "A short trip there. Someone else brings them home.",
  wait: "The big one — they stay for the whole appointment.",
  pick_up: "Just the trip home.",
};

/**
 * How the answer reads to a HELPER on a task tile, before they claim. This is
 * the string that actually fixes the bug: without it the tile shows a lift and
 * a time and nothing about whether the afternoon is gone.
 */
export const LIFT_WAIT_MODE_TILE_LINES: Record<LiftWaitMode, string> = {
  drop_off: "Drop off only",
  wait: "Waiting — allow for the whole appointment",
  pick_up: "Pick up only",
};

/**
 * The fuller sentence, for the places that are a SENTENCE rather than a pill —
 * currently the post-claim confirmation on /invite. Mirrors the wording the
 * backend sends in the confirmation email, so a helper who reads both sees the
 * same thing twice rather than two slightly different promises.
 */
export const LIFT_WAIT_MODE_HELPER_LINES: Record<LiftWaitMode, string> = {
  drop_off: "Drop off only — you're not needed for the trip home.",
  wait: "Wait and bring them home — please allow for the whole appointment.",
  pick_up: "Pick up only — someone else is handling the trip there.",
};

// ─── Shared fallbacks ────────────────────────────────────────────────────────

/**
 * Bug #033, second half: a dated task whose time nobody has set yet.
 *
 * Optional means "she hasn't said yet", not "no time matters" — so a dated task
 * with no time says so out loud rather than showing an empty space a helper
 * reads as "any time is fine".
 *
 * ⚠️ Only ever shown for a task that HAS a date. An undated task is a flexible
 * "whenever suits" offer and has no clock to confirm.
 */
export const TIME_TBC = "Time to be confirmed";

/**
 * The nudge shown on the recipient's activation screen when a lift has no time.
 * Strongly worded, deliberately NOT blocking: a woman whose hospital has not
 * told her the time yet must still be able to activate her page.
 */
export const LIFT_TIME_PROMPT =
  "Add a time if you know it — a helper needs to know when to be there. You can leave it for now and add it later.";
