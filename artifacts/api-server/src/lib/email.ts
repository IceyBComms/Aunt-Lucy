import { Resend } from "resend";
import { logger } from "./logger";
import { formatMoney, gstRateLabel, type GstBreakdown } from "./gst";
import type { FounderStats } from "./founderStats";

// A RESEND_API_KEY containing "placeholder" means local development: don't send
// real email. Magic links are logged to the console instead (see sendMagicLink).
const isPlaceholderResendKey =
  !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.includes("placeholder");

const resend =
  process.env.RESEND_API_KEY && !isPlaceholderResendKey
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

const FROM_ADDRESS = "Aunt Lucy <noreply@auntlucy.com.au>";

const SLOT_TYPE_LABELS: Record<string, string> = {
  meal: "Dropping off a meal",
  school_pickup: "School pickup",
  child_care: "Looking after the kids",
  errand: "Running an errand",
  dog_walking: "Dog walking",
  shopping: "Shopping",
  visit: "Visiting",
  other: "Helping out",
};

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// A slot with no date is a flexible offer rather than an appointment, so it
// gets words instead of a date. Callers pair this with formatTime only when a
// real date exists — "Whenever suits you at 3:00 PM" would be nonsense.
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Whenever suits you";
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
  slotDate: string | null;
  slotTime: string | null;
  notes: string | null;
  // Meal-only detail a helper needs before cooking (bug #006). Null on every
  // other slot type, in which case neither row is rendered.
  dietaryNotes: string | null;
  headcount: number | null;
  location: string | null;
  // The helper's private "Can't make it? Release this slot" link. Unique to this
  // claim, so it needs no account. Optional so older callers still compile; when
  // absent the email simply omits the release line.
  releaseUrl?: string | null;
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
    dietaryNotes,
    headcount,
    location,
    releaseUrl,
  } = params;

  const typeLabel = customLabel || SLOT_TYPE_LABELS[slotType] || "Helping out";
  const dateFormatted = formatDate(slotDate);
  // Only pair a time with a real date — an undated task has no clock.
  const timeFormatted = slotDate && slotTime ? formatTime(slotTime) : null;
  const dateTimeLine = timeFormatted
    ? `${dateFormatted} at ${timeFormatted}`
    : dateFormatted;

  // A gentle, no-guilt way out if plans change. Rendered only when a release
  // link is present.
  const releaseBlock = releaseUrl
    ? `<p style="margin:0 0 8px;color:#333;font-size:16px;line-height:1.6;">
            Can't make it after all? No worries at all — <a href="${escapeHtml(releaseUrl)}" style="color:#7C9A72;font-weight:600;">release this slot</a> and someone else can pick it up.
          </p>`
    : "";

  // Meal detail (bug #006). Rendered only when present, so non-meal slots and
  // meals with nothing to add both stay clean.
  const headcountBlock = headcount
    ? `<tr><td style="padding:8px 0;color:#5a5a5a;font-size:14px;"><strong>Feeding:</strong> ${escapeHtml(String(headcount))} ${headcount === 1 ? "person" : "people"}</td></tr>`
    : "";

  const dietaryBlock = dietaryNotes
    ? `<tr><td style="padding:8px 0;color:#5a5a5a;font-size:14px;"><strong>Dietary needs:</strong> ${escapeHtml(dietaryNotes)}</td></tr>`
    : "";

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
            ${headcountBlock}
            ${dietaryBlock}
            ${locationBlock}
            ${notesBlock}
          </table>
          <p style="margin:0 0 8px;color:#333;font-size:16px;line-height:1.6;">
            If anything changes, just let the person looking after the page know.
          </p>
          ${releaseBlock}
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
    dietaryNotes,
    headcount,
    location,
    releaseUrl,
  } = params;

  const typeLabel = customLabel || SLOT_TYPE_LABELS[slotType] || "Helping out";
  const dateFormatted = formatDate(slotDate);
  // Only pair a time with a real date — an undated task has no clock.
  const timeFormatted = slotDate && slotTime ? formatTime(slotTime) : null;
  const dateTimeLine = timeFormatted
    ? `${dateFormatted} at ${timeFormatted}`
    : dateFormatted;

  let text = `Hi ${helperFirstName},\n\n`;
  text += `Thank you so much for stepping up to help ${recipientName}. It really does make a difference.\n\n`;
  text += `Here's what you've signed up for:\n\n`;
  text += `What: ${typeLabel}\n`;
  text += `When: ${dateTimeLine}\n`;
  if (headcount) text += `Feeding: ${headcount} ${headcount === 1 ? "person" : "people"}\n`;
  if (dietaryNotes) text += `Dietary needs: ${dietaryNotes}\n`;
  if (location) text += `Location: ${location}\n`;
  if (notes) text += `Notes: ${notes}\n`;
  text += `\nIf anything changes, just let the person looking after the page know.\n`;
  if (releaseUrl) {
    text += `\nCan't make it after all? No worries at all — release this slot so someone else can pick it up:\n${releaseUrl}\n`;
  }
  text += `\nWarmly,\nThe Aunt Lucy Team\n`;
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
  // Local development: print the magic link to the terminal instead of emailing it.
  if (isPlaceholderResendKey) {
    console.log(
      `\n🔗 Magic link for ${to} (local dev — email sending disabled):\n   ${magicLink}\n`,
    );
    return;
  }

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
        <tr><td bgcolor="#E76F51" style="background-color:#E76F51;padding:26px 32px;">
          <img src="https://auntlucy.com.au/brand/png/aunt-lucy-lockup-horizontal-reversed-1600.png" alt="Aunt Lucy" width="280" height="69" style="display:block;width:280px;height:69px;max-width:100%;border:0;outline:none;text-decoration:none;color:#ffffff;font-size:22px;font-weight:600;" />
        </td></tr>
        <tr><td bgcolor="#2D6A4F" style="background-color:#2D6A4F;font-size:0;line-height:0;height:5px;">&nbsp;</td></tr>
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

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: "Your Aunt Lucy sign-in link",
    html,
    text,
  });

  if (error) {
    logger.error({ error }, "Failed to send magic link email");
    throw new Error(`Resend error: ${error.message}`);
  }

  logger.info("Magic link email sent");
}

// ─── Pilot Application Notification ──────────────────────────────────────────

const ORG_TYPE_LABELS: Record<string, string> = {
  healthcare: "Healthcare or hospital",
  school: "School or early childhood",
  community: "Community or welfare organisation",
  faith: "Faith community or church",
  social_work: "Social work or counselling",
  other: "Other",
};

interface PilotApplicationParams {
  fullName: string;
  role: string;
  email: string;
  phone: string | null;
  orgName: string;
  orgType: string;
  usageDescription: string;
  hearAboutUs: string | null;
}

export async function sendPilotApplicationNotification(params: PilotApplicationParams): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!resend || !adminEmail) {
    logger.warn("RESEND_API_KEY or ADMIN_EMAIL not set — skipping pilot notification");
    return;
  }

  const orgLabel = ORG_TYPE_LABELS[params.orgType] ?? params.orgType;
  const phoneRow = params.phone
    ? `<tr><td style="padding:6px 0;color:#5a5a5a;font-size:14px;"><strong>Phone:</strong> ${escapeHtml(params.phone)}</td></tr>`
    : "";
  const hearRow = params.hearAboutUs
    ? `<tr><td style="padding:6px 0;color:#5a5a5a;font-size:14px;"><strong>How they heard:</strong> ${escapeHtml(params.hearAboutUs)}</td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F2;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#2D6A4F;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Aunt Lucy · New pilot application</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            A new organisation has applied to join the pilot:
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F6F2;border-radius:8px;padding:20px;margin:0 0 24px;">
            <tr><td style="padding:6px 0;color:#5a5a5a;font-size:14px;"><strong>Name:</strong> ${escapeHtml(params.fullName)}</td></tr>
            <tr><td style="padding:6px 0;color:#5a5a5a;font-size:14px;"><strong>Role:</strong> ${escapeHtml(params.role)}</td></tr>
            <tr><td style="padding:6px 0;color:#5a5a5a;font-size:14px;"><strong>Email:</strong> <a href="mailto:${escapeHtml(params.email)}" style="color:#2D6A4F;">${escapeHtml(params.email)}</a></td></tr>
            ${phoneRow}
            <tr><td style="padding:12px 0 6px;color:#5a5a5a;font-size:14px;border-top:1px solid #e0e0e0;margin-top:8px;"><strong>Organisation:</strong> ${escapeHtml(params.orgName)}</td></tr>
            <tr><td style="padding:6px 0;color:#5a5a5a;font-size:14px;"><strong>Type:</strong> ${escapeHtml(orgLabel)}</td></tr>
            ${hearRow}
          </table>
          <p style="margin:0 0 8px;color:#333;font-size:15px;font-weight:600;">How they plan to use Aunt Lucy:</p>
          <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.7;background:#F3F6F2;border-radius:8px;padding:16px;">${escapeHtml(params.usageDescription)}</p>
          <p style="margin:0;color:#2D6A4F;font-size:14px;">Reply directly to this email to follow up with ${escapeHtml(params.fullName)}.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background-color:#FAF7F2;text-align:center;">
          <p style="margin:0;color:#999;font-size:12px;">Aunt Lucy pilot programme · auntlucy.com.au</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `New pilot application — Aunt Lucy`,
    ``,
    `Name: ${params.fullName}`,
    `Role: ${params.role}`,
    `Email: ${params.email}`,
    params.phone ? `Phone: ${params.phone}` : null,
    ``,
    `Organisation: ${params.orgName}`,
    `Type: ${orgLabel}`,
    params.hearAboutUs ? `How they heard: ${params.hearAboutUs}` : null,
    ``,
    `How they plan to use Aunt Lucy:`,
    params.usageDescription,
  ].filter((l) => l !== null).join("\n");

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: adminEmail,
    replyTo: params.email,
    subject: `New pilot application — ${params.fullName}, ${params.orgName}`,
    html,
    text,
  });

  if (error) {
    logger.error({ error }, "Failed to send pilot application notification");
  } else {
    logger.info({ to: adminEmail }, "Pilot application notification sent");
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

  const subject = `Thanks for helping ${params.recipientName} — here's what you've signed up for`;
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.helperContact,
    subject,
    html: buildHtml(params),
    text: buildPlainText(params),
  });

  if (error) {
    logger.error({ error, to: params.helperContact }, "Failed to send claim confirmation email");
  } else {
    logger.info({ to: params.helperContact }, "Claim confirmation email sent");
  }
}

// ─── Trusted Helper Invite Email ──────────────────────────────────────────────

interface InviteEmailParams {
  to: string;
  helperName: string;
  recipientName: string;
  slotTypeLabel: string;
  slotDate: string | null;
  slotTime: string | null;
  inviteUrl: string;
}

export async function sendInviteEmail(params: InviteEmailParams): Promise<void> {
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping invite email");
    return;
  }

  const dateFormatted = formatDate(params.slotDate);
  const timeFormatted =
    params.slotDate && params.slotTime ? formatTime(params.slotTime) : null;
  const dateTimeLine = timeFormatted
    ? `${dateFormatted} at ${timeFormatted}`
    : dateFormatted;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F2;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#2D6A4F;padding:28px 32px;">
          <p style="margin:0;color:rgba(255,255,255,0.7);font-size:13px;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px;">Personal invitation</p>
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Hi ${escapeHtml(params.helperName)},</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            You've been personally invited to help <strong>${escapeHtml(params.recipientName)}</strong>. Here's the slot they're hoping you can cover:
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F6F2;border-radius:8px;padding:20px;margin:0 0 24px;">
            <tr><td style="padding:8px 0;color:#5a5a5a;font-size:14px;"><strong>What:</strong> ${escapeHtml(params.slotTypeLabel)}</td></tr>
            <tr><td style="padding:8px 0;color:#5a5a5a;font-size:14px;"><strong>When:</strong> ${escapeHtml(dateTimeLine)}</td></tr>
          </table>
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            Tap the button below to see the full details and confirm you're in.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background-color:#E76F51;">
              <a href="${params.inviteUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">View invitation &amp; confirm</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;color:#888;font-size:13px;line-height:1.6;">
            If you didn't expect this or can't help, you can safely ignore this email.
          </p>
          <p style="margin:24px 0 0;color:#2D6A4F;font-size:15px;line-height:1.6;">
            Warmly,<br>The Aunt Lucy Team
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#FAF7F2;text-align:center;">
          <p style="margin:0;color:#999;font-size:12px;">Can't click the button? Copy this link: ${escapeHtml(params.inviteUrl)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Hi ${params.helperName},`,
    ``,
    `You've been personally invited to help ${params.recipientName}.`,
    ``,
    `What: ${params.slotTypeLabel}`,
    `When: ${dateTimeLine}`,
    ``,
    `View your invitation and confirm here:`,
    params.inviteUrl,
    ``,
    `If you can't help, you can safely ignore this email.`,
    ``,
    `Warmly,`,
    `The Aunt Lucy Team`,
  ].join("\n");

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: `You're invited to help ${params.recipientName} — ${params.slotTypeLabel} on ${dateFormatted}`,
    html,
    text,
  });

  if (error) {
    logger.error({ error, to: params.to }, "Failed to send invite email");
    throw new Error(`Resend error: ${error.message}`);
  }

  logger.info({ to: params.to }, "Invite email sent");
}

// ─── Helper Invite Email (9c) ─────────────────────────────────────────────────
//
// The body wording is composed verbatim in inviteCopy.ts. This layer wraps that
// exact text in the branded HTML chrome (turning the "See how you can help →"
// line into a button and the unsubscribe line into a link) and sends it. The
// plain-text part is the canonical copy, unchanged.

export interface HelperInviteEmailParams {
  to: string;
  subject: string;
  /** The verbatim 9c body from inviteCopy.generalInviteEmailText. */
  text: string;
  /** The support-page link the CTA points at. */
  link: string;
  /** One-tap unsubscribe that genuinely suppresses future sends. */
  unsubscribeUrl: string;
  /** The recipient's optional personal opener, shown above the body. */
  openingLine?: string | null;
}

export async function sendHelperInviteEmail(
  params: HelperInviteEmailParams,
): Promise<boolean> {
  if (isPlaceholderResendKey) {
    console.log(
      `\n📧 Helper invite email for ${params.to} (local dev — sending disabled):\n${params.text}\n`,
    );
    return true;
  }
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping helper invite email");
    return false;
  }

  const openerHtml = params.openingLine?.trim()
    ? `<p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;font-style:italic;">${escapeHtml(params.openingLine.trim())}</p>`
    : "";

  // The body text minus the CTA line and the unsubscribe line, which become a
  // button and a footer link respectively. Everything else is shown verbatim.
  const paragraphs = params.text
    .split("\n\n")
    .filter(
      (p) =>
        !p.startsWith("See how you can help →") &&
        !p.startsWith("Don't want to receive these emails?"),
    )
    .map(
      (p) =>
        `<p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n");

  const contentHtml = `${openerHtml}${paragraphs}
          ${renderButton(params.link, "See how you can help")}`;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: params.subject,
    html: renderGiftLayout({
      preheader: "A gentle, no-pressure way to lend a hand.",
      contentHtml,
      footerHtml: `Don't want to receive these emails? <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#999;">Unsubscribe here</a>.`,
    }),
    text: params.text,
  });

  if (error) {
    logger.error({ error, to: params.to }, "Failed to send helper invite email");
    return false;
  }
  logger.info({ to: params.to }, "Helper invite email sent");
  return true;
}

// ─── Recipient claim notification (Item 8) ────────────────────────────────────
//
// Sent to the RECIPIENT when help arrives — recipient framing, never "organiser".
// Batched: one email can cover several claims that landed since the last run.

export interface RecipientClaimItem {
  helperName: string;
  slotType: string;
  customLabel: string | null;
  slotDate: string | null;
  slotTime: string | null;
  note: string | null;
}

export interface RecipientClaimNotificationParams {
  to: string;
  recipientFirstName: string;
  /** The recipient's private /manage link — "see who's helping". */
  manageLink: string;
  claims: RecipientClaimItem[];
  /**
   * The page's occasion (gift_occasion enum value), used only to soften the
   * register for a bereavement page. Optional/null on every other occasion, and
   * then the original celebratory wording is unchanged.
   */
  occasion?: string | null;
}

/** "Dropping off a meal, Friday 1 August at 3:00 PM" / "…, whenever suits you". */
function claimWhenLabel(slotDate: string | null, slotTime: string | null): string {
  const dateFormatted = formatDate(slotDate);
  const timeFormatted = slotDate && slotTime ? formatTime(slotTime) : null;
  return timeFormatted ? `${dateFormatted} at ${timeFormatted}` : dateFormatted;
}

export function buildRecipientClaimNotificationEmail(
  params: RecipientClaimNotificationParams,
): RenderedEmail {
  const { recipientFirstName, manageLink, claims } = params;
  const single = claims.length === 1;

  // A bereavement page gets a quieter register — the celebratory "good news"
  // framing jars for someone grieving. Every other occasion is unchanged.
  const bereavement = params.occasion === "bereavement";

  const subject = bereavement
    ? single
      ? "Someone's looking after you 💛"
      : "Your people are here 💛"
    : single
      ? "Someone's just shown up for you 💛"
      : "Your people are showing up 💛";

  // Only the lead-in softens; the rest of the sentence and the claim list stay
  // identical across occasions.
  const opener = bereavement ? "A gentle note — " : "A little good news — ";

  const lineFor = (c: RecipientClaimItem) => {
    const task = c.customLabel || SLOT_TYPE_LABELS[c.slotType] || "Helping out";
    const when = claimWhenLabel(c.slotDate, c.slotTime);
    const noteBit = c.note ? ` · "${c.note}"` : "";
    return { task, when, noteBit, helper: c.helperName };
  };

  const itemsHtml = claims
    .map((c) => {
      const l = lineFor(c);
      return `<li style="margin-bottom:10px;"><strong>${escapeHtml(l.helper)}</strong> is taking care of <strong>${escapeHtml(l.task)}</strong>, ${escapeHtml(l.when)}${l.noteBit ? ` <span style="color:#5a5a5a;">${escapeHtml(l.noteBit)}</span>` : ""}</li>`;
    })
    .join("\n");

  const contentHtml = `          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Hi ${escapeHtml(recipientFirstName)},
          </p>
          <p style="margin:0 0 16px;color:#333;font-size:16px;line-height:1.6;">
            ${opener}${single ? "someone's" : "a few of your people have"} stepped in:
          </p>
          <ul style="margin:0 0 24px;padding-left:20px;color:#333;font-size:16px;line-height:1.7;">
${itemsHtml}
          </ul>
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            There's nothing you need to do. We just wanted you to know you're being looked after.
          </p>
          ${renderButton(manageLink, "See who's helping")}
          <p style="margin:0;color:#2D6A4F;font-size:15px;line-height:1.6;">
            — Aunt Lucy
          </p>`;

  const textItems = claims
    .map((c) => {
      const l = lineFor(c);
      return `• ${l.helper} is taking care of ${l.task}, ${l.when}${l.noteBit}`;
    })
    .join("\n");

  const text = [
    `Hi ${recipientFirstName},`,
    ``,
    `${opener}${single ? "someone's" : "a few of your people have"} stepped in:`,
    ``,
    textItems,
    ``,
    `There's nothing you need to do. We just wanted you to know you're being looked after.`,
    ``,
    `See who's helping: ${manageLink}`,
    ``,
    `— Aunt Lucy`,
  ].join("\n");

  return {
    subject,
    html: renderGiftLayout({
      preheader: "Someone's lending a hand — nothing for you to do.",
      contentHtml,
      footerHtml: `Can't click the button? Copy this link: ${escapeHtml(manageLink)}`,
    }),
    text,
  };
}

/** Returns true if the email was handed to Resend (or dev-logged), false if not. */
export async function sendRecipientClaimNotification(
  params: RecipientClaimNotificationParams,
): Promise<boolean> {
  if (isPlaceholderResendKey) {
    console.log(
      `\n💛 Recipient claim notification for ${params.to} (local dev — sending disabled):\n${buildRecipientClaimNotificationEmail(params).text}\n`,
    );
    return true;
  }
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping recipient claim notification");
    return false;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    ...buildRecipientClaimNotificationEmail(params),
  });

  if (error) {
    logger.error({ error, to: params.to }, "Failed to send recipient claim notification");
    return false;
  }
  logger.info({ to: params.to, claims: params.claims.length }, "Recipient claim notification sent");
  return true;
}

// Note (Item 17): the former email-only `sendSlotReleasedNotification` lived
// here. It is superseded by lib/item17Notify.notifyRecipientOfTaskEvent, which
// applies the flexible/fixed channel rule (a released FIXED task must go by SMS,
// not email) and covers the runner as well as the recipient. Removed so the
// email-only path can't be reused by accident and quietly bypass that rule.

// ─── Gift Fulfilment Emails ───────────────────────────────────────────────────
//
// Copy for the three emails below is fixed by content/EMAIL_TEMPLATES.md and is
// reproduced verbatim. Change the template file first, then this — not the
// other way around.

/**
 * Formats a date for Australian readers, e.g. "Friday, 1 August 2026".
 *
 * Pinned to Australia/Sydney: the server runs in UTC, so an unpinned late-
 * evening date would print as the previous day for the person reading it.
 */
function formatAuDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
}

/**
 * The shared chrome for the fulfilment emails: preheader, branded header, white
 * card, footer. `contentHtml` is the body of the card and is assumed to be
 * already escaped by the caller.
 */
function renderGiftLayout(params: {
  preheader: string;
  contentHtml: string;
  footerHtml?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;font-size:1px;color:#FAF7F2;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(params.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F2;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td bgcolor="#E76F51" style="background-color:#E76F51;padding:26px 32px;">
          <img src="https://auntlucy.com.au/brand/png/aunt-lucy-lockup-horizontal-reversed-1600.png" alt="Aunt Lucy" width="280" height="69" style="display:block;width:280px;height:69px;max-width:100%;border:0;outline:none;text-decoration:none;color:#ffffff;font-size:22px;font-weight:600;" />
        </td></tr>
        <tr><td bgcolor="#2D6A4F" style="background-color:#2D6A4F;font-size:0;line-height:0;height:5px;">&nbsp;</td></tr>
        <tr><td style="padding:32px;">
${params.contentHtml}
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#FAF7F2;text-align:center;">
          <p style="margin:0;color:#999;font-size:12px;">${params.footerHtml ?? "auntlucy.com.au"}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * The call-to-action button shared by every recipient-facing email.
 *
 * Bulletproof, table-based, all-inline: background is the brand green from the
 * header band (#2D6A4F), text is forced white on both the <a> and an inner
 * <span> so clients that impose their own link colour (Outlook web turned the
 * label a dark purple) can't win. font-family is pinned to the layout's stack
 * so the label never falls back to a serif.
 */
function renderButton(url: string, label: string): string {
  const font =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
            <tr><td align="center" bgcolor="#2D6A4F" style="border-radius:8px;background-color:#2D6A4F;">
              <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 30px;color:#ffffff;font-family:${font};font-size:16px;font-weight:600;line-height:1.2;text-decoration:none;border-radius:8px;"><span style="color:#ffffff;text-decoration:none;">${escapeHtml(label)}</span></a>
            </td></tr>
          </table>`;
}

// ─── 0. Organiser team-card share (workplace) ────────────────────────────────

export interface OrganiserCardShareParams {
  to: string;
  organiserFirstName: string;
  recipientFirstName: string;
  /** The public "sign the card" link to share with the whole team. */
  signingLink: string;
  /** The organiser's private review/seal link. Null only if somehow unminted. */
  organiserLink: string | null;
}

export function buildOrganiserCardShareEmail(
  params: OrganiserCardShareParams,
): RenderedEmail {
  const reviewLine = params.organiserLink
    ? `          <p style="margin:0 0 24px;color:#333;font-size:15px;line-height:1.6;">
            When the notes are in, <a href="${escapeHtml(params.organiserLink)}" style="color:#2D6A4F;">come back to review and send it</a>. No rush — the card waits for you.
          </p>`
    : `          <p style="margin:0 0 24px;color:#333;font-size:15px;line-height:1.6;">
            When the notes are in, come back to review and send it. No rush — the card waits for you.
          </p>`;

  const contentHtml = `          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Hi ${escapeHtml(params.organiserFirstName)},
          </p>
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            ${escapeHtml(params.recipientFirstName)}'s gift is set up. Before it's sent, invite the team to sign the card — one link, no accounts, a few seconds each.
          </p>
          ${renderButton(params.signingLink, "Share the signing link")}
          <p style="margin:0 0 20px;color:#5a5a5a;font-size:13px;line-height:1.6;word-break:break-all;">
            Or copy this link: ${escapeHtml(params.signingLink)}
          </p>
${reviewLine}
          <p style="margin:0;color:#2D6A4F;font-size:15px;line-height:1.6;">
            — The Aunt Lucy team
          </p>`;

  const text = [
    `Hi ${params.organiserFirstName},`,
    ``,
    `${params.recipientFirstName}'s gift is set up. Before it's sent, invite the team to sign the card — one link, no accounts, a few seconds each:`,
    ``,
    params.signingLink,
    ``,
    params.organiserLink
      ? `When the notes are in, come back to review and send it: ${params.organiserLink}. No rush — the card waits for you.`
      : `When the notes are in, come back to review and send it. No rush — the card waits for you.`,
    ``,
    `— The Aunt Lucy team`,
  ].join("\n");

  return {
    subject: "Your Aunt Lucy team card — share the link",
    html: renderGiftLayout({
      preheader: "One link, no accounts — invite the team to sign the card.",
      contentHtml,
      footerHtml: "auntlucy.com.au",
    }),
    text,
  };
}

export async function sendOrganiserCardShare(
  params: OrganiserCardShareParams,
): Promise<void> {
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping organiser card-share email");
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    ...buildOrganiserCardShareEmail(params),
  });

  if (error) {
    logger.error({ error, to: params.to }, "Failed to send organiser card-share email");
    throw new Error(`Resend error: ${error.message}`);
  }

  logger.info({ to: params.to }, "Organiser card-share email sent");
}

// ─── 1. Buyer confirmation + tax receipt ─────────────────────────────────────

export interface BuyerConfirmationParams {
  to: string;
  buyerFirstName: string;
  recipientFirstName: string;
  /** "it's on its way to them now" / "we'll send it on {date}" / self-delivery. */
  deliveryLine: string;
  /** Set only when the buyer is passing the link on themselves. */
  selfDeliveryLink: string | null;
  giftReference: string;
  purchaseDate: Date;
  tierName: string;
  breakdown: GstBreakdown;
  currency: string;
}

/**
 * Supplier identity on the tax receipt. Defaulted rather than required: a
 * missing env var must not produce a receipt with a blank ABN, and these are
 * public business details, not secrets.
 */
function supplierName(): string {
  return process.env.BUSINESS_LEGAL_NAME || "Icebreaker Communications";
}

function supplierAbn(): string {
  return process.env.BUSINESS_ABN || "34 327 702 731";
}

function renderReceiptText(params: BuyerConfirmationParams): string {
  const { breakdown, currency } = params;
  const dateLine = formatAuDate(params.purchaseDate);
  const header = breakdown.isTaxable ? "TAX INVOICE" : "RECEIPT";

  const lines = [
    "──────────────────────────────",
    header,
    supplierName(),
    `ABN ${supplierAbn()}`,
    `Receipt #${params.giftReference}  ·  ${dateLine}`,
    "",
  ];

  if (breakdown.isTaxable) {
    lines.push(
      `${params.tierName} × 1`,
      `Subtotal (ex GST):   $${formatMoney(breakdown.exGstCents)} ${currency}`,
      `GST (${gstRateLabel()}):           $${formatMoney(breakdown.gstCents)} ${currency}`,
      `Total (inc GST):     $${formatMoney(breakdown.totalCents)} ${currency}`,
    );
  } else {
    // A $0 sale isn't a taxable supply: no GST lines, no "Tax Invoice" header.
    lines.push(
      "Aunt Lucy VIP — complimentary",
      `Total: $0.00 ${currency} (no GST applies)`,
    );
  }

  lines.push("──────────────────────────────");
  return lines.join("\n");
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Builds the buyer's confirmation. Split out from sending so the exact bytes
 * that go to Resend can be rendered for review without emailing anyone.
 */
export function buildBuyerConfirmationEmail(
  params: BuyerConfirmationParams,
): RenderedEmail {
  const subject = `You've just given ${params.recipientFirstName} people who show up`;

  const firstBullet = buildFirstBullet(params);

  const contentHtml = `          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Hi ${escapeHtml(params.buyerFirstName)},
          </p>
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            You've just given ${escapeHtml(params.recipientFirstName)} something really practical: people who show up.
          </p>
          <p style="margin:0 0 12px;color:#333;font-size:16px;line-height:1.6;">Here's what happens next:</p>
          <ul style="margin:0 0 20px;padding-left:20px;color:#333;font-size:16px;line-height:1.7;">
            <li style="margin-bottom:8px;">${firstBullet.html}</li>
            <li style="margin-bottom:8px;">They can take a look and activate it whenever they're ready. No pressure, no deadline.</li>
            <li>From there, Aunt Lucy quietly handles the asking, so no one ever feels put on the spot.</li>
          </ul>
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            Thank you for being the kind of person who shows up.
          </p>
          <p style="margin:0 0 28px;color:#2D6A4F;font-size:15px;line-height:1.6;">
            — The Aunt Lucy team
          </p>
          <pre style="margin:0;padding:20px;background-color:#F3F6F2;border-radius:8px;color:#5a5a5a;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(renderReceiptText(params))}</pre>`;

  const text = [
    `Hi ${params.buyerFirstName},`,
    ``,
    `You've just given ${params.recipientFirstName} something really practical: people who show up.`,
    ``,
    `Here's what happens next:`,
    ``,
    `• ${firstBullet.text}`,
    `• They can take a look and activate it whenever they're ready. No pressure, no deadline.`,
    `• From there, Aunt Lucy quietly handles the asking, so no one ever feels put on the spot.`,
    ``,
    `Thank you for being the kind of person who shows up.`,
    ``,
    `— The Aunt Lucy team`,
    ``,
    renderReceiptText(params),
  ].join("\n");

  return {
    subject,
    html: renderGiftLayout({
      preheader: "Your receipt's below — and here's what happens next.",
      contentHtml,
      footerHtml: `Receipt #${escapeHtml(params.giftReference)} · ${escapeHtml(supplierName())} · ABN ${escapeHtml(supplierAbn())}`,
    }),
    text,
  };
}

export async function sendBuyerConfirmation(
  params: BuyerConfirmationParams,
): Promise<void> {
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping buyer confirmation email");
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    ...buildBuyerConfirmationEmail(params),
  });

  if (error) {
    logger.error({ error, to: params.to }, "Failed to send buyer confirmation email");
    throw new Error(`Resend error: ${error.message}`);
  }

  logger.info({ to: params.to }, "Buyer confirmation email sent");
}

// ─── 2. Recipient activation (the keepsake) ──────────────────────────────────

export interface GiftDeliveryParams {
  to: string;
  recipientFirstName: string;
  buyerFirstName: string;
  giftLink: string;
  /**
   * The gift's occasion (gift_occasion enum value), used to choose the opening
   * line. Optional/null-safe: any unmapped or unknown value falls back to the
   * neutral line — new-baby copy is never the default (Bug #010).
   */
  occasion?: string | null;
}

/**
 * The gift-delivery opening line, chosen by occasion. Verbatim, Kate-approved
 * copy (Bug #010). The fallback MUST be the default for any unmapped, unknown
 * or null occasion — a gift for illness must never open with new-baby words.
 * `surgery` shares the illness/recovery line so a future enum value is covered
 * without a code change.
 */
function giftDeliveryOpeningLine(occasion?: string | null): string {
  switch (occasion) {
    case "new_baby":
      return "A tiny new person has arrived in your world, and someone who loves you wants to make the first few busy weeks a little easier.";
    case "illness_recovery":
    case "surgery":
      return "While you focus on getting better, someone who loves you has organised the rest.";
    case "bereavement":
      return "There are no right words for a time like this. Someone who loves you wants to quietly take a few things off your plate, so you don't have to ask.";
    default:
      return "Life's thrown a lot at you lately. Someone who loves you wants to help carry some of it.";
  }
}

export function buildGiftDeliveryEmail(params: GiftDeliveryParams): RenderedEmail {
  const openingLine = giftDeliveryOpeningLine(params.occasion);

  const contentHtml = `          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Hi ${escapeHtml(params.recipientFirstName)},
          </p>
          <p style="margin:0 0 20px;color:#333;font-size:18px;line-height:1.6;">
            ${escapeHtml(openingLine)}
          </p>
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            The people who love you want to give you a hand, so ${escapeHtml(params.buyerFirstName)} set up a page where they can help with the everyday stuff — meals, the school run, a friendly face — without you having to ask or organise a thing.
          </p>
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            All you need to do is take a look when you're ready.
          </p>
          ${renderButton(params.giftLink, "Take a look")}
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            No rush. It'll be here when you need it.
          </p>
          <p style="margin:0;color:#2D6A4F;font-size:15px;line-height:1.6;">
            — Aunt Lucy
          </p>`;

  const text = [
    `Hi ${params.recipientFirstName},`,
    ``,
    openingLine,
    ``,
    `The people who love you want to give you a hand, so ${params.buyerFirstName} set up a page where they can help with the everyday stuff — meals, the school run, a friendly face — without you having to ask or organise a thing.`,
    ``,
    `All you need to do is take a look when you're ready.`,
    ``,
    params.giftLink,
    ``,
    `No rush. It'll be here when you need it.`,
    ``,
    `— Aunt Lucy`,
  ].join("\n");

  return {
    subject: "Someone's got you",
    html: renderGiftLayout({
      preheader: "No rush — it'll be here when you need it.",
      contentHtml,
      footerHtml: `Can't click the button? Copy this link: ${escapeHtml(params.giftLink)}`,
    }),
    text,
  };
}

export async function sendGiftDelivery(params: GiftDeliveryParams): Promise<void> {
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping gift delivery email");
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    ...buildGiftDeliveryEmail(params),
  });

  if (error) {
    logger.error({ error, to: params.to }, "Failed to send gift delivery email");
    throw new Error(`Resend error: ${error.message}`);
  }

  logger.info({ to: params.to }, "Gift delivery email sent");
}

// ─── 3. Gentle activation nudge ──────────────────────────────────────────────

export type ActivationReminderParams = GiftDeliveryParams;

export function buildActivationReminderEmail(
  params: ActivationReminderParams,
): RenderedEmail {
  const contentHtml = `          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Hi ${escapeHtml(params.recipientFirstName)},
          </p>
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            Just a gentle nudge — ${escapeHtml(params.buyerFirstName)} set up a little Aunt Lucy page to take a few things off your plate. There's nothing you need to do except take a look when it suits.
          </p>
          ${renderButton(params.giftLink, "Take a look")}
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            And if now isn't the time, that's completely okay. It'll keep.
          </p>
          <p style="margin:0;color:#2D6A4F;font-size:15px;line-height:1.6;">
            — Aunt Lucy
          </p>`;

  const text = [
    `Hi ${params.recipientFirstName},`,
    ``,
    `Just a gentle nudge — ${params.buyerFirstName} set up a little Aunt Lucy page to take a few things off your plate. There's nothing you need to do except take a look when it suits.`,
    ``,
    params.giftLink,
    ``,
    `And if now isn't the time, that's completely okay. It'll keep.`,
    ``,
    `— Aunt Lucy`,
  ].join("\n");

  return {
    subject: "Still here whenever you're ready",
    html: renderGiftLayout({
      preheader: "Nothing to do — just a little nudge.",
      contentHtml,
      footerHtml: `Can't click the button? Copy this link: ${escapeHtml(params.giftLink)}`,
    }),
    text,
  };
}

export async function sendActivationReminder(
  params: ActivationReminderParams,
): Promise<void> {
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping activation reminder email");
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    ...buildActivationReminderEmail(params),
  });

  if (error) {
    logger.error({ error, to: params.to }, "Failed to send activation reminder email");
    throw new Error(`Resend error: ${error.message}`);
  }

  logger.info({ to: params.to }, "Activation reminder email sent");
}

// ─── Crisis: safety-net "keep this link" email (Item 14) ──────────────────────
//
// The ONLY unprompted email a crisis page ever sends: a one-time, plain bookmark
// so the setup person can get back to their page from any device. Deliberately
// neutral — NOT a gift-flavoured template, no CTA-button-hunt, no follow-up
// sequence, no tracking extras. Sent only on the frictionless creation path,
// never on the magic-link fallback. Reuses the shared branded chrome
// (renderGiftLayout is the generic Aunt Lucy layout, also used by the warm
// recipient notifications — nothing gift-specific about it).

export interface CrisisPageSavedParams {
  to: string;
  name: string;
  /** Where they get back to their page (their organiser dashboard). */
  pageLink: string;
}

export function buildCrisisPageSavedEmail(
  params: CrisisPageSavedParams,
): RenderedEmail {
  const firstNameOnly =
    params.name.trim().split(/\s+/)[0] || params.name.trim();

  const contentHtml = `          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Hi ${escapeHtml(firstNameOnly)},
          </p>
          <p style="margin:0 0 16px;color:#333;font-size:16px;line-height:1.6;">
            Here's your page, so you can get back to it any time, from any device:
          </p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">
            <a href="${escapeHtml(params.pageLink)}" style="color:#2D6A4F;font-weight:600;word-break:break-all;">${escapeHtml(params.pageLink)}</a>
          </p>
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            There's nothing you need to do right now. Set things up whenever
            you're ready — Aunt Lucy will take it from there.
          </p>
          <p style="margin:0;color:#2D6A4F;font-size:15px;line-height:1.6;">
            — Aunt Lucy
          </p>`;

  const text = [
    `Hi ${firstNameOnly},`,
    ``,
    `Here's your page, so you can get back to it any time, from any device:`,
    ``,
    params.pageLink,
    ``,
    `There's nothing you need to do right now. Set things up whenever you're ready — Aunt Lucy will take it from there.`,
    ``,
    `— Aunt Lucy`,
  ].join("\n");

  return {
    subject: "Your Aunt Lucy page — keep this link",
    html: renderGiftLayout({
      preheader: "Keep this link — your page is here whenever you're ready.",
      contentHtml,
      footerHtml: `Can't click the link? Copy this: ${escapeHtml(params.pageLink)}`,
    }),
    text,
  };
}

/** Fire-and-forget from the crisis route — never throws, so it can't fail a
 * page. Dev-logs instead of sending when the Resend key is a placeholder. */
export async function sendCrisisPageSaved(
  params: CrisisPageSavedParams,
): Promise<void> {
  if (isPlaceholderResendKey) {
    console.log(
      `\n📌 Crisis page-saved email for ${params.to} (local dev — sending disabled):\n${buildCrisisPageSavedEmail(params).text}\n`,
    );
    return;
  }
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping crisis page-saved email");
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    ...buildCrisisPageSavedEmail(params),
  });

  if (error) {
    logger.error({ error, to: params.to }, "Failed to send crisis page-saved email");
    return;
  }
  logger.info({ to: params.to }, "Crisis page-saved email sent");
}

/**
 * The deliveryLine merge field from EMAIL_TEMPLATES.md: "it's on its way to
 * them now" or "we'll send it on {deliveryDate}".
 *
 * Only used when we have a recipient address to send to. When the buyer is
 * delivering the link themselves the whole bullet is replaced instead — see
 * buildFirstBullet — because promising them a message we won't send would be a
 * lie in the one email that has to be trustworthy.
 */
export function buildDeliveryLine(params: {
  deliverAt: Date;
  now: Date;
}): string {
  if (params.deliverAt <= params.now) {
    return "it's on its way to them now";
  }
  return `we'll send it on ${formatAuDate(params.deliverAt)}`;
}

/**
 * The first "what happens next" bullet, in both renderings.
 *
 * When the buyer is delivering the link themselves the link sits inside the
 * bullet, so the HTML needs a real anchor where the plain text needs the bare
 * URL — hence two renderings rather than one escaped string.
 */
function buildFirstBullet(params: BuyerConfirmationParams): {
  text: string;
  html: string;
} {
  if (params.selfDeliveryLink) {
    const lead = `You'll be sharing this with ${params.recipientFirstName} yourself — here's the link: `;
    return {
      text: `${lead}${params.selfDeliveryLink}`,
      html:
        escapeHtml(lead) +
        `<a href="${escapeHtml(params.selfDeliveryLink)}" style="color:#2D6A4F;word-break:break-all;">${escapeHtml(params.selfDeliveryLink)}</a>`,
    };
  }

  const bullet = `${params.recipientFirstName} will get a gentle message letting them know you've set this up — ${params.deliveryLine}.`;
  return { text: bullet, html: escapeHtml(bullet) };
}

// ─── Item 17 — "When plans change" notifications ─────────────────────────────
//
// A single generic branded email used for every Item 17 notification (to the
// recipient/runner AND to a helper). The BODY is the verbatim copy from
// item17Copy.ts and is shown unchanged; the same string doubles as the SMS
// body, so the wording lives in exactly one place. Any `link` embedded in that
// body is made tappable here without altering a character of the copy. There is
// deliberately no added greeting or signature — the branded header already says
// Aunt Lucy, and the approved copy carries its own voice.

export interface Item17EmailParams {
  to: string;
  subject: string;
  /** Verbatim copy; `\n\n` separates paragraphs. Also sent as-is over SMS. */
  body: string;
  /** A URL that appears inside `body`, turned into an anchor for the email. */
  link?: string | null;
  preheader?: string;
}

export function buildItem17Email(params: Item17EmailParams): RenderedEmail {
  const escLink = params.link ? escapeHtml(params.link) : null;
  const paragraphs = params.body
    .split("\n\n")
    .map((seg) => {
      let html = escapeHtml(seg).replace(/\n/g, "<br>");
      if (escLink) {
        html = html
          .split(escLink)
          .join(
            `<a href="${escLink}" style="color:#2D6A4F;font-weight:600;word-break:break-all;">${escLink}</a>`,
          );
      }
      return `          <p style="margin:0 0 16px;color:#333;font-size:16px;line-height:1.6;">${html}</p>`;
    })
    .join("\n");

  return {
    subject: params.subject,
    html: renderGiftLayout({
      preheader: params.preheader ?? params.subject,
      contentHtml: paragraphs,
      footerHtml: params.link
        ? `Can't tap the link? Copy this: ${escapeHtml(params.link)}`
        : "auntlucy.com.au",
    }),
    text: params.body,
  };
}

/** Returns true if handed to Resend (or dev-logged), false if it couldn't send. */
export async function sendItem17Email(params: Item17EmailParams): Promise<boolean> {
  if (isPlaceholderResendKey) {
    console.log(
      `\n✉️ Item 17 email for ${params.to} (local dev — sending disabled):\n${params.body}\n`,
    );
    return true;
  }
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping Item 17 email");
    return false;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    ...buildItem17Email(params),
  });

  if (error) {
    logger.error({ error, to: params.to }, "Failed to send Item 17 email");
    return false;
  }
  logger.info({ to: params.to }, "Item 17 email sent");
  return true;
}

// ─── Founder weekly digest (Item 16) ─────────────────────────────────────────
//
// An internal-only email to the founder: this week plus running totals, drawn
// from the read-only queries in ./founderStats. Neutral chrome (renderGiftLayout
// is the generic Aunt Lucy layout, nothing gift-specific), numbers first, no
// CTA. Never sent to a customer — only to FOUNDER_DIGEST_RECIPIENT.

/** The one and only address the founder digest is ever sent to. */
export const FOUNDER_DIGEST_RECIPIENT = "hello@auntlucy.com.au";

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** A two-column HTML table of label → value rows. Labels/values are escaped. */
function renderStatTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([label, value]) => `            <tr>
              <td style="padding:6px 0;color:#333;font-size:15px;line-height:1.5;">${escapeHtml(label)}</td>
              <td style="padding:6px 0;color:#2D6A4F;font-size:15px;font-weight:600;text-align:right;white-space:nowrap;">${escapeHtml(value)}</td>
            </tr>`,
    )
    .join("\n");
  return `          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px;">
${body}
          </table>`;
}

function renderStatHeading(text: string): string {
  return `          <p style="margin:24px 0 8px;color:#666;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(text)}</p>`;
}

export function buildFounderDigestEmail(stats: FounderStats): RenderedEmail {
  const weekLabel = `${formatAuDate(stats.weekStart)} – ${formatAuDate(stats.generatedAt)}`;
  const o = stats.pages.byOrigin;
  const ow = stats.pages.byOriginWeek;

  const weekRows: Array<[string, string]> = [
    ["Pages created", String(stats.pages.createdWeek)],
    ["  · gift", String(ow.gift)],
    ["  · crisis (free)", String(ow.crisisFree)],
    ["  · organiser", String(ow.organiser)],
    ["Pages activated", String(stats.pages.activatedWeek)],
    ["Slots claimed", String(stats.slots.claimedWeek)],
    ["Distinct helpers", String(stats.slots.distinctHelpersWeek)],
    ["Releases (un-claims)", String(stats.slots.releasesWeek)],
    ["Gifts sold", String(stats.gifts.soldWeek)],
    ["Gift revenue (inc GST)", `$${formatMoney(stats.gifts.revenueCentsWeek)}`],
    // Comps ($0 VIP checkouts) only appear when there are any — never folded
    // into sales or revenue.
    ...(stats.gifts.compsWeek > 0
      ? ([["Comps ($0)", String(stats.gifts.compsWeek)]] as Array<[string, string]>)
      : []),
  ];

  const totalRows: Array<[string, string]> = [
    ["Pages created", String(stats.pages.createdTotal)],
    ["  · gift", String(o.gift)],
    ["  · crisis (free)", String(o.crisisFree)],
    ["  · organiser", String(o.organiser)],
    ["  · other / legacy", String(o.other)],
    ["Pages activated", String(stats.pages.activatedTotal)],
    ["Activation rate", pct(stats.pages.activationRate)],
    ["Slots claimed", String(stats.slots.claimedTotal)],
    ["Distinct helpers", String(stats.slots.distinctHelpersTotal)],
    ["Releases (un-claims)", String(stats.slots.releasesTotal)],
    ["Gifts sold", String(stats.gifts.soldTotal)],
    ["Gift revenue (inc GST)", `$${formatMoney(stats.gifts.revenueCentsTotal)}`],
    ...(stats.gifts.compsTotal > 0
      ? ([["Comps ($0)", String(stats.gifts.compsTotal)]] as Array<[string, string]>)
      : []),
  ];

  const contentHtml = `          <p style="margin:0 0 4px;color:#333;font-size:18px;font-weight:600;line-height:1.4;">
            Aunt Lucy — weekly numbers
          </p>
          <p style="margin:0 0 8px;color:#666;font-size:14px;line-height:1.5;">
            ${escapeHtml(weekLabel)}
          </p>
${renderStatHeading("This week (last 7 days)")}
${renderStatTable(weekRows)}
${renderStatHeading("Running totals (all time)")}
${renderStatTable(totalRows)}
          <p style="margin:20px 0 0;color:#999;font-size:12px;line-height:1.5;">
            Distinct helpers and releases are approximate — see the code notes in
            founderStats.ts. Internal only.
          </p>`;

  const textRows = (rows: Array<[string, string]>) =>
    rows.map(([label, value]) => `${label.replace(/^ +/, "  ")}: ${value}`).join("\n");

  const text = [
    `Aunt Lucy — weekly numbers`,
    weekLabel,
    ``,
    `THIS WEEK (last 7 days)`,
    textRows(weekRows),
    ``,
    `RUNNING TOTALS (all time)`,
    textRows(totalRows),
    ``,
    `Distinct helpers and releases are approximate (see founderStats.ts). Internal only.`,
  ].join("\n");

  return {
    subject: `Aunt Lucy weekly numbers — ${formatAuDate(stats.generatedAt)}`,
    html: renderGiftLayout({
      preheader: `${stats.pages.createdWeek} pages, ${stats.gifts.soldWeek} gifts sold this week`,
      contentHtml,
      footerHtml: "Aunt Lucy — internal founder digest",
    }),
    text,
  };
}

/**
 * Sends exactly one founder-digest email. Returns true when a send was made (or
 * dev-logged), false only when there's no way to send (missing key). Throws on a
 * genuine Resend error so the cron run is marked failed and retried.
 */
export async function sendFounderDigest(stats: FounderStats): Promise<boolean> {
  const rendered = buildFounderDigestEmail(stats);

  if (isPlaceholderResendKey) {
    console.log(
      `\n📊 Founder digest for ${FOUNDER_DIGEST_RECIPIENT} (local dev — sending disabled):\n${rendered.text}\n`,
    );
    return true;
  }
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping founder digest");
    return false;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: FOUNDER_DIGEST_RECIPIENT,
    ...rendered,
  });

  if (error) {
    logger.error({ error }, "Failed to send founder digest");
    throw new Error(`Resend error sending founder digest: ${JSON.stringify(error)}`);
  }

  logger.info({ to: FOUNDER_DIGEST_RECIPIENT }, "Founder digest sent");
  return true;
}
