/**
 * Name formatting for message copy. Pure string work, no database, no config —
 * deliberately so, because almost every copy and notify module needs it and
 * none of them should have to pull a connection in to say "Sarah" instead of
 * "Sarah Chen".
 *
 * It lived in giftFulfilment.ts, which imports the db at module scope; that made
 * a one-line string helper impossible to use from anything that isn't already
 * database-bound. giftFulfilment re-exports it, so every existing import site
 * keeps working unchanged.
 */

/** First name only — the copy addresses people informally throughout. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}
