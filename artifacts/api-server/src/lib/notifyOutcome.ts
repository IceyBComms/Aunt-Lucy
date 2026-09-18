/**
 * One shape for the end of every notification attempt.
 *
 * WHY THIS EXISTS
 * Bug #123. `lib/sms.ts` has wrapped Twilio in a try/catch since it was written
 * (a throw is caught, logged and returned as `false`). The email path never had
 * the equivalent: every `resend.emails.send` in `lib/email.ts` handled the
 * `{ error }` Resend RETURNS and nothing handled one THROWN. A network-level
 * rejection — a DNS blip, a socket reset, a Resend outage — therefore escaped
 * the sender entirely. Most of the call sites are fire-and-forget (`void
 * notifyRecipientOfTaskEvent(...)`, `void sendClaimConfirmationToHelper(...)`),
 * so the rejection landed nowhere: no log line, no error, and the action that
 * triggered it still reported success.
 *
 * That is what made bug #102 — a slot came back and nobody was told —
 * undiagnosable. "The send failed" and "no send was attempted" produced exactly
 * the same evidence: silence. This module makes the two different.
 *
 * THE RULE
 * Every notification attempt ends in exactly ONE logged line:
 *   • `Notification sent`    — it went.
 *   • `Notification skipped` — it was never attempted, WITH the reason.
 *   • `Notification failed`  — it was attempted and did not go, WITH the error.
 * Grep any of those three and the whole picture is there.
 *
 * WHAT NEVER REACHES THE LOGS (bug #116)
 * No tokens, no links, nothing lifted out of a URL, and no whole contact point.
 * `logger` (lib/logger.ts) redacts request headers ONLY — it has no serialiser
 * for email addresses or mobile numbers, so redaction has to happen here, at
 * the point of writing. A destination is logged as its domain (email) or its
 * last three digits (mobile): enough to match a line against a person you
 * already know about, useless to someone reading the log cold.
 */
import { logger } from "./logger";

export type NotifyChannel = "email" | "sms";

/** Identifies an attempt without identifying the person. */
export interface NotifyMeta {
  /** Which message this is — e.g. "giftDelivery". Never personal data. */
  label: string;
  channel: NotifyChannel;
  /** The destination. Redacted by this module before anything is written. */
  to: string | string[] | null | undefined;
  /** The page it concerns, when the caller knows it. The id, never the slug. */
  pageId?: string | null;
  /**
   * Anything else worth having on the line — a slot id, a batch size. Ids and
   * counts only: this goes straight into the log, so nothing personal and
   * nothing lifted out of a URL belongs here.
   */
  detail?: Record<string, unknown>;
}

/** A transport that rejected rather than returning an error. */
export interface TransportFailure {
  name: string;
  message: string;
}

/** `sarah@example.com` → `…@example.com`. The person is gone, the domain isn't. */
export function redactEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 1 || at === address.length - 1) return "…";
  return `…@${address.slice(at + 1)}`;
}

/** `+61 412 345 789` → `…789`. Enough to match a number you already hold. */
export function redactMobile(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 3) return "…";
  return `…${digits.slice(-3)}`;
}

/**
 * Redact a destination without being told which kind it is. An "@" decides it:
 * anything else is treated as a number, and a contact that is really a NAME
 * (the fallback case claimNotify.ts warns about) keeps none of its letters.
 */
export function redactContact(value: string): string {
  return value.includes("@") ? redactEmail(value) : redactMobile(value);
}

function redactDestination(to: NotifyMeta["to"]): string {
  if (to == null) return "none";
  if (Array.isArray(to)) return to.map(redactContact).join(", ");
  return redactContact(to);
}

/** A message for the log line. What of the error object is kept: see safeError. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "unknown error";
}

// An email address anywhere in a string.
const EMAIL_IN_TEXT = /[^\s<>()"'`,;:]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
// A phone number anywhere in a string: 8–15 digits, optionally led by "+",
// optionally split by single spaces. Dashes and dots are NOT separators, so a
// date (2026-09-18), an IP or a version string is left alone; Twilio's own
// error codes (21211) are too short to match.
const MOBILE_IN_TEXT = /\+?\d(?: ?\d){7,14}/g;

/**
 * Take every contact point out of free text — a provider's error message, a
 * reason string. Redacted the same way as the `to` field, so the line still
 * lines up with itself.
 */
export function scrubContactPoints(text: string): string {
  return text
    .replace(EMAIL_IN_TEXT, (_m, domain: string) => `…@${domain}`)
    .replace(MOBILE_IN_TEXT, (m) => redactMobile(m));
}

/**
 * What of a provider's error is allowed onto the line.
 *
 * NEVER log the error object itself. Checked against real errors on 18
 * September 2026 (PR #127 follow-up A):
 *   • Twilio's 21211 message quotes the number back in full — "The 'To' number
 *     +61… is not a valid phone number." — and pino's serialiser copies it into
 *     both `message` and `stack`.
 *   • A Twilio NETWORK failure throws axios's error, and pino copies every
 *     enumerable field of it: `config.data` (the whole SMS body, invite link and
 *     token included, plus the To number) and `config.headers.Authorization` —
 *     the Twilio account SID and auth token, base64'd, which is not encryption.
 *   • Resend's errors are plain `{ statusCode, name, message }` and did not echo
 *     the recipient in a real rejected send, but nothing promises they never will.
 * So: a whitelist of the diagnostic fields, every string scrubbed of contact
 * points, and no stack, config, request, response or `details`.
 */
export function safeError(err: unknown): Record<string, unknown> {
  if (err == null || typeof err !== "object") {
    return { message: scrubContactPoints(describeError(err)) };
  }
  const e = err as Record<string, unknown>;
  const out: Record<string, unknown> = {
    type: err.constructor?.name ?? "unknown",
    message: scrubContactPoints(describeError(err)),
  };
  if (typeof e.name === "string") out.name = e.name;
  for (const key of ["status", "statusCode", "code"] as const) {
    const v = e[key];
    if (typeof v === "number") out[key] = v;
    else if (typeof v === "string") out[key] = scrubContactPoints(v);
  }
  // Twilio's link to the error's docs page — a fixed URL per error code.
  if (typeof e.moreInfo === "string" && e.moreInfo.startsWith("https://www.twilio.com/docs/")) {
    out.moreInfo = e.moreInfo;
  }
  return out;
}

function context(meta: NotifyMeta): Record<string, unknown> {
  return {
    label: meta.label,
    channel: meta.channel,
    to: redactDestination(meta.to),
    ...(meta.pageId ? { pageId: meta.pageId } : {}),
    ...(meta.detail ?? {}),
  };
}

/** It went. */
export function notifySent(meta: NotifyMeta): void {
  logger.info(context(meta), "Notification sent");
}

/**
 * It was never attempted. The reason is mandatory — a skip with no reason is
 * the silence this module exists to remove.
 */
export function notifySkipped(meta: NotifyMeta, reason: string): void {
  logger.warn({ ...context(meta), reason }, "Notification skipped");
}

/**
 * It was attempted and did not go. The error goes through safeError — never onto
 * the line as-is — and the reason is scrubbed, because callers build it from
 * the provider's own message.
 */
export function notifyFailed(meta: NotifyMeta, err: unknown, reason?: string): void {
  logger.error(
    {
      ...context(meta),
      // Deliberately NOT the `err` key: pino runs its error serialiser on `err`,
      // which re-adds a stack and overwrites `type`. This key is written as-is.
      error: safeError(err),
      reason: scrubContactPoints(reason ?? describeError(err)),
    },
    "Notification failed",
  );
}

/**
 * Run one send and make sure it ends in a line either way.
 *
 * The send is expected to answer in Resend's shape — `{ error }` — and a THROWN
 * error is converted into that same shape, so every caller's existing `if
 * (error)` branch handles a network rejection identically to a provider
 * refusal. That is deliberate: each sender in email.ts already has its own
 * failure policy (some throw on to their caller so a cron marks a row failed,
 * some return `false`, some log and carry on), and those policies are load-
 * bearing. This wrapper does not overrule them — it makes sure a thrown error
 * reaches them instead of escaping into a void'd promise.
 *
 * Never throws.
 */
export async function attemptSend<E extends { message: string }>(
  meta: NotifyMeta,
  send: () => Promise<{ error: E | null }>,
): Promise<{ error: E | TransportFailure | null }> {
  let result: { error: E | null };
  try {
    result = await send();
  } catch (err) {
    notifyFailed(meta, err, `the ${meta.channel} transport threw: ${describeError(err)}`);
    // WHY THIS RETURNS THE ERROR INSTEAD OF RETURNING false (OR SWALLOWING IT)
    // The obvious rule — "a failed send returns false and never throws past
    // its caller" — is wrong here, and applying it would reintroduce the bug
    // this module exists to fix. Each sender in email.ts keeps its OWN failure
    // policy, and some of them throw ON PURPOSE, because their caller depends
    // on the throw:
    //   • routes/internal.ts:168 — the gift-delivery cron. sendGiftDeliveryEmail
    //     throwing is what stamps the gift_messages row `failed` so it retries.
    //     If this returned false instead, a failed $59 gift delivery would be
    //     recorded as delivered and never retried.
    //   • routes/auth.ts:54 — sendMagicLink throwing is what turns into the 503
    //     the organiser sees. Swallowed, sign-in would claim "check your email"
    //     for an email that never left.
    // So a thrown transport error is converted into the SAME { error } shape a
    // provider refusal takes, and handed back. Each sender's `if (error)` then
    // does what it always did — throw, return false, or carry on. What this
    // wrapper guarantees is only that the error REACHES that branch, and gets
    // its one log line, instead of escaping into a void'd promise. Two
    // philosophies in one file need a note; this is it.
    return {
      error: { name: "transport_error", message: scrubContactPoints(describeError(err)) },
    };
  }

  if (result.error) {
    notifyFailed(meta, result.error, result.error.message);
    return result;
  }

  notifySent(meta);
  return { error: null };
}

/**
 * The same guarantee for a send that answers with a plain boolean (Twilio, and
 * the helper-level senders that wrap it). Returns false on a throw.
 */
export async function attemptBooleanSend(
  meta: NotifyMeta,
  send: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await send();
  } catch (err) {
    notifyFailed(meta, err, `the ${meta.channel} transport threw: ${describeError(err)}`);
    return false;
  }
  notifySent(meta);
  return true;
}
