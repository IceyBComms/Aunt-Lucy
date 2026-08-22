/**
 * Which channel a free-text contact can actually be reached on.
 *
 * Helpers give one field ("Email or phone", ClaimDialog.tsx) and it is stored
 * as one untyped column (slots.claimed_by_contact), so every send path has to
 * work out the channel from the string. The rule used to be implicit — "no @,
 * therefore SMS" — which is unsafe here, because that column does not always
 * hold a contact at all: a trusted-invite claim falls back to the helper's NAME
 * when the invite carried neither mobile nor email (routes/invites.ts). Handing
 * "Jane Smith" to Twilio as a destination number fails, and fails silently.
 *
 * So this module answers with THREE outcomes, not two. "unknown" is a real
 * answer and callers are expected to handle it by warning, not by guessing.
 *
 * It classifies; it never rewrites. Nothing here normalises a number into
 * E.164 — numbers are stored exactly as typed everywhere else in the codebase,
 * and quietly changing one at send time would make the logs disagree with the
 * database.
 */

/** Same shape as the checks already used across the routes. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Punctuation people actually type in a number: "0412 345 678", "(02) 9876
// 5432", "+61 412-345-678", "0412.345.678". Stripped before the digit test.
const PHONE_PUNCTUATION_RE = /[\s()\-.]/g;

// After stripping, a phone number is an optional leading + and nothing but
// digits. This is the test that rejects a name: any letter survives the strip
// and fails here.
const PHONE_SHAPE_RE = /^\+?\d+$/;

// Deliberately loose bounds rather than an Australian-only pattern. The floor
// rules out obvious junk ("12345"); the ceiling is E.164's maximum. An AU
// mobile is 10 digits as typed (0412345678) or 11 in international form
// (+61412345678), and both sit comfortably inside.
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;

export type ContactChannel = "email" | "sms" | "unknown";

/** A syntactically plausible email address. */
export function isEmailAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * A syntactically plausible phone number. Conservative on purpose: it is better
 * to answer "unknown" and warn than to hand a bad string to Twilio, where the
 * failure is a swallowed log line rather than a visible error.
 */
export function isPhoneNumber(value: string): boolean {
  const stripped = value.trim().replace(PHONE_PUNCTUATION_RE, "");
  if (!PHONE_SHAPE_RE.test(stripped)) return false;
  const digits = stripped.replace(/\D/g, "").length;
  return digits >= MIN_PHONE_DIGITS && digits <= MAX_PHONE_DIGITS;
}

/**
 * The channel a contact string can be reached on, or "unknown" when it is
 * neither — an empty value, a name, or a typo'd address.
 *
 * Email is tested first: an address can never be a valid number (the @ and the
 * letters both fail the phone test), so the order only makes the intent plain.
 */
export function classifyContact(value: string | null | undefined): ContactChannel {
  const trimmed = value?.trim();
  if (!trimmed) return "unknown";
  if (isEmailAddress(trimmed)) return "email";
  if (isPhoneNumber(trimmed)) return "sms";
  return "unknown";
}
