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
/**
 * Bug #073 — how long the helper's calendar is ACTUALLY blocked.
 *
 * ⚠️ MUST MATCH `LIFT_WAIT_MODE_MINUTES` in
 * `artifacts/api-server/src/lib/liftWaitMode.ts`. A drift test in the
 * api-server suite reads THIS file and fails if the two disagree, because a
 * mismatch is not a cosmetic bug: the tile would promise the helper one thing
 * while their diary reserved another.
 *
 * Duplicated rather than shared because rally's only workspace dependency is
 * @workspace/api-client-react — there is no shared home for this yet. The test
 * is what makes the duplication safe.
 */
export const LIFT_WAIT_MODE_MINUTES: Record<LiftWaitMode, number> = {
  drop_off: 60,
  wait: 240,
  pick_up: 60,
};

/** "4 hours" / "an hour" / "90 minutes" — a duration a person would say aloud. */
export function approxDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return "an hour";
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${(minutes / 60).toFixed(1).replace(/\.0$/, "")} hours`;
}

/**
 * Bug #073 — the wait pill now states the duration the calendar already blocks.
 *
 * It used to read "Waiting — allow for the whole appointment" and never say how
 * long, even though the system already knew: #033 reserves 240 minutes for a
 * waiting lift. So the helper's CALENDAR told them half a day was gone while
 * the tile they actually read before claiming told them nothing. The
 * information existed and was being withheld from the one person who needed it.
 *
 * Derived from the constant above rather than typed out, so the tile and the
 * diary entry cannot drift apart — which is the whole fault this fixes.
 *
 * Only the wait line changes. Drop-off and pick-up are short, self-evident and
 * were never what Kate hit.
 */
export const LIFT_WAIT_MODE_TILE_LINES: Record<LiftWaitMode, string> = {
  drop_off: "Drop off only",
  wait: `Waiting — allow up to about ${approxDuration(LIFT_WAIT_MODE_MINUTES.wait)}`,
  pick_up: "Pick up only",
};

/**
 * The tile line for a lift, given whether the task actually has a time yet.
 *
 * Bug #082's sweep found the contradiction this resolves: the pill renders on
 * the wait answer ALONE, so a waiting lift with no time promised "allow up to
 * about 4 hours" while the calendar — which cannot place a timed block without
 * a time — reserved the WHOLE DAY as an all-day event. #073 exists precisely so
 * the tile and the diary entry agree, and with no time they did not.
 *
 * ⚖️ Kate's ruling, 30 Aug: KEEP THE DURATION, NAME THE UNCERTAINTY. Softening
 * to "allow for the whole appointment" would mean the LEAST-INFORMED case gets
 * the LEAST information, which is backwards — the four hours is still true, it
 * is the WHEN that is unknown. Saying both also agrees with the all-day
 * calendar entry instead of contradicting it.
 *
 * Only the wait line changes: drop-off and pick-up state no duration, so they
 * have no promise to qualify.
 */
export function liftWaitTileLine(mode: LiftWaitMode, hasTime: boolean): string {
  const base = LIFT_WAIT_MODE_TILE_LINES[mode];
  if (mode !== "wait" || hasTime) return base;
  return `${base}, once the time is confirmed`;
}

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
