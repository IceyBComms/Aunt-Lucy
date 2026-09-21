/**
 * THE ONE DATE AND TIME FORMAT (row #139, Kate's ruling 21 Sep 2026).
 *
 * Before this file, one product wrote a task's when three ways at once:
 * "Sunday, August 23 • 3:00 PM" on the public page, "Sunday 23 August · 3:00pm"
 * on the manage screen, "Sunday 23 August 2026 at 6:00 pm" in the claim email.
 * Kate's ruling was that the format itself was not the problem — CONSISTENCY
 * was. So there is one formatter, here, and every screen and every message uses
 * it.
 *
 * THE FORMAT
 *   Date   "Tuesday 22 September"     — weekday, day, month. NO COMMA.
 *          "Tuesday 22 September 2027" — the year ONLY when it isn't this year.
 *   Time   "3:00pm"                    — lower case, no space.
 *   Card   "Tuesday 22 September · 3:00pm"      (a line of its own)
 *   Line   "Tuesday 22 September at 3:00pm"     (inside a sentence)
 * Same words either way; only the join differs.
 *
 * ⚠️ SMS NEVER USES THE CARD FORM. "·" is not in the GSM-7 alphabet, and one of
 * them flips a whole text into UCS-2 — per-segment capacity drops from 153
 * characters to 67, and a two-segment message becomes four. Every SMS builder
 * uses `taskWhenSentence` / `taskWhenClause`. A test sweeps every SMS body in
 * the repo for "·" and fails if one appears.
 *
 * ⚠️ NO TIMEZONE CONVERSION. A task's date and time are stored as plain values
 * — "2026-09-22", "15:00" — entered as local Australian wall-clock by the
 * family and read as local wall-clock by every helper. So they are formatted AS
 * WRITTEN, by splitting the string, with no Date parsing that could shift a
 * late-evening task onto the previous day. The only clock this file consults is
 * "what year is it in Australia right now", for the year rule.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * A dated task with no time (row #143, Kate's ruling 21 Sep 2026).
 *
 * This REPLACES "Time to be confirmed", which is gone from the product. Those
 * words promised a confirmation nobody was going to send — neither the family
 * nor the helper knew it was them — and that is a conduit-rule breach as well
 * as a bad sentence. "Any time that day" is a fact about the task: there is no
 * set time, and any time works.
 */
export const ANY_TIME_THAT_DAY = "Any time that day";

/**
 * The same words mid-sentence ("on Tuesday 22 September, any time that day").
 *
 * DERIVED, never a second string — lowercasing is a rendering concern, not
 * another piece of copy to keep in step. This is the shape the old TIME_TBC
 * pair had, and it was the one thing about it worth keeping.
 */
export const ANY_TIME_THAT_DAY_CLAUSE =
  ANY_TIME_THAT_DAY.charAt(0).toLowerCase() + ANY_TIME_THAT_DAY.slice(1);

/**
 * A task with no DATE at all is a flexible offer rather than an appointment —
 * the helper picks the day when they claim it. Words, not a fabricated date.
 * (Different thing from an undated TIME: see ANY_TIME_THAT_DAY above.)
 */
export const WHENEVER_SUITS = "Whenever suits";

/** The same words mid-sentence. Derived, for the same reason as above. */
export const WHENEVER_SUITS_CLAUSE =
  WHENEVER_SUITS.charAt(0).toLowerCase() + WHENEVER_SUITS.slice(1);

/** The card join. NEVER in an SMS — see the warning at the top of this file. */
export const CARD_JOIN = " · ";

/** The current year where the reader is, not where the server is. */
function australianYear(now: Date): number {
  // en-CA gives "YYYY-MM-DD", so the year is the first four characters.
  return Number(now.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }).slice(0, 4));
}

/**
 * "Tuesday 22 September", plus the year when it isn't this year.
 *
 * Takes the stored plain date, "YYYY-MM-DD". `now` is injectable so the year
 * rule and its New Year's edge are testable without moving the clock.
 */
export function formatTaskDate(slotDate: string, now: Date = new Date()): string {
  const [y, m, d] = slotDate.slice(0, 10).split("-").map(Number);
  // Built in UTC purely to ask which weekday it is — no local time is involved,
  // so there is no day to shift.
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const base = `${weekday} ${d} ${MONTHS[m - 1]}`;
  return y === australianYear(now) ? base : `${base} ${y}`;
}

/** "3:00pm" — lower case, no space. Tolerant of a stored "HH:MM:SS". */
export function formatTaskTime(slotTime: string): string {
  const [h, min] = slotTime.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${String(min).padStart(2, "0")}${ampm}`;
}

/**
 * The card form: "Tuesday 22 September · 3:00pm", "Tuesday 22 September · Any
 * time that day", or "Whenever suits" when there is no date.
 *
 * For a line of its own — a task card, the manage list. NOT for a sentence, and
 * never for an SMS.
 */
export function taskWhenCard(
  slotDate: string | null,
  slotTime: string | null,
  now: Date = new Date(),
): string {
  if (!slotDate) return WHENEVER_SUITS;
  const date = formatTaskDate(slotDate, now);
  return `${date}${CARD_JOIN}${slotTime ? formatTaskTime(slotTime) : ANY_TIME_THAT_DAY}`;
}

/**
 * The sentence form: "Tuesday 22 September at 3:00pm", "Tuesday 22 September,
 * any time that day", or "whenever suits" when there is no date.
 *
 * Same words as the card, joined for reading inside a sentence. This is the
 * only form an SMS may use.
 */
export function taskWhenSentence(
  slotDate: string | null,
  slotTime: string | null,
  now: Date = new Date(),
): string {
  if (!slotDate) return WHENEVER_SUITS_CLAUSE;
  const date = formatTaskDate(slotDate, now);
  return slotTime
    ? `${date} at ${formatTaskTime(slotTime)}`
    : `${date}, ${ANY_TIME_THAT_DAY_CLAUSE}`;
}

/**
 * The sentence form with its preposition: "on Tuesday 22 September at 3:00pm".
 *
 * An undated task is already a phrase and takes no "on", or the sentence reads
 * "on whenever suits".
 */
export function taskWhenClause(
  slotDate: string | null,
  slotTime: string | null,
  now: Date = new Date(),
): string {
  const when = taskWhenSentence(slotDate, slotTime, now);
  return slotDate ? `on ${when}` : when;
}

/**
 * The SHORT form: "12 August", or "12 August 2025" when it isn't this year.
 *
 * For a date that is context rather than an appointment — "started 12 August",
 * "Closed on 18 September" on the dashboard cards. A weekday there would make
 * an already-long line longer, and a year is the whole point when a draft has
 * been sitting since last year.
 *
 * Takes a full ISO TIMESTAMP (created_at, closed_at), which is a real instant
 * rather than a plain date, so it is read in the runtime's own timezone — the
 * dashboard is the browser's, and that is what the reader means by "today".
 */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const thisYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    ...(thisYear ? {} : { year: "numeric" }),
  });
}
