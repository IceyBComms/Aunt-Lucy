/**
 * "Time to be confirmed" — the server's copy of #033's answer for a dated task
 * whose time nobody has set yet.
 *
 * ── Why this exists (bug #082's sweep) ──────────────────────────────────────
 * #033 decided the wording and put it in the rally package, where four screens
 * use it. The SERVER had no equivalent, so every email and SMS simply OMITTED
 * the time: the task tile said "Time to be confirmed" while the email about the
 * same task said "Thursday 3 September" and stopped. Silence there does not read
 * as "not decided yet" — it reads as "any time is fine", which is a promise
 * nobody made, and it is the exact misreading #033 wrote this string to prevent.
 *
 * ⚠️ MUST MATCH `TIME_TBC` in `artifacts/rally/src/lib/liftWaitMode.ts`. The two
 * packages cannot import from each other — rally's only workspace dependency is
 * @workspace/api-client-react — so this is duplicated on purpose, and a drift
 * test reads rally's source and fails if the strings diverge. Same problem as
 * #073's lift-wait minutes, same solution, already proven there.
 */
export const TIME_TBC = "Time to be confirmed";

/**
 * The same words mid-sentence ("on Thursday 3 September, time to be confirmed").
 *
 * DERIVED, never a second string: there is one source of truth, and lowercasing
 * is a rendering concern rather than another piece of copy to keep in step.
 */
export const TIME_TBC_CLAUSE =
  TIME_TBC.charAt(0).toLowerCase() + TIME_TBC.slice(1);
