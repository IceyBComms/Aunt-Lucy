import twilio from "twilio";
import { TIME_TBC_CLAUSE } from "./timeTbc";
import { logger } from "./logger";
import { measureSms } from "./smsSegments";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

const client =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

if (!client) {
  logger.warn("Twilio credentials not set — SMS sending disabled");
}

/**
 * Warn when a body will be billed as more than one segment, so long or
 * non-GSM-7 copy announces itself in the logs instead of only in the bill.
 *
 * Deliberately logs NO message content: no body, no recipient, no link. SMS
 * bodies carry names, situations and private tokens, and none of that belongs
 * in stdout. Only the shape of the message is recorded, plus the caller's label.
 *
 * Never throws and never blocks a send — a measurement problem must not stop a
 * message going out.
 */
function warnIfMultiSegment(body: string, label?: string): void {
  try {
    const { encoding, chars, segments } = measureSms(body);
    if (segments > 1) {
      logger.warn(
        { label: label ?? "unlabelled", segments, encoding, chars },
        "SMS will be billed as multiple segments",
      );
    }
  } catch {
    // Measurement is advisory only; a failure here is never a reason not to send.
  }
}

/**
 * Sends an already-rendered SMS body. The invite copy is composed in
 * inviteCopy.ts (verbatim templates), so this layer only transmits — it never
 * builds the wording. Returns true if the message was handed to Twilio.
 *
 * `label` names the copy template for the segment warning above (e.g.
 * "generalInviteSms"). It is only ever logged, never sent.
 *
 * Failures are logged and swallowed for the batch dispatcher's benefit (one bad
 * number must not abort a wave); callers that need the outcome use the return.
 */
export async function sendSms({
  to,
  body,
  label,
}: {
  to: string;
  body: string;
  label?: string;
}): Promise<boolean> {
  if (!client || !fromNumber) {
    logger.warn({ to }, "SMS not sent — Twilio not configured");
    return false;
  }
  warnIfMultiSegment(body, label);
  try {
    await client.messages.create({ body, from: fromNumber, to });
    logger.info({ to }, "SMS sent");
    return true;
  } catch (err) {
    logger.error({ err, to }, "Failed to send SMS");
    return false;
  }
}

/**
 * The invite SMS body. Extracted from the sender (bug #082) for one reason: it
 * used to be built INSIDE `sendInviteSms`, after an early return when Twilio is
 * unconfigured — so there was no way to read the copy, or measure its segment
 * cost, without actually sending a text message. Copy you cannot render is copy
 * nobody checks.
 */
export function buildInviteSmsBody({
  recipientName,
  slotTypeLabel,
  slotDate,
  slotTime,
  helperName,
  inviteUrl,
}: {
  recipientName: string;
  slotTypeLabel: string;
  slotDate: string | null;
  slotTime: string | null;
  helperName: string;
  inviteUrl: string;
}): string {
  // An undated task takes "whenever suits" in place of "on <date>", so the
  // sentence stays a sentence rather than reading "on whenever suits".
  // Bug #082 — a DATED task with no time names it rather than trailing off,
  // because silence there reads as "any time is fine".
  const timeStr =
    slotDate && slotTime
      ? ` at ${formatTime(slotTime)}`
      : slotDate
        ? `, ${TIME_TBC_CLAUSE}`
        : "";
  const whenStr = slotDate ? `on ${formatDate(slotDate)}${timeStr}` : formatDate(null);
  return (
    `Hi ${helperName}, you've been personally invited to help ${recipientName} with a ${slotTypeLabel} ${whenStr}. ` +
    `Tap to confirm: ${inviteUrl}`
  );
}

export async function sendInviteSms({
  to,
  recipientName,
  slotTypeLabel,
  slotDate,
  slotTime,
  helperName,
  inviteUrl,
}: {
  to: string;
  recipientName: string;
  slotTypeLabel: string;
  slotDate: string | null;
  slotTime: string | null;
  helperName: string;
  inviteUrl: string;
}): Promise<void> {
  if (!client || !fromNumber) {
    logger.warn({ to }, "SMS not sent — Twilio not configured");
    return;
  }

  const body = buildInviteSmsBody({
    recipientName,
    slotTypeLabel,
    slotDate,
    slotTime,
    helperName,
    inviteUrl,
  });

  try {
    await client.messages.create({ body, from: fromNumber, to });
    logger.info({ to }, "Invite SMS sent");
  } catch (err) {
    logger.error({ err, to }, "Failed to send invite SMS");
  }
}

// Undated slots are flexible offers — see the note in email.ts.
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "whenever suits";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(timeStr: string): string {
  const [h, min] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${String(min).padStart(2, "0")}${ampm}`;
}
