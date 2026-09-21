/**
 * Item 17 — the flexible/fixed default for a task, the on-screen side.
 *
 * WHY THIS EXISTS AS A SECOND FILE. The rule itself lives in the backend
 * (api-server/src/lib/slotFlexibility.ts) and is what the server actually
 * stores. But the /manage "Add a task" form has to show an ANSWER to "Does the
 * time matter?" before anything is sent, and it must be the same answer the
 * server would have chosen — otherwise the form quietly argues with the wizard:
 * a meal added during setup comes out flexible, and the identical meal added
 * from /manage comes out fixed, purely because a form had to pick a default.
 *
 * Rally's only workspace dependency is @workspace/api-client-react, so there is
 * nowhere shared to put this today and the mapping is duplicated. THAT
 * DUPLICATION IS MADE SAFE BY A TEST: api-server's `slotFlexibilityDrift.test.ts`
 * reads this file and fails if the two disagree on any task type. Same
 * arrangement, and same reason, as lib/liftWaitMode.
 *
 * If this ever moves into a shared package, delete the drift test and import
 * from there — the cross-package file read is the price of the duplication,
 * not something worth keeping for its own sake.
 *
 * ⚠️ DATED ONLY, deliberately. Every task created through either door carries a
 * date (both `validateNewTask` and this form refuse one without), so the
 * undated branch of the backend's rule — an undated errand reads as laundry
 * rather than a lift, and is flexible — can never be reached from here. The
 * drift test asserts this table against the backend's DATED answers.
 */
export type SlotFlexibility = "flexible" | "fixed";

/**
 * The default answer to "Does the time matter?", by task type, for a DATED
 * task. FLEXIBLE means a helper may nudge the time themselves (a meal, the
 * shopping). FIXED means the time is the family's fact and a helper never
 * edits it (a school run, a lift to an appointment).
 */
export const DATED_SLOT_FLEXIBILITY: Record<string, SlotFlexibility> = {
  meal: "flexible",
  shopping: "flexible",
  dog_walking: "flexible",
  // A DATED errand reads as a lift to an appointment, so it is fixed. (The
  // backend treats an undated one as laundry and makes it flexible; nothing
  // here can create an undated task.)
  errand: "fixed",
  school_pickup: "fixed",
  child_care: "fixed",
  visit: "fixed",
  other: "fixed",
};

/** The default for a dated task of this type; unknown types take the safe FIXED. */
export function defaultFlexibilityForType(slotType: string): SlotFlexibility {
  return DATED_SLOT_FLEXIBILITY[slotType] ?? "fixed";
}
