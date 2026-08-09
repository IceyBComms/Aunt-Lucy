/**
 * Item 17 — the flexible/fixed default for a task, by category.
 *
 * FLEXIBLE means a helper may nudge the time of day themselves (a meal, a
 * grocery run). FIXED means the time is the family's fact and a helper never
 * edits it (a school pickup, a lift to an appointment) — they can leave a note
 * or bow out instead.
 *
 * The mapping follows the brief's category rules. Two readings were made where
 * the brief was ambiguous, both toward the conservative FIXED:
 *
 *   • `errand` covers BOTH "laundry/errands → flexible" and
 *     "lifts/appointments → fixed" in the brief, and the occasion pre-fill
 *     models a lift-to-an-appointment as a *dated* errand. So a dated errand is
 *     read as a lift → FIXED; an undated errand is read as laundry → FLEXIBLE.
 *   • `visit` is listed under fixed in the brief, so it is FIXED even though the
 *     pre-fill offers visits undated.
 *   • `dog_walking` is not named in the brief; it sits naturally with meals /
 *     errands (a helper can nudge the walk time), so it is FLEXIBLE.
 *   • `other` and anything unknown default to FIXED — the conservative choice.
 *
 * The setup person / page runner can flip the flag per task afterwards; the
 * recipient is never asked to set it.
 */
export type SlotFlexibility = "flexible" | "fixed";

export function defaultFlexibility(
  slotType: string,
  hasDate: boolean,
): SlotFlexibility {
  switch (slotType) {
    case "meal":
    case "shopping":
    case "dog_walking":
      return "flexible";
    case "errand":
      // Dated errand = a lift to an appointment (fixed); undated = laundry etc.
      return hasDate ? "fixed" : "flexible";
    case "school_pickup":
    case "child_care":
    case "visit":
    case "other":
    default:
      return "fixed";
  }
}
