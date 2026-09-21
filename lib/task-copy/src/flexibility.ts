/**
 * Item 17 — the flexible/fixed default for a task, by category.
 *
 * MOVED HERE 21 Sep 2026 (row #136). It used to live in api-server, with a
 * hand-kept MIRROR in rally, because the /manage "Add a task" form has to show
 * an answer to "Does it need to be at that time?" before anything is sent, and
 * it has to be the answer the server would have chosen — otherwise the form
 * quietly argues with the wizard, and the same meal comes out flexible from one
 * door and fixed from the other. A drift test read one file from the other and
 * failed if they disagreed. Both the mirror and the drift test are deleted: one
 * source has nothing to drift from.
 *
 * FLEXIBLE means a helper may nudge the time of day themselves (a meal, a
 * grocery run). FIXED means the time is the family's fact and a helper never
 * edits it (a school run, a lift to an appointment) — they can leave a note or
 * cancel instead.
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

/**
 * The default for a DATED task of this type — what the two add-a-task forms
 * seed their answer from. Both doors only ever create dated tasks, so the
 * undated branch above can't be reached from either.
 */
export function defaultFlexibilityForType(slotType: string): SlotFlexibility {
  return defaultFlexibility(slotType, true);
}
