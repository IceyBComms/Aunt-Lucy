/**
 * Bug #033 — "does the helper wait?", the sent-message side.
 *
 * A lift is the one task whose size a helper cannot guess from its name.
 * Dropping someone at an appointment is a twenty-minute favour; waiting and
 * bringing them home can be half a day. Until this, nothing in the product said
 * which — so a helper could claim expecting the first and lose an afternoon.
 *
 * ⚠️ THE LABELS BELOW ARE DELIBERATELY FUNCTIONAL, NOT WARM, AND ARE EXPECTED TO
 * CHANGE AT REVIEW. Everything in this file is display text only. The stored
 * enum values ('drop_off' | 'wait' | 'pick_up') are stable and semantic, and
 * nothing anywhere keys off the words — so rewording is a one-file edit with no
 * migration and no data change. Keep it that way: never compare against a label.
 *
 * This module holds the strings Aunt Lucy SENDS (email + SMS) and the calendar
 * behaviour. The on-screen UI strings live in the frontend's own copy module,
 * artifacts/rally/src/lib/liftWaitMode.ts — the frontend/backend package split
 * is why this copy sits in exactly two files, same as item17Copy.
 *
 * Australian English throughout.
 */

/** Stored values. Stable and semantic — never rendered raw to a human. */
export type LiftWaitMode = "drop_off" | "wait" | "pick_up";

const MODES: readonly LiftWaitMode[] = ["drop_off", "wait", "pick_up"];

/**
 * Narrow an unknown value (a request body, a DB column typed as string) to a
 * LiftWaitMode, or null.
 *
 * ⚠️ NULL IS THE IMPORTANT CASE and it is every pre-existing row: "not a lift,
 * or nobody has said yet". Every caller must render NOTHING for null — no
 * clause, no label, no empty parentheses. A dated "pick up a prescription"
 * errand is a null row and must read exactly as it did before this existed.
 */
export function asLiftWaitMode(value: unknown): LiftWaitMode | null {
  return typeof value === "string" && MODES.includes(value as LiftWaitMode)
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

/**
 * The control's own options, as the setup person / recipient chooses them.
 * Mirrored in the frontend copy module; keep the two in step.
 */
export const LIFT_WAIT_MODE_LABELS: Record<LiftWaitMode, string> = {
  drop_off: "Drop off only",
  wait: "Wait and bring them home",
  pick_up: "Pick up only",
};

/**
 * How the answer reads to a HELPER, in a sentence, where it has to carry the
 * size of the ask on its own. Deliberately more explicit than the control's
 * labels: "Wait and bring them home" is what the family picked, but a helper
 * reading an email needs to understand what it costs them.
 */
export const LIFT_WAIT_MODE_HELPER_LINES: Record<LiftWaitMode, string> = {
  drop_off: "Drop off only — you're not needed for the trip home.",
  wait: "Wait and bring them home — please allow for the whole appointment.",
  pick_up: "Pick up only — someone else is handling the trip there.",
};

/**
 * The SMS wording. Kept SEPARATE from the email line and deliberately short.
 *
 * ⚠️ GSM-SAFE, ON PURPOSE. 15 of 16 live SMS bodies are already UCS-2, where a
 * single em dash costs a whole extra billed segment — so these use plain ASCII
 * only: no em dash, no en dash, no curly quotes, no ellipsis character.
 */
export const LIFT_WAIT_MODE_SMS_CLAUSES: Record<LiftWaitMode, string> = {
  drop_off: "Drop off only.",
  wait: "You'd wait and bring them home, so allow for the whole appointment.",
  pick_up: "Pick up only.",
};

// ─── Calendar behaviour ──────────────────────────────────────────────────────

/**
 * How long the diary entry blocks out, per mode.
 *
 * This is the half of bug #033 that a label alone could never fix: "lift to
 * hospital, 40 minutes" and "lift to hospital, half a day" are different diary
 * entries, and a helper who blocks out the wrong one cancels. Printing the
 * answer in the event description is not enough — the duration itself has to
 * differ, because that is what the helper's calendar actually reserves.
 *
 * ⚠️ SUGGESTED DURATIONS — Kate to bless. The shape is what matters: a waiting
 * lift must read as a substantial commitment, the other two as errands.
 */
export const LIFT_WAIT_MODE_MINUTES: Record<LiftWaitMode, number> = {
  drop_off: 45,
  wait: 240, // half a day, near enough — the point is that it isn't an hour
  pick_up: 45,
};

/**
 * The event duration for a claim, in minutes, or null to use the caller's
 * existing default. Null for an unset mode means the calendar is byte-identical
 * to what it produced before this feature existed.
 */
export function liftWaitMinutes(mode: LiftWaitMode | null): number | null {
  return mode ? LIFT_WAIT_MODE_MINUTES[mode] : null;
}

/** A short suffix for the calendar event title, or null when unset. */
export function liftWaitSummarySuffix(mode: LiftWaitMode | null): string | null {
  if (!mode) return null;
  return LIFT_WAIT_MODE_LABELS[mode].toLowerCase();
}
