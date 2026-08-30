import { asOccasion, type Occasion } from "./occasion";

/**
 * A task we offer the recipient at activation. Nothing here is persisted — a
 * suggestion only becomes a slot row if the recipient keeps it and activates.
 * Someone who never activates leaves no trace beyond the gift they were sent.
 */
export interface SuggestedTask {
  /** Stable identifier so the client can send back "keep these" by key. */
  key: string;
  slotType:
    | "meal"
    | "school_pickup"
    | "child_care"
    | "errand"
    | "dog_walking"
    | "shopping"
    | "visit"
    | "other";
  /** The words the recipient reads, and what lands on the live page. */
  label: string;
  /**
   * False means the card shows no date at all — a flexible offer, claimed
   * "whenever suits". True is reserved for tasks that are meaningless without
   * a specific day (a lift to an appointment). Most tasks are flexible: a
   * recipient recovering from birth or a bereavement should not have to build
   * a calendar before they can ask for a meal.
   */
  dated: boolean;
  /**
   * Advisory only. school_pickup and child_care are forced to trusted at
   * activation regardless of what arrives from the client — see activateGift.
   */
  trustedHelpersOnly: boolean;
}

/**
 * Warm, mostly-right defaults per occasion. Hand-written rather than generated:
 * these are the first words a recipient reads about their own situation, and
 * they need to sound like a thoughtful friend guessed, not like a form.
 *
 * Australian English throughout.
 */
const SUGGESTIONS: Record<Occasion, SuggestedTask[]> = {
  new_baby: [
    { key: "nb_meal", slotType: "meal", label: "A meal dropped over", dated: false, trustedHelpersOnly: false },
    { key: "nb_shop", slotType: "shopping", label: "A grocery run", dated: false, trustedHelpersOnly: false },
    { key: "nb_hold", slotType: "other", label: "Hold the baby so I can shower", dated: false, trustedHelpersOnly: false },
    { key: "nb_wash", slotType: "other", label: "A load of washing", dated: false, trustedHelpersOnly: false },
    { key: "nb_pickup", slotType: "school_pickup", label: "School pickup for the big kids", dated: false, trustedHelpersOnly: true },
    { key: "nb_visit", slotType: "visit", label: "A short visit, no fuss", dated: false, trustedHelpersOnly: false },
  ],
  illness_recovery: [
    { key: "ir_meal", slotType: "meal", label: "A meal dropped over", dated: false, trustedHelpersOnly: false },
    { key: "ir_lift", slotType: "errand", label: "A lift to an appointment", dated: true, trustedHelpersOnly: false },
    { key: "ir_shop", slotType: "shopping", label: "A grocery run", dated: false, trustedHelpersOnly: false },
    { key: "ir_dog", slotType: "dog_walking", label: "Walk the dog", dated: false, trustedHelpersOnly: false },
    { key: "ir_script", slotType: "errand", label: "Pick up a prescription", dated: false, trustedHelpersOnly: false },
    { key: "ir_visit", slotType: "visit", label: "A short visit", dated: false, trustedHelpersOnly: false },
  ],
  // Bug #058. FOUR, not six, and no school run — a recipient with kids will
  // add it herself, and a starting list that looks like a roster defeats the
  // point of the page. The set is built around the one thing that makes this
  // occasion different: the date is known in advance, so the weeks AFTER can
  // be arranged before she is home.
  surgery: [
    { key: "sg_meal", slotType: "meal", label: "A meal, left at the door", dated: false, trustedHelpersOnly: false },
    // dated: true is what makes this a lift. isLiftCandidate() reads
    // "errand + has a date" as the marker, which is what attaches bug #033's
    // drop-off / wait / pick-up control. ONE lift task, not two, because that
    // control is now the thing that distinguishes them.
    { key: "sg_lift", slotType: "errand", label: "A lift to an appointment", dated: true, trustedHelpersOnly: false },
    { key: "sg_shop", slotType: "shopping", label: "A hand with the groceries", dated: false, trustedHelpersOnly: false },
    // "once I'm up to it" is protective, not decorative: visitors arriving too
    // early is a real problem after a procedure, and this lets her say so
    // without having to say it.
    { key: "sg_visit", slotType: "visit", label: "A short visit, once I'm up to it", dated: false, trustedHelpersOnly: false },
  ],
  // Deliberately the shortest set, and deliberately free of logistics. A
  // bereaved person opening this should not meet a roster.
  bereavement: [
    { key: "bv_meal", slotType: "meal", label: "A meal, left at the door", dated: false, trustedHelpersOnly: false },
    { key: "bv_sit", slotType: "visit", label: "Someone to sit with me", dated: false, trustedHelpersOnly: false },
    { key: "bv_everyday", slotType: "other", label: "The everyday things — bins, post, washing", dated: false, trustedHelpersOnly: false },
    { key: "bv_door", slotType: "other", label: "Answer the phone and the door for a bit", dated: false, trustedHelpersOnly: false },
  ],
  ongoing_support: [
    { key: "os_meal", slotType: "meal", label: "A meal for the week", dated: false, trustedHelpersOnly: false },
    { key: "os_shop", slotType: "shopping", label: "A regular grocery run", dated: false, trustedHelpersOnly: false },
    { key: "os_shift", slotType: "child_care", label: "Take a shift so I can get out", dated: false, trustedHelpersOnly: true },
    { key: "os_lift", slotType: "errand", label: "A lift to an appointment", dated: true, trustedHelpersOnly: false },
    { key: "os_visit", slotType: "visit", label: "A visit, just for company", dated: false, trustedHelpersOnly: false },
  ],
  // Neutral — assumes nothing about why help is needed.
  other: [
    { key: "ot_meal", slotType: "meal", label: "A meal dropped over", dated: false, trustedHelpersOnly: false },
    { key: "ot_shop", slotType: "shopping", label: "A grocery run", dated: false, trustedHelpersOnly: false },
    { key: "ot_errand", slotType: "errand", label: "An errand or a lift", dated: false, trustedHelpersOnly: false },
    { key: "ot_visit", slotType: "visit", label: "A visit", dated: false, trustedHelpersOnly: false },
  ],
};

/**
 * The suggested tasks for an occasion. A gift bought without an occasion (the
 * column is nullable) falls back to the neutral set rather than guessing.
 *
 * Bug #059 class. This used to end `?? SUGGESTIONS.other`, which silently
 * swallowed any occasion the map had no key for — including, for the length of
 * a deploy, an occasion the DATABASE had learned but this code had not. It
 * defeated the Record<Occasion, …> guard for exactly the case the guard exists
 * for. Narrowing through asOccasion() instead makes the index total: an
 * unrecognised value becomes null and takes the neutral set through the one
 * remaining `??`, and the compiler is once again the thing that catches a new
 * occasion arriving without a task set.
 */
export function suggestionsFor(occasion: Occasion | string | null): SuggestedTask[] {
  return SUGGESTIONS[asOccasion(occasion) ?? "other"];
}
