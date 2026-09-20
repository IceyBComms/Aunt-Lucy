/**
 * Is a task's date today, tomorrow, or neither — for the family reading it?
 *
 * TIMEZONE: Australia/Sydney. Pages carry no timezone of their own, and every
 * date the product prints is already pinned there (whenLabel in item17Copy.ts).
 * Melbourne, Canberra and Hobart share it all year. Brisbane is an hour behind
 * during daylight saving; Adelaide half an hour; Perth two or three hours. For
 * a note left late in the evening in Perth, "tomorrow" can therefore be
 * computed a Sydney-midnight early. Recorded, not solved: that needs a
 * per-page timezone.
 *
 * Pure, with the clock passed in, so the midnight and daylight-saving edges
 * are tested rather than trusted.
 *
 * Calendar arithmetic, not "now + 24 hours": the day daylight saving ends is 25
 * hours long, and now+24h from 00:30 that morning lands on the SAME date — so
 * the old isTodayOrTomorrowSydney did not recognise tomorrow for that hour.
 * (Checked: 00:30 on 5 April 2026 gave "tomorrow" = 2026-04-05.)
 */

export type SoonDay = "today" | "tomorrow";

const TZ = "Australia/Sydney";

/** YYYY-MM-DD for `now`, as a wall calendar in Sydney shows it. */
export function sydneyDate(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** The YYYY-MM-DD after `ymd`, by the calendar (no clock involved). */
function nextDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

export function soonDay(slotDate: string | null, now: Date = new Date()): SoonDay | null {
  if (!slotDate) return null;
  const today = sydneyDate(now);
  if (slotDate === today) return "today";
  if (slotDate === nextDate(today)) return "tomorrow";
  return null;
}

/**
 * "HH:MM:SS" for `now`, as a wall clock in Sydney shows it — the time-of-day
 * sibling of sydneyDate above, and used for exactly one question: on a task
 * dated TODAY, has its time been and gone? (lib/pageClosure.ts).
 *
 * en-GB with hour12 false is chosen for its stable 24-hour "HH:MM:SS" output,
 * which sorts lexicographically against a stored slots.slot_time. The same
 * daylight-saving caveat recorded at the top of this file applies.
 */
export function sydneyTime(now: Date): string {
  return now.toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false });
}
