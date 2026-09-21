/**
 * A HALF-TYPED TIME IS NOT AN EMPTY ONE (row #144, Kate's ruling 21 Sep 2026).
 *
 * WHAT THE BROWSER DOES, AND WHY IT LOOKS LIKE NOTHING
 * A 12-hour `<input type="time">` in Chromium reports `value === ""` while ANY
 * segment is blank — an hour typed but no am/pm picked reads exactly the same
 * as a box nobody has touched. It sets `validity.badInput` to say so, and that
 * flag is the ONLY difference between the two. This is the same browser
 * behaviour row #111 met from the other side, where a time that had not
 * finished being typed reported a complete, valid "HH:MM" one keystroke later.
 *
 * WHAT WENT WRONG
 * Both add-a-task doors read `newTime || null` and sent `null`. So a person who
 * typed a time and stopped one tap short got a task saved with NO time — which
 * by row #143's rule is also stored FLEXIBLE — and nothing said so. They typed
 * a time; the page saved without one; the helpers' card read "Any time that
 * day". No error, no warning, no reason to look again.
 *
 * THE RULE
 * A partly-typed time BLOCKS the save. Not coerced into a guess (that is how
 * "00:30" reached a live page in row #111), and not silently dropped (this
 * row). The person is asked to finish it or clear it, in Kate's words, and
 * keeps their focus on the box they were in.
 *
 * ⚠️ `validity` is READ-ONLY and browser-owned, so a test cannot type a half
 * time. It defines the property on a real input instead — which is exactly why
 * the predicate is a separate, pure function rather than an `if` inside a
 * handler.
 */

/**
 * ✅ Approved copy, Kate, 21 September 2026 (row #144). Shown beside the time
 * box, not in a form-level error strip: the sentence is about that one field
 * and names the two ways out of it.
 */
export const PARTIAL_TIME_MESSAGE =
  "Just check the time — pick am or pm, or clear it if any time that day is fine.";

/**
 * Is this time box showing something the browser could not turn into a value?
 *
 * `validity` is optional-chained because jsdom and older engines do not always
 * carry it, and an absent validity object means "no reason to think anything is
 * wrong" — the save goes ahead, exactly as it did before this guard existed.
 */
export function isPartialTime(el: HTMLInputElement | null | undefined): boolean {
  return !!el?.validity?.badInput;
}

/**
 * The first time box inside `root` that is half-typed, or null.
 *
 * For a screen that holds several — the setup wizard's task cards — where the
 * guard has to name WHICH box to put the message beside and the focus into.
 */
export function findPartialTimeInput(root: ParentNode | null | undefined): HTMLInputElement | null {
  if (!root) return null;
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="time"]'));
  return inputs.find((i) => isPartialTime(i)) ?? null;
}
