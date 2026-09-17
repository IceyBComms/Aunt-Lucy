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

/** A message for the log line. The error object itself goes in `err`. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown error";
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

/** It was attempted and did not go. */
export function notifyFailed(meta: NotifyMeta, err: unknown, reason?: string): void {
  logger.error(
    { ...context(meta), err, reason: reason ?? describeError(err) },
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
    return { error: { name: "transport_error", message: describeError(err) } };
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
