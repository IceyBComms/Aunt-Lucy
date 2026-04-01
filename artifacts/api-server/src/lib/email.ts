import { Resend } from "resend";
import { logger } from "./logger";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS = "Aunt Lucy <noreply@auntlucy.com.au>";

const SLOT_TYPE_LABELS: Record<string, string> = {
  meal: "Dropping off a meal",
  school_pickup: "School pickup",
  errand: "Running an errand",
  dog_walking: "Dog walking",
  shopping: "Shopping",
  visit: "Visiting",
  other: "Helping out",
};

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface ClaimEmailParams {
  helperFirstName: string;
  helperContact: string;
  recipientName: string;
  slotType: string;
  customLabel: string | null;
  slotDate: string;
  slotTime: string | null;
  notes: string | null;
  location: string | null;
}

function buildHtml(params: ClaimEmailParams): string {
  const {
    helperFirstName,
    recipientName,
    slotType,
    customLabel,
    slotDate,
    slotTime,
    notes,
    location,
  } = params;

  const typeLabel = customLabel || SLOT_TYPE_LABELS[slotType] || "Helping out";
  const dateFormatted = formatDate(slotDate);
  const timeFormatted = slotTime ? formatTime(slotTime) : null;
  const dateTimeLine = timeFormatted
    ? `${dateFormatted} at ${timeFormatted}`
    : dateFormatted;

  const notesBlock = notes
    ? `<tr><td style="padding:8px 0;color:#5a5a5a;font-size:14px;"><strong>Notes:</strong> ${escapeHtml(notes)}</td></tr>`
    : "";

  const locationBlock = location
    ? `<tr><td style="padding:8px 0;color:#5a5a5a;font-size:14px;"><strong>Location:</strong> ${escapeHtml(location)}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FAF9F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF9F6;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#7C9A72;padding:28px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Aunt Lucy</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Hi ${escapeHtml(helperFirstName)},
          </p>
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Thank you so much for stepping up to help <strong>${escapeHtml(recipientName)}</strong>. It really does make a difference. Here's a summary of what you've signed up for:
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F6F2;border-radius:8px;padding:20px;margin:0 0 24px;">
            <tr><td style="padding:8px 0;color:#5a5a5a;font-size:14px;"><strong>What:</strong> ${escapeHtml(typeLabel)}</td></tr>
            <tr><td style="padding:8px 0;color:#5a5a5a;font-size:14px;"><strong>When:</strong> ${escapeHtml(dateTimeLine)}</td></tr>
            ${locationBlock}
            ${notesBlock}
          </table>
          <p style="margin:0 0 8px;color:#333;font-size:16px;line-height:1.6;">
            If anything changes, just get in touch with the organiser directly.
          </p>
          <p style="margin:24px 0 0;color:#7C9A72;font-size:15px;line-height:1.6;">
            Warmly,<br>The Aunt Lucy Team
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#F3F6F2;text-align:center;">
          <p style="margin:0;color:#999;font-size:12px;">You received this email because you signed up to help via Aunt Lucy.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildPlainText(params: ClaimEmailParams): string {
  const {
    helperFirstName,
    recipientName,
    slotType,
    customLabel,
    slotDate,
    slotTime,
    notes,
    location,
  } = params;

  const typeLabel = customLabel || SLOT_TYPE_LABELS[slotType] || "Helping out";
  const dateFormatted = formatDate(slotDate);
  const timeFormatted = slotTime ? formatTime(slotTime) : null;
  const dateTimeLine = timeFormatted
    ? `${dateFormatted} at ${timeFormatted}`
    : dateFormatted;

  let text = `Hi ${helperFirstName},\n\n`;
  text += `Thank you so much for stepping up to help ${recipientName}. It really does make a difference.\n\n`;
  text += `Here's what you've signed up for:\n\n`;
  text += `What: ${typeLabel}\n`;
  text += `When: ${dateTimeLine}\n`;
  if (location) text += `Location: ${location}\n`;
  if (notes) text += `Notes: ${notes}\n`;
  text += `\nIf anything changes, just get in touch with the organiser directly.\n\n`;
  text += `Warmly,\nThe Aunt Lucy Team\n`;
  return text;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Magic Link Email ─────────────────────────────────────────────────────────

interface MagicLinkParams {
  to: string;
  magicLink: string;
}

export async function sendMagicLink({ to, magicLink }: MagicLinkParams): Promise<void> {
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping magic link email");
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F2;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#2D6A4F;padding:28px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Aunt Lucy</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">Hi there,</p>
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            Here's your sign-in link. Click the button below to access your Aunt Lucy account — it's valid for one hour.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background-color:#E76F51;">
              <a href="${magicLink}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Sign in to Aunt Lucy</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;color:#888;font-size:13px;line-height:1.6;">
            If you didn't request this, you can safely ignore this email.
          </p>
          <p style="margin:24px 0 0;color:#2D6A4F;font-size:15px;line-height:1.6;">
            Warmly,<br>The Aunt Lucy Team
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#FAF7F2;text-align:center;">
          <p style="margin:0;color:#999;font-size:12px;">Can't click the button? Copy this link: ${magicLink}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Hi there,\n\nHere's your Aunt Lucy sign-in link:\n${magicLink}\n\nIt's valid for one hour. If you didn't request this, you can safely ignore this email.\n\nWarmly,\nThe Aunt Lucy Team`;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "Your Aunt Lucy sign-in link",
      html,
      text,
    });
    logger.info("Magic link email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send magic link email");
  }
}

// ─── Claim Confirmation Email ─────────────────────────────────────────────────

export async function sendClaimConfirmation(params: ClaimEmailParams): Promise<void> {
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping claim confirmation email");
    return;
  }

  if (!isEmail(params.helperContact)) {
    logger.info({ contact: params.helperContact }, "Contact is not an email — skipping confirmation email");
    return;
  }

  try {
    const subject = `Thanks for helping ${params.recipientName} — here's what you've signed up for`;
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.helperContact,
      subject,
      html: buildHtml(params),
      text: buildPlainText(params),
    });
    logger.info({ to: params.helperContact }, "Claim confirmation email sent");
  } catch (err) {
    logger.error({ err, to: params.helperContact }, "Failed to send claim confirmation email");
  }
}
