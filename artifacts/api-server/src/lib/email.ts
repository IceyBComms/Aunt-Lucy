import { Resend } from "resend";
import { logger } from "./logger";
import { formatMoney, gstRateLabel, type GstBreakdown } from "./gst";

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
  slotDate: string;
  slotTime: string | null;
  inviteUrl: string;
}

export async function sendInviteEmail(params: InviteEmailParams): Promise<void> {
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping invite email");
    return;
  }

  const dateFormatted = formatDate(params.slotDate);
  const timeFormatted = params.slotTime ? formatTime(params.slotTime) : null;
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
        <tr><td style="background-color:#2D6A4F;padding:28px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Aunt Lucy</h1>
        </td></tr>
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

/** The orange call-to-action button used by the recipient-facing emails. */
function renderButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
            <tr><td style="border-radius:8px;background-color:#E76F51;">
              <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
            </td></tr>
          </table>`;
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
}

export function buildGiftDeliveryEmail(params: GiftDeliveryParams): RenderedEmail {
  const contentHtml = `          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Hi ${escapeHtml(params.recipientFirstName)},
          </p>
          <p style="margin:0 0 20px;color:#333;font-size:18px;line-height:1.6;">
            Someone who loves you has set up Aunt Lucy for you.
          </p>
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            ${escapeHtml(params.buyerFirstName)} wanted to do something genuinely useful. They've set up a page so the people who care about you can help with the everyday stuff — meals, the school run, a friendly face — without you having to ask or organise a thing.
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
    `Someone who loves you has set up Aunt Lucy for you.`,
    ``,
    `${params.buyerFirstName} wanted to do something genuinely useful. They've set up a page so the people who care about you can help with the everyday stuff — meals, the school run, a friendly face — without you having to ask or organise a thing.`,
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
