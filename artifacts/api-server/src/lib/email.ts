import { Resend } from "resend";
import { logger } from "./logger";
import { claimAddressee } from "./claimNotifyCopy";
import { TIME_TBC_CLAUSE } from "./timeTbc";
import { LIFT_WAIT_MODE_HELPER_LINES, type LiftWaitMode } from "./liftWaitMode";
import { getAppBaseUrl } from "./appUrl";
import { formatMoney, gstRateLabel, type GstBreakdown } from "./gst";
import type { FounderStats } from "./founderStats";
import { asOccasion, type Occasion } from "./occasion";
import { buildFeedbackNotification, feedbackOccasionLabel } from "./pageFeedback";

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

export interface ClaimEmailParams {
  /**
   * Named in the warning below when a contact turns out not to be an address.
   * Carried purely so that log line can identify the claim without printing the
   * contact itself.
   */
  slotId: string;
  helperFirstName: string;
  helperContact: string;
  recipientName: string;
  slotType: string;
  customLabel: string | null;
  slotDate: string | null;
  slotTime: string | null;
  // Bug #033 — for a lift, whether the helper waits. NULL on every task that
  // isn't an answered lift, in which case NOTHING is rendered: no row, no line.
  liftWaitMode: LiftWaitMode | null;
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
  // The helper's private "Add to your calendar" (.ics subscribe) link. Unique to
  // this claim, passed only for dated tasks. Optional; when absent the email
  // omits the calendar line.
  calendarUrl?: string | null;
}

export function buildHtml(params: ClaimEmailParams): string {
  const {
    helperFirstName,
    recipientName,
    slotType,
    customLabel,
    slotDate,
    slotTime,
    liftWaitMode,
    notes,
    dietaryNotes,
    headcount,
    location,
    releaseUrl,
    calendarUrl,
  } = params;

  const typeLabel = customLabel || SLOT_TYPE_LABELS[slotType] || "Helping out";
  const dateFormatted = formatDate(slotDate);
  // Only pair a time with a real date — an undated task has no clock.
  const timeFormatted = slotDate && slotTime ? formatTime(slotTime) : null;
  const dateTimeLine = timeFormatted
    ? `${dateFormatted} at ${timeFormatted}`
    : dateFormatted;

  // "Add to your calendar" — rendered only for dated tasks (the caller passes
  // calendarUrl only then). SUGGESTED COPY — Kate to bless final wording.
  const calendarBlock = calendarUrl
    ? `<p style="margin:0 0 8px;color:#333;font-size:16px;line-height:1.6;">
            📅 <a href="${escapeHtml(calendarUrl)}" style="color:#2D6A4F;font-weight:600;">Add this to your calendar</a> so it's there when you need it — it'll update if the time changes.
          </p>`
    : "";

  // A gentle, no-guilt way out if plans change. Rendered only when a release
  // link is present.
  const releaseBlock = releaseUrl
    ? `<p style="margin:0 0 8px;color:#333;font-size:16px;line-height:1.6;">
            Can't make it after all? No worries at all — <a href="${escapeHtml(releaseUrl)}" style="color:#2D6A4F;font-weight:600;">release this slot</a> and someone else can pick it up.
          </p>`
    : "";

  // Meal detail (bug #006). Rendered only when present, so non-meal slots and
  // meals with nothing to add both stay clean.
  const headcountBlock = headcount
    ? `<tr><td style="padding:4px 0;color:#5a5a5a;font-size:14px;line-height:18px;mso-line-height-rule:exactly;"><strong>Feeding:</strong> ${escapeHtml(String(headcount))} ${headcount === 1 ? "person" : "people"}</td></tr>`
    : "";

  // Bug #033 — the wait-or-not answer, in the summary block directly under
  // "When", because what it qualifies is the when. Rendered ONLY for an
  // answered lift; null adds no row at all.
  const liftBlock = liftWaitMode
    ? `<tr><td style="padding:4px 0;color:#5a5a5a;font-size:14px;line-height:18px;mso-line-height-rule:exactly;"><strong>Getting there:</strong> ${escapeHtml(LIFT_WAIT_MODE_HELPER_LINES[liftWaitMode])}</td></tr>`
    : "";

  const dietaryBlock = dietaryNotes
    ? `<tr><td style="padding:4px 0;color:#5a5a5a;font-size:14px;line-height:18px;mso-line-height-rule:exactly;"><strong>Dietary needs:</strong> ${escapeHtml(dietaryNotes)}</td></tr>`
    : "";

  const notesBlock = notes
    ? `<tr><td style="padding:4px 0;color:#5a5a5a;font-size:14px;line-height:18px;mso-line-height-rule:exactly;"><strong>Notes:</strong> ${escapeHtml(notes)}</td></tr>`
    : "";

  const locationBlock = location
    ? `<tr><td style="padding:4px 0;color:#5a5a5a;font-size:14px;line-height:18px;mso-line-height-rule:exactly;"><strong>Location:</strong> ${escapeHtml(location)}</td></tr>`
    : "";

  // Re-homed onto the shared chrome (#043). This email used to carry its own
  // full document — a green #7C9A72 band with the words "Aunt Lucy" set as an
  // <h1>, a #FAF9F6 page, no preheader — because it predates renderGiftLayout.
  // It is the one email every helper is guaranteed to receive and it was the
  // only one that didn't look like the others. The body below is unchanged;
  // only the chrome around it is now the approved one.
  //
  // The preheader is deliberately empty: every other email's was written for it,
  // and inventing words here would be a copy change. Empty means the inbox
  // preview falls through to "Hi <name>, Thank you so much for stepping up…",
  // which is exactly what it does today.
  return renderGiftLayout({
    preheader: "",
    contentHtml: `          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Hi ${escapeHtml(helperFirstName)},
          </p>
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Thank you so much for stepping up to help <strong>${escapeHtml(recipientName)}</strong>. It really does make a difference. Here's a summary of what you've signed up for:
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td bgcolor="#F3F6F2" style="background-color:#F3F6F2;border-radius:8px;padding:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td style="padding:4px 0;color:#5a5a5a;font-size:14px;line-height:18px;mso-line-height-rule:exactly;"><strong>What:</strong> ${escapeHtml(typeLabel)}</td></tr>
            <tr><td style="padding:4px 0;color:#5a5a5a;font-size:14px;line-height:18px;mso-line-height-rule:exactly;"><strong>When:</strong> ${escapeHtml(dateTimeLine)}</td></tr>
            ${liftBlock}
            ${headcountBlock}
            ${dietaryBlock}
            ${locationBlock}
            ${notesBlock}
          </table>
            </td></tr>
            <tr><td height="24" style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>
          </table>
          <p style="margin:0 0 8px;color:#333;font-size:16px;line-height:1.6;">
            If anything changes, just let the person looking after the page know.
          </p>
          ${calendarBlock}
          ${releaseBlock}
          <p style="margin:24px 0 0;color:#2D6A4F;font-size:15px;line-height:1.6;">
            Warmly,<br>The Aunt Lucy Team
          </p>`,
    footerHtml: "You received this email because you signed up to help via Aunt Lucy.",
  });
}

export function buildPlainText(params: ClaimEmailParams): string {
  const {
    helperFirstName,
    recipientName,
    slotType,
    customLabel,
    slotDate,
    slotTime,
    liftWaitMode,
    notes,
    dietaryNotes,
    headcount,
    location,
    releaseUrl,
    calendarUrl,
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
  if (liftWaitMode) text += `Getting there: ${LIFT_WAIT_MODE_HELPER_LINES[liftWaitMode]}\n`;
  if (headcount) text += `Feeding: ${headcount} ${headcount === 1 ? "person" : "people"}\n`;
  if (dietaryNotes) text += `Dietary needs: ${dietaryNotes}\n`;
  if (location) text += `Location: ${location}\n`;
  if (notes) text += `Notes: ${notes}\n`;
  text += `\nIf anything changes, just let the person looking after the page know.\n`;
  if (calendarUrl) {
    // SUGGESTED COPY — Kate to bless final wording.
    text += `\nAdd this to your calendar so it's there when you need it (it'll update if the time changes):\n${calendarUrl}\n`;
  }
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

/**
 * The sign-in email. Extracted from sendMagicLink unchanged, so the exact bytes
 * that would be sent can be rendered and held next to the rest of the family.
 * It was the only branded email with no builder, which is precisely why its
 * header sat on the stretched-lockup bug (#044) without anyone seeing it.
 */
export function buildMagicLinkEmail(magicLink: string): RenderedEmail {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  ${msoButtonStyle()}
  </head>
<body style="margin:0;padding:0;background-color:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F2;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td bgcolor="#E76F51" style="background-color:#E76F51;padding:26px 32px;">
          <img src="https://auntlucy.com.au/brand/png/aunt-lucy-lockup-horizontal-reversed-1600.png" alt="Aunt Lucy" width="280" height="69" style="display:block;width:280px;height:auto;max-width:100%;border:0;outline:none;text-decoration:none;color:#ffffff;font-size:22px;font-weight:600;" />
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">Hi there,</p>
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            Here's your sign-in link. Click the button below to access your Aunt Lucy account — it's valid for one hour.
          </p>
          ${renderButton(magicLink, "Sign in to Aunt Lucy")}
          <p style="margin:0 0 8px;color:#888;font-size:13px;line-height:1.6;">
            If you didn't request this, you can safely ignore this email.
          </p>
          <p style="margin:24px 0 0;color:#2D6A4F;font-size:15px;line-height:1.6;">
            Warmly,<br>The Aunt Lucy Team
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#FAF7F2;text-align:center;">
          <p style="margin:0;color:#999;font-size:12px;">Can't click the button? Copy this link:</p>
          <p style="margin:6px 0 0;color:#999;font-size:12px;line-height:1.5;word-break:break-all;overflow-wrap:anywhere;">${escapeHtml(magicLink)}</p>
          ${homepageFooterLine()}
          ${senderIdentityLine()}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Hi there,\n\nHere's your Aunt Lucy sign-in link:\n${magicLink}\n\nIt's valid for one hour. If you didn't request this, you can safely ignore this email.\n\nWarmly,\nThe Aunt Lucy Team`;

  return { subject: "Your Aunt Lucy sign-in link", html, text };
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

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    ...buildMagicLinkEmail(magicLink),
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
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  ${msoButtonStyle()}
  </head>
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
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td bgcolor="#F3F6F2" style="background-color:#F3F6F2;border-radius:8px;padding:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#5a5a5a;font-size:14px;"><strong>Name:</strong> ${escapeHtml(params.fullName)}</td></tr>
            <tr><td style="padding:6px 0;color:#5a5a5a;font-size:14px;"><strong>Role:</strong> ${escapeHtml(params.role)}</td></tr>
            <tr><td style="padding:6px 0;color:#5a5a5a;font-size:14px;"><strong>Email:</strong> <a href="mailto:${escapeHtml(params.email)}" style="color:#2D6A4F;">${escapeHtml(params.email)}</a></td></tr>
            ${phoneRow}
            <tr><td style="padding:12px 0 6px;color:#5a5a5a;font-size:14px;border-top:1px solid #e0e0e0;margin-top:8px;"><strong>Organisation:</strong> ${escapeHtml(params.orgName)}</td></tr>
            <tr><td style="padding:6px 0;color:#5a5a5a;font-size:14px;"><strong>Type:</strong> ${escapeHtml(orgLabel)}</td></tr>
            ${hearRow}
          </table>
            </td></tr>
            <tr><td height="24" style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>
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

  // A backstop, not the channel decision — that now happens once, up front, in
  // claimNotify.ts, which routes a phone contact to SMS instead of dropping it
  // (bug #013). Reaching this means a caller bypassed the dispatcher, so it is a
  // warning rather than the info line it used to be: a confirmation that never
  // sends is not routine, and for a public claim it also means the helper has no
  // release link anywhere. The contact value is deliberately not logged.
  if (!isEmail(params.helperContact)) {
    logger.warn(
      { slotId: params.slotId },
      "Claim confirmation email skipped — contact is not an email address",
    );
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

// ─── Helper Invite Email (9c and the trusted invite) ─────────────────────────
//
// The body wording is composed verbatim in inviteCopy.ts. This layer wraps that
// exact text in the branded HTML chrome (turning the "<label> → <link>" CTA
// line into a button and the unsubscribe line into a link) and sends it. The
// plain-text part is the canonical copy, unchanged.
//
// Two bodies come through here now and they use different CTA words, so the
// label is a parameter rather than a literal. It defaults to 9c's wording, so
// every existing caller renders exactly what it always did.

export interface HelperInviteEmailParams {
  to: string;
  subject: string;
  /** The verbatim body from inviteCopy — 9c, or the trusted invite email. */
  text: string;
  /** The link the CTA points at: the public page, or an invite's own grant. */
  link: string;
  /**
   * The CTA words. They appear twice — as the button, and as the "<label> →"
   * prefix of the line in `text` that the button replaces — so the two can
   * never drift apart. Defaults to 9c's wording.
   */
  ctaLabel?: string;
  /** One-tap unsubscribe that genuinely suppresses future sends. */
  unsubscribeUrl: string;
  /** The recipient's optional personal opener, shown above the body. */
  openingLine?: string | null;
}

/**
 * The branded HTML for a helper invite. Exported so the exact bytes that would
 * be sent can be asserted in a test and read back before a copy change ships —
 * a reimplementation inside a test helper would prove nothing about this one.
 */
export function renderHelperInviteEmailHtml(
  params: Pick<
    HelperInviteEmailParams,
    "text" | "link" | "ctaLabel" | "unsubscribeUrl" | "openingLine"
  >,
): string {
  const openerHtml = params.openingLine?.trim()
    ? `<p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;font-style:italic;">${escapeHtml(params.openingLine.trim())}</p>`
    : "";

  // The body is rendered verbatim, paragraph for paragraph, with two
  // substitutions made IN PLACE: the CTA line becomes the button, and the
  // unsubscribe line moves to the footer. In place is the point — the approved
  // copy puts the call to action above the sign-off and the plain-text part
  // already reads that way, but appending the button after the last paragraph
  // pushed it below "With love, Aunt Lucy x", so the two halves of the same
  // email disagreed about the order.
  const ctaLabel = params.ctaLabel ?? "See how you can help";
  const ctaPrefix = `${ctaLabel} →`;

  // Refuse to render a body whose CTA line we cannot account for (#046).
  //
  // The failure this catches is silent and ugly: a body carrying "Have a look →"
  // rendered with the default label leaves that line in the text as a bare,
  // unclickable URL AND adds a button reading different words. The helper sees
  // two calls to action, one of them dead. The same happens if a copy edit moves
  // the CTA onto the previous paragraph, or leaves a space in front of it.
  //
  // This THROWS rather than quietly carrying on, because there is no safe
  // recovery: every fallback still puts a malformed email in someone's inbox,
  // and an email cannot be recalled. sendHelperInviteEmail catches it and fails
  // that one invite — see the note there for why the throw must not escape.
  const paragraphList = params.text.split("\n\n");
  const strayCta = paragraphList.find(
    (p) => !p.startsWith(ctaPrefix) && /\S+ → \S*:\/\//.test(p),
  );
  if (strayCta) {
    throw new Error(
      `Helper invite body carries a CTA line that does not match ctaLabel ` +
        `${JSON.stringify(ctaLabel)}; refusing to render two calls to action. ` +
        `Offending paragraph: ${JSON.stringify(strayCta.slice(0, 120))}`,
    );
  }

  const paragraphs = paragraphList
    .filter((p) => !p.startsWith("Don't want to receive these emails?"))
    .map((p) =>
      p.startsWith(ctaPrefix)
        ? renderButton(params.link, ctaLabel)
        : `<p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n");

  const contentHtml = `${openerHtml}${paragraphs}`;

  return renderGiftLayout({
    preheader: "A gentle, no-pressure way to lend a hand.",
    contentHtml,
    footerHtml: `Don't want to receive these emails? <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#999;">Unsubscribe here</a>.`,
  });
}

export async function sendHelperInviteEmail(
  params: HelperInviteEmailParams,
): Promise<boolean> {
  // Render BEFORE anything else, and let a malformed body fail this invite
  // alone (#046). renderHelperInviteEmailHtml throws rather than emit two calls
  // to action; if that throw escaped, it would abort the whole loop in
  // routes/internal.ts dispatch-invites — and because that loop claims its
  // batch by flipping queued → sent up front, every invite queued behind this
  // one would sit marked "sent" having never been sent, with nothing to retry
  // from. Caught here it returns false, which the dispatcher already handles by
  // stamping the row failed/failedAt: loud, visible, and retryable, with the
  // rest of the batch untouched.
  //
  // Rendering first also means the local-dev path below can't skip the check.
  let html: string;
  try {
    html = renderHelperInviteEmailHtml(params);
  } catch (err) {
    logger.error(
      { err, to: params.to, ctaLabel: params.ctaLabel ?? null },
      "Refusing to send a malformed helper invite",
    );
    return false;
  }

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

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: params.subject,
    html,
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
  /**
   * THIS reader's own private /manage link. Not shared between targets: each
   * grant holder has their own token, so a manager never receives the
   * recipient's private handle (bug #025).
   */
  manageLink: string;
  /**
   * Is the reader the person the page is ABOUT, or someone running it for them?
   *
   * The copy was written for the recipient. Sent unchanged to the sister
   * running the page it says "someone's just shown up for you" and "you're
   * being looked after", which tells the wrong person they are the one being
   * cared for — the same fault as bug #039. When false, every addressee in the
   * copy swaps to the recipient's name. Defaults true so the long-standing
   * single-recipient case is untouched.
   */
  isRecipient?: boolean;
  /**
   * Who to greet. The recipient's own first name when she is the reader; a
   * manager's own first name when it isn't. Falls back to recipientFirstName.
   */
  greetingFirstName?: string;
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
  if (timeFormatted) return `${dateFormatted} at ${timeFormatted}`;
  // Bug #082 — a DATED task with no time says so, rather than trailing off after
  // the date and letting the reader fill the silence with "any time is fine".
  // An UNDATED task already reads "Whenever suits you" and has no clock to
  // confirm, so it is left alone.
  return slotDate ? `${dateFormatted}, ${TIME_TBC_CLAUSE}` : dateFormatted;
}

export function buildRecipientClaimNotificationEmail(
  params: RecipientClaimNotificationParams,
): RenderedEmail {
  const { recipientFirstName, manageLink, claims } = params;
  const single = claims.length === 1;

  // A bereavement page gets a quieter register — the celebratory "good news"
  // framing jars for someone grieving. Every other occasion is unchanged.
  const bereavement = params.occasion === "bereavement";

  // ── Addressee swap (bug #025) ──────────────────────────────────────────────
  // The reader who IS the page's person reads "you"; anyone else running the
  // page reads her name. Shared with the SMS body so the two channels cannot
  // say different things — see lib/claimNotifyCopy. Plural forms and the
  // bereavement register are untouched by it: a manager on a bereavement page
  // still gets the quiet register, addressed to the right person.
  const isRecipient = params.isRecipient !== false;
  const { addressee, possessive, possessiveCap, beingLookedAfter } = claimAddressee(
    recipientFirstName,
    isRecipient,
  );
  const greeting = params.greetingFirstName?.trim() || recipientFirstName;

  const subject = bereavement
    ? single
      ? `Someone's looking after ${addressee} 💛`
      : `${possessiveCap} people are here 💛`
    : single
      ? `Someone's just shown up for ${addressee} 💛`
      : `${possessiveCap} people are showing up 💛`;

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
            Hi ${escapeHtml(greeting)},
          </p>
          <p style="margin:0 0 16px;color:#333;font-size:16px;line-height:1.6;">
            ${opener}${single ? "someone's" : `a few of ${escapeHtml(possessive)} people have`} stepped in:
          </p>
          <ul style="margin:0 0 24px;padding-left:20px;color:#333;font-size:16px;line-height:1.7;">
${itemsHtml}
          </ul>
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            There's nothing you need to do. We just wanted you to know ${escapeHtml(beingLookedAfter)}.
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
    `Hi ${greeting},`,
    ``,
    `${opener}${single ? "someone's" : `a few of ${possessive} people have`} stepped in:`,
    ``,
    textItems,
    ``,
    `There's nothing you need to do. We just wanted you to know ${beingLookedAfter}.`,
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
 * The one-line "what is this?" footer line every email carries (#051).
 *
 * Someone forwarded an invite, or helping for the first time, has nowhere to go
 * to find out what Aunt Lucy is — the emails all assumed the reader already
 * knew. This is the route to the homepage and nothing more: no button, no
 * pitch, no "buy one". The homepage does the selling. Only the words "Aunt
 * Lucy" link.
 *
 * ⚠️ NO TASK EXAMPLES (bug #076, second surface). This line used to read
 * "practical help — meals, lifts, the school run — without the person in the
 * thick of it having to ask". It is carried by buildRecipientClaimNotification-
 * Email, so a BEREAVED reader being told someone had stepped in to help read
 * "the school run" in the footer of that very email. The examples are gone
 * rather than made occasion-aware because this footer has two callers and one
 * of them (the magic-link email) has no occasion to be aware of. If examples
 * are ever wanted back they must be occasion-aware on BOTH callers — see the
 * identical constraint on the #074 intro copy.
 *
 * ⚠️ LEGIBILITY IS NOT COSMETIC HERE (bug #086). This was 12px #999 on the
 * #FAF7F2 footer band: a contrast ratio of 2.67:1, against WCAG AA's 4.5:1 for
 * text this size — a little over half the required contrast. It is the ONLY
 * line in any email that explains what Aunt Lucy is to someone who has never
 * heard of it, so making it the least readable text in the email was exactly
 * backwards. Now 13px #5F574F = 6.63:1. Still a footnote, now a readable one.
 */
/**
 * The footer band's text colour (bug #086).
 *
 * #5F574F on the #FAF7F2 band is 6.63:1 — comfortably past WCAG AA's 4.5:1 for
 * small text, where the previous #999 was 2.67:1. Kept as a token so the two
 * lines in that band cannot drift apart again, and so the next person changing
 * it can see the number it has to beat.
 */
const FOOTER_TEXT = "#5F574F";

/**
 * The sender-identity line every email footer carries (bug #089).
 *
 * The Terms tell people that our messages identify "Aunt Lucy (and, through
 * the link/footer, Icebreaker Communications) as the sender" — a Spam Act
 * clause. An email saying "Aunt Lucy" and linking to a site whose Terms name
 * the entity ARGUABLY already satisfies that, and Kate's ruling is that the
 * ambiguity is not a breach. This line exists because ending the ambiguity
 * costs one sentence, and because it answers a real question for a helper who
 * has never heard of us: who actually sent me this?
 *
 * ⚠️ THE SITE FOOTER DELIBERATELY DOES NOT CARRY THIS. On the website the
 * entity is already one click away in the Terms, which every footer links to.
 * Adding it there too would be brand noise on every page for no gain.
 *
 * Legal name comes from supplierName() — the same source as the tax receipt —
 * so the entity can never be right in one place and stale in the other. (It is
 * declared further down the file; function declarations hoist.)
 */
function senderIdentityLine(): string {
  const year = new Date().getFullYear();
  const name = escapeHtml(supplierName());
  return `<p style="margin:8px 0 0;color:${FOOTER_TEXT};font-size:12px;line-height:1.6;">© ${year} Aunt Lucy, a service of ${name}.</p>`;
}

function homepageFooterLine(): string {
  const home = escapeHtml(getAppBaseUrl());
  return `<p style="margin:12px 0 0;color:${FOOTER_TEXT};font-size:13px;line-height:1.7;">New to <a href="${home}" style="color:${FOOTER_TEXT};text-decoration:underline;">Aunt Lucy</a>? It's a simple way for friends and family to organise practical help, without the person in the thick of it having to ask.</p>`;
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
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  ${msoButtonStyle()}
  </head>
<body style="margin:0;padding:0;background-color:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;font-size:1px;color:#FAF7F2;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(params.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F2;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td bgcolor="#E76F51" style="background-color:#E76F51;padding:26px 32px;">
          <img src="https://auntlucy.com.au/brand/png/aunt-lucy-lockup-horizontal-reversed-1600.png" alt="Aunt Lucy" width="280" height="69" style="display:block;width:280px;height:auto;max-width:100%;border:0;outline:none;text-decoration:none;color:#ffffff;font-size:22px;font-weight:600;" />
        </td></tr>
        <tr><td style="padding:32px;">
${params.contentHtml}
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#FAF7F2;text-align:center;">
          <p style="margin:0;color:${FOOTER_TEXT};font-size:13px;line-height:1.6;">${params.footerHtml ?? "auntlucy.com.au"}</p>
          ${homepageFooterLine()}
          ${senderIdentityLine()}
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
/**
 * Every button variant, in ONE place. Both the inline styles and the Outlook
 * <style> block below are generated from this, so a new variant cannot be added
 * that forces its colours in one and forgets in the other — which is exactly
 * how the quiet variant came to render purple in Outlook classic.
 */
export const BUTTON_VARIANTS = {
  primary: { bg: "#2D6A4F", fg: "#ffffff", border: "" },
  quiet: { bg: "#ffffff", fg: "#2D6A4F", border: "border:1px solid #2D6A4F;" },
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

/**
 * The Outlook-only rule that inline styles physically cannot express.
 *
 * Word applies its own Hyperlink / FollowedHyperlink character style to an
 * anchor's text. Inline `color` on the <a> and an inner <span> beats the
 * unvisited case — which is why the primary button has looked right — but there
 * is no inline syntax for :visited, so the moment a reader has followed that
 * URL once, Word repaints the label its followed-link purple. It is per-URL,
 * not per-variant: the primary is exposed to precisely the same thing and has
 * only been lucky.
 *
 * Emitted inside an MSO conditional so no other client sees it, and scoped to
 * the button classes so ordinary body links keep their own colours.
 */
function msoButtonStyle(): string {
  const rules = (Object.keys(BUTTON_VARIANTS) as ButtonVariant[])
    .map((name) => {
      const { fg } = BUTTON_VARIANTS[name];
      const sel = `.al-btn--${name}`;
      return `      a${sel}, a${sel}:link, a${sel}:visited, a${sel}:hover, a${sel}:active, ${sel} span { color: ${fg} !important; text-decoration: none !important; }`;
    })
    .join(String.fromCharCode(10));
  return `<!--[if mso]>
  <style type="text/css">
${rules}
  </style>
  <![endif]-->`;
}

/**
 * The call-to-action button shared by every recipient-facing email.
 *
 * Bulletproof, table-based, all-inline: padding sits on the <td> because Word
 * ignores it on an inline <a>, the gap beneath is a spacer row because Word
 * ignores margin on a table, and colours are forced on BOTH the <a> and an
 * inner <span>. The :visited case is handled by msoButtonStyle() in the head —
 * see the note there for why it cannot live here.
 */
function renderButton(
  url: string,
  label: string,
  variant: ButtonVariant = "primary",
): string {
  const font =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const { bg, fg, border } = BUTTON_VARIANTS[variant];
  const cls = `al-btn al-btn--${variant}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td align="center" style="padding:0;">
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto;">
                <tr><td align="center" bgcolor="${bg}" style="border-radius:8px;background-color:${bg};${border}padding:14px 30px;">
                  <a class="${cls}" href="${escapeHtml(url)}" style="display:block;color:${fg};font-family:${font};font-size:16px;font-weight:600;line-height:20px;mso-line-height-rule:exactly;text-decoration:none;"><span style="color:${fg};text-decoration:none;">${escapeHtml(label)}</span></a>
                </td></tr>
              </table>
            </td></tr>
            <tr><td height="24" style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>
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
            <li style="margin-bottom:8px;">They can add their people and activate it whenever they need it. No pressure, no deadline.</li>
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
    `• They can add their people and activate it whenever they need it. No pressure, no deadline.`,
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
   * The gift's occasion (gift_occasion enum value), used to choose the body
   * paragraph. Optional/null-safe: any unmapped or unknown value falls back to
   * the neutral paragraph — new-baby copy is never the default (Bug #010).
   */
  occasion?: string | null;
}

/**
 * The gift-delivery body paragraph, chosen by occasion. Verbatim, Kate-approved
 * copy (Bug #010, and Bug #058 for surgery). A single combined paragraph — the
 * occasion sets the opening clause and names the giver as the actor ("«Name»
 * has set up a page so the people who love you can…"), so "they/them" never
 * stands in for the giver. `giverName` is interpolated as-is: pass an
 * HTML-escaped name for the HTML body, the raw name for the plain-text body.
 *
 * ⚠️ EXHAUSTIVE OVER Occasion, DELIBERATELY (Bug #059 class). This used to be a
 * switch on a bare `string` with a `default:` catching everything unlisted,
 * which meant it was the ONE occasion-aware site in the product the compiler
 * could never help with — a new occasion would silently take the neutral
 * paragraph and nobody would be told. The parameter stays `string` because
 * callers hand over a raw DB value, but it is narrowed through asOccasion()
 * immediately and every branch below is named. Add a seventh occasion and the
 * `never` assignment at the bottom fails the build.
 *
 * Null, undefined and any unrecognised value still take the neutral paragraph.
 * That part is not a fallback of convenience — it is the Bug #010 rule that
 * new-baby copy must never be the default.
 */
function giftDeliveryParagraph(
  occasion: string | null | undefined,
  giverName: string,
): string {
  // #076 sweep site ⑥, and NOT out of scope after all (Kate, 30 Aug). This is
  // the catch-all: it serves `other`, `ongoing_support` AND any occasion that
  // fails to map — so it fires precisely in the states nobody anticipated,
  // which can include a bereavement whose occasion did not resolve. A FALLBACK
  // IS THE ONE PLACE THAT MUST BE SAFE, because it is what is left when the
  // thinking runs out. Takes the occasion-safe line rather than naming the
  // school run to a reader nobody has identified.
  const neutral = `Life's thrown a lot at you lately. ${giverName} has set up a page so the people who love you can help carry some of it — meals, lifts, the practical bits — without you having to ask or organise a thing.`;

  const known: Occasion | null = asOccasion(occasion);
  if (known === null) return neutral;

  switch (known) {
    case "new_baby":
      // Sent pre-activation, so baby_stage isn't known here — this line must read
      // true whether the baby has arrived yet or not (baby showers are gifted
      // ahead of the birth). SUGGESTED COPY — Kate to bless final wording.
      return `A new little person is part of your world now. ${giverName} has set up a page so the people who love you can make the busy weeks a little easier — meals, the school run, a friendly face — without you having to ask or organise a thing.`;
    case "illness_recovery":
      return `While you focus on getting better, ${giverName} has set up a page so the people who love you can take care of the rest — meals, the school run, a friendly face — without you having to ask or organise a thing.`;
    case "surgery":
      // Bug #058. Split off from illness_recovery, which it used to share by a
      // pre-wired fall-through. It is not a milder illness paragraph: illness
      // is ongoing and uncertain, a procedure is bounded and SCHEDULED, and the
      // best thing this product can do for it is arrange the after in advance —
      // which is why this is the only delivery paragraph that says "before
      // you're home". It also deliberately does NOT carry the school run: the
      // approved task set is four and does not include it, and an email that
      // offers a fifth thing the page never shows is its own small betrayal.
      return `A procedure is one thing; the weeks afterwards are another. ${giverName} has set up a page so the people around you can have the lifts, the meals and the shopping sorted before you're home — without you having to ask for any of it.`;
    case "bereavement":
      // #076 sweep site ②. This is BODY copy on the branch written specifically
      // for a bereaved reader, and it named the school run — while the surgery
      // branch directly above deliberately omits it (#058), with a comment
      // saying why. One branch was thought about; the one beside it was not.
      //
      // Kate's ruling, 30 Aug, and it is the distinction that matters for this
      // whole class: THE BUG WAS OCCASION-BLIND WORDING, NEVER OCCASION-SPECIFIC
      // WORDING. This branch is bereavement-only, so bereavement-appropriate copy
      // is exactly right here — the fix was never "say less", it was "stop saying
      // things that assume an occasion the reader is not having".
      //
      // So "a friendly face" comes back (warm, and never at fault), and "lifts"
      // goes: it is the odd one on a grief page, where the suggested task set is
      // deliberately logistics-free.
      return `There are no right words for a time like this. ${giverName} has set up a page so the people who love you can quietly take a few things off your plate — meals, a friendly face, the practical bits — without you having to ask or organise a thing.`;
    case "ongoing_support":
    case "other":
      return neutral;
    default: {
      // Unreachable. If this stops compiling, an occasion was added without a
      // delivery paragraph — decide on its words, don't widen this branch.
      const _exhaustive: never = known;
      void _exhaustive;
      return neutral;
    }
  }
}

export function buildGiftDeliveryEmail(params: GiftDeliveryParams): RenderedEmail {
  const bodyParagraphHtml = giftDeliveryParagraph(
    params.occasion,
    escapeHtml(params.buyerFirstName),
  );
  const bodyParagraphText = giftDeliveryParagraph(
    params.occasion,
    params.buyerFirstName,
  );

  const contentHtml = `          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Hi ${escapeHtml(params.recipientFirstName)},
          </p>
          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            ${bodyParagraphHtml}
          </p>
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            Take a look whenever you're ready. When you are, Aunt Lucy will walk you through it — you just confirm what would actually help, and who your people are.
          </p>
          <p style="margin:0 0 24px;color:#333;font-size:16px;line-height:1.6;">
            No rush. It'll be here when you need it.
          </p>
          ${renderButton(params.giftLink, "Take a look")}
          <p style="margin:0;color:#2D6A4F;font-size:15px;line-height:1.6;">
            — Aunt Lucy
          </p>`;

  const text = [
    `Hi ${params.recipientFirstName},`,
    ``,
    bodyParagraphText,
    ``,
    `Take a look whenever you're ready. When you are, Aunt Lucy will walk you through it — you just confirm what would actually help, and who your people are.`,
    ``,
    `No rush. It'll be here when you need it.`,
    ``,
    params.giftLink,
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
            Just a gentle nudge — ${escapeHtml(params.buyerFirstName)} set up a little Aunt Lucy page so the people around you can take a few things off your plate. There's nothing you need to do except take a look when it suits.
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
    `Just a gentle nudge — ${params.buyerFirstName} set up a little Aunt Lucy page so the people around you can take a few things off your plate. There's nothing you need to do except take a look when it suits.`,
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
  /**
   * THE READER'S OWN NAME — who we are greeting (bug #085).
   *
   * This used to be handed the RECIPIENT's name while the email went to the
   * SETUP PERSON, so a page set up by Fergus for Tammy sent "Hi Tammy" to
   * fergus@. It is the first email the person running the page ever receives,
   * and it called them the person they are frightened for.
   */
  name: string;
  /** The person the page is ABOUT, for the addressee swap. */
  recipientName?: string;
  /**
   * Is the reader the page's person, or someone running it for them? Defaults
   * true so the long-standing for-self behaviour is untouched.
   */
  isRecipient?: boolean;
  /** Where they get back to their page (their organiser dashboard). */
  pageLink: string;
}

export function buildCrisisPageSavedEmail(
  params: CrisisPageSavedParams,
): RenderedEmail {
  const firstNameOnly =
    params.name.trim().split(/\s+/)[0] || params.name.trim();

  // Bug #085 — the same swap the claim notification uses, from the same helper.
  // NOT a second conditional: one rule, two callers (Kate, 30 Aug). If the
  // addressee rule ever changes it must change for both, and this is what makes
  // that true rather than merely hoped for.
  const isRecipient = params.isRecipient !== false;
  const recipientFirst = (params.recipientName ?? params.name)
    .trim()
    .split(/\s+/)[0];
  const { possessive } = claimAddressee(recipientFirst, isRecipient);

  const contentHtml = `          <p style="margin:0 0 20px;color:#333;font-size:16px;line-height:1.6;">
            Hi ${escapeHtml(firstNameOnly)},
          </p>
          <p style="margin:0 0 16px;color:#333;font-size:16px;line-height:1.6;">
            Here's ${escapeHtml(possessive)} page, so you can get back to it any time, from any device:
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
    `Here's ${possessive} page, so you can get back to it any time, from any device:`,
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
  /**
   * When set, the paragraph that is nothing but `link` gets the branded green
   * button ABOVE it, with the URL left underneath as the fallback (#045).
   *
   * Opt-in on purpose. This builder is shared with the task-changed email,
   * whose whole point is that nothing is required of the helper — it must not
   * grow a primary button just because its sibling needed one.
   */
  ctaLabel?: string | null;
  /** Primary (filled green) or quiet (outlined). Only read when ctaLabel is set. */
  ctaVariant?: "primary" | "quiet";
}

export function buildItem17Email(params: Item17EmailParams): RenderedEmail {
  const escLink = params.link ? escapeHtml(params.link) : null;
  const link = params.link?.trim() || null;

  // With a ctaLabel the link is PROMOTED to a button and the URL itself is
  // removed from the body, wherever it sat — on its own line (the access grant)
  // or mid-sentence (task changed). The paragraph is split around it, so the
  // words either side keep their order and none of them change. Only the first
  // occurrence is promoted; a second would be a second button.
  //
  // Nothing here touches params.body, which is also the SMS text and the
  // plain-text part. Those keep the URL, which is what they need.
  let promoted = false;

  const para = (t: string) =>
    t
      ? `          <p style="margin:0 0 16px;color:#333;font-size:16px;line-height:1.6;">${escapeHtml(t).replace(/\n/g, "<br>")}</p>`
      : "";

  const paragraphs = params.body
    .split("\n\n")
    .map((seg) => {
      if (link && params.ctaLabel && !promoted && seg.includes(link)) {
        promoted = true;
        const at = seg.indexOf(link);
        return [
          para(seg.slice(0, at).trim()),
          renderButton(link, params.ctaLabel, params.ctaVariant ?? "primary"),
          para(seg.slice(at + link.length).trim()),
        ]
          .filter(Boolean)
          .join("\n");
      }

      let html = escapeHtml(seg).replace(/\n/g, "<br>");
      if (escLink) {
        html = html
          .split(escLink)
          .join(
            // No button on this email: the URL at least reads as a link —
            // underlined, with the colour forced on an inner span the same way
            // renderButton does it, because Outlook web recolours bare anchors
            // to its own purple. overflow-wrap sits alongside word-break for
            // clients that ignore the older property.
            `<a href="${escLink}" style="color:#2D6A4F;font-weight:600;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;"><span style="color:#2D6A4F;">${escLink}</span></a>`,
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

// ─── Page feedback notification ──────────────────────────────────────────────
//
// Internal-only: an organiser's own account of how their page actually went,
// forwarded to Kate. Never sent to a customer, and — see pageFeedback.ts — the
// text is never rendered on any page and never quoted anywhere without asking
// that person first.
//
// THE ROW IS ALREADY WRITTEN BEFORE THIS FUNCTION IS CALLED. That is the whole
// design: this is the notification, not the record. It is allowed to throw, and
// the caller is required to catch. A failed send costs Kate an email; it must
// never cost someone their words (#102).

/** The one and only address page feedback is ever sent to. */
export const PAGE_FEEDBACK_RECIPIENT = "hello@auntlucy.com.au";

export function buildPageFeedbackEmail(params: {
  recipientName: string;
  occasion: Occasion | null;
  receivedAt: Date;
  wentWell: string | null;
  gotInTheWay: string | null;
}): RenderedEmail {
  const built = buildFeedbackNotification({
    recipientName: params.recipientName,
    occasion: params.occasion,
    receivedAt: formatAuDate(params.receivedAt),
    submission: { wentWell: params.wentWell, gotInTheWay: params.gotInTheWay },
  });

  const factRows = built.facts
    .map(
      ([label, value]) => `            <tr>
              <td style="padding:5px 0;color:#666;font-size:14px;line-height:1.5;width:110px;">${escapeHtml(label)}</td>
              <td style="padding:5px 0;color:#333;font-size:14px;line-height:1.5;font-weight:600;">${escapeHtml(value)}</td>
            </tr>`,
    )
    .join("\n");

  // A blank answer is greyed and italic rather than dropped, so the shape of
  // what was asked stays visible — "she answered one of the two" is itself
  // information, and a missing heading would read as a rendering fault.
  const answerBlocks = built.sections
    .map(
      (s) => `          <p style="margin:22px 0 6px;color:#666;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(s.question)}</p>
          <p style="margin:0;padding:14px 16px;background:#F3F6F2;border-radius:8px;color:${s.answered ? "#333" : "#999"};font-size:15px;line-height:1.7;${s.answered ? "" : "font-style:italic;"}white-space:pre-wrap;">${escapeHtml(s.answer)}</p>`,
    )
    .join("\n");

  const contentHtml = `          <p style="margin:0 0 16px;color:#333;font-size:18px;font-weight:600;line-height:1.4;">
            Someone left feedback on their page
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0;">
${factRows}
          </table>
${answerBlocks}
          <p style="margin:24px 0 0;color:#999;font-size:12px;line-height:1.6;">
            Stored on the page as well as sent here, so it isn't lost if this email fails.
            Never shown on any page, and never quoted anywhere without asking this person first.
          </p>`;

  return {
    subject: built.subject,
    html: renderGiftLayout({
      preheader: `${params.recipientName}'s page — ${feedbackOccasionLabel(params.occasion)}`,
      contentHtml,
      footerHtml: "Aunt Lucy — internal feedback notification",
    }),
    text: built.text,
  };
}

/**
 * Sends the notification. THROWS on a genuine send failure, on purpose: the
 * caller has already written the row and catches this, so the failure is
 * logged loudly rather than swallowed — the exact fault behind #102, where a
 * notification reached nobody and left no trace at all.
 */
export async function sendPageFeedbackNotification(params: {
  recipientName: string;
  occasion: Occasion | null;
  receivedAt: Date;
  wentWell: string | null;
  gotInTheWay: string | null;
}): Promise<boolean> {
  const rendered = buildPageFeedbackEmail(params);

  if (isPlaceholderResendKey) {
    console.log(
      `\n📝 Page feedback for ${PAGE_FEEDBACK_RECIPIENT} (local dev — sending disabled):\n${rendered.text}\n`,
    );
    return true;
  }
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — page feedback notification not sent");
    return false;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: PAGE_FEEDBACK_RECIPIENT,
    ...rendered,
  });

  if (error) {
    throw new Error(`Resend error sending page feedback: ${JSON.stringify(error)}`);
  }

  logger.info({ to: PAGE_FEEDBACK_RECIPIENT }, "Page feedback notification sent");
  return true;
}
