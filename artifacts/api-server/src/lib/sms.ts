import twilio from "twilio";
import { logger } from "./logger";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

const client =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

if (!client) {
  logger.warn("Twilio credentials not set — SMS sending disabled");
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

  // An undated task takes "whenever suits" in place of "on <date>", so the
  // sentence stays a sentence rather than reading "on whenever suits".
  const timeStr = slotDate && slotTime ? ` at ${formatTime(slotTime)}` : "";
  const whenStr = slotDate ? `on ${formatDate(slotDate)}${timeStr}` : formatDate(null);
  const body =
    `Hi ${helperName}, you've been personally invited to help ${recipientName} with a ${slotTypeLabel} ${whenStr}. ` +
    `Tap to confirm: ${inviteUrl}`;

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
