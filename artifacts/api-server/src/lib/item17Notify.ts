/**
 * Item 17 — "When plans change": who gets told, on which channel.
 *
 * The four locked rulings this implements:
 *   • The RECIPIENT is ALWAYS told when a booked task changes, is cancelled, or
 *     loses its helper. Channel by task flexibility:
 *       – FIXED   → SMS every time (email only if there's no mobile on file).
 *       – FLEXIBLE→ email, upgraded to SMS when the task is today or tomorrow
 *         (Australia/Sydney).
 *   • If someone other than the recipient runs the page they get the same
 *     message on the same rule. Every active management grant with its own
 *     contact is a notification target, alongside the page's own
 *     recipient_email / recipient_mobile — so a nominated manager, and the
 *     affected person once looped in, are all reached. Targets are de-duplicated
 *     by contact point; a page with a single target behaves exactly as before.
 *   • HELPERS are messaged on the channel they were invited on. A public
 *     claimer was never "invited", so their channel is derived from the contact
 *     they left when claiming (an email address → email, otherwise SMS) — the
 *     same rule the claim-confirmation email already uses.
 *   • Existing STOP / unsubscribe suppression is respected on every send.
 *
 * No new infrastructure: this rides the existing Twilio (sendSms) and Resend
 * (sendItem17Email) senders inline, exactly like the claim/release paths.
 */
import { db, contactsTable, pageGrantsTable, type SupportPage } from "@workspace/db";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { sendSms } from "./sms";
import { sendItem17Email } from "./email";
import { getAppBaseUrl } from "./appUrl";
import { logger } from "./logger";
import type { SlotFlexibility } from "./slotFlexibility";
import type { RecipientMessage } from "./item17Copy";

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Is this contact point suppressed? STOP suppression is global by mobile (see
 * routes/optout.ts), and email unsubscribe is effectively per email address, so
 * we match either against any opted-out contact row rather than scoping by page.
 * A contact point that was never added as a contact (a public claimer's own
 * email/number) has no row and is therefore not suppressed — correct: they
 * asked to help through the public door and never opted in to a list to leave.
 */
async function isSuppressed(contactValue: string): Promise<boolean> {
  const trimmed = contactValue.trim();
  if (!trimmed) return true;
  const rows = await db
    .select({ id: contactsTable.id })
    .from(contactsTable)
    .where(
      and(
        or(eq(contactsTable.mobile, trimmed), eq(contactsTable.email, trimmed)),
        isNotNull(contactsTable.optedOutAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Is the task today or tomorrow in Australia/Sydney? Undated (flexible) offers
 * are never "soon", so a flexible task with no date always stays on email.
 */
export function isTodayOrTomorrowSydney(slotDate: string | null): boolean {
  if (!slotDate) return false;
  // "now" and "now + 1 day" as YYYY-MM-DD in Sydney, compared to the slot's date
  // string. en-CA gives an ISO-shaped date; the timeZone does the DST-safe work.
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const now = new Date();
  const today = fmt(now);
  const tomorrow = fmt(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  return slotDate === today || slotDate === tomorrow;
}

/**
 * Notify the recipient (and, once distinct, the runner) that a booked task has
 * changed. Channel is chosen by the four rulings above. Fire-and-forget-safe:
 * every send failure is swallowed and logged so a slow email can never hold up
 * the family or helper action that triggered it.
 */
export async function notifyRecipientOfTaskEvent(
  page: SupportPage,
  opts: {
    flexibility: SlotFlexibility;
    slotDate: string | null;
    message: RecipientMessage;
    /** A URL embedded in the message body, made tappable in the email. */
    link?: string | null;
  },
): Promise<void> {
  // Never notify about a page that's been closed.
  if (page.status === "closed") return;

  // Everyone who currently manages this page gets the same message on the same
  // rule. The page's own recipient_email / recipient_mobile is one target (the
  // long-standing behaviour); each active management grant with its own contact
  // is another (a nominated manager, or the affected person once looped in). A
  // grant's recipient self-grant carries no personContact on a gift page — its
  // holder is the page-level target — so the common one-target case is
  // unchanged. Targets are de-duplicated by contact point so nobody is messaged
  // twice when the same address appears on the page and on a grant.
  const seen = new Set<string>();
  const targets: Array<{ mobile: string | null; email: string | null }> = [];

  const pageMobile = page.recipientMobile?.trim() || null;
  const pageEmail = page.recipientEmail?.trim() || null;
  if (pageMobile || pageEmail) {
    if (pageMobile) seen.add(pageMobile);
    if (pageEmail) seen.add(pageEmail);
    targets.push({ mobile: pageMobile, email: pageEmail });
  }

  const grants = await db
    .select({ contact: pageGrantsTable.personContact })
    .from(pageGrantsTable)
    .where(and(eq(pageGrantsTable.pageId, page.id), isNull(pageGrantsTable.revokedAt)));
  for (const g of grants) {
    const contact = g.contact?.trim();
    if (!contact || seen.has(contact)) continue;
    seen.add(contact);
    if (isEmailAddress(contact)) {
      targets.push({ mobile: null, email: contact });
    } else {
      targets.push({ mobile: contact, email: null });
    }
  }

  if (targets.length === 0) {
    logger.info(
      { pageId: page.id },
      "Item 17: no recipient contact on file — task-event notification skipped",
    );
    return;
  }

  // Prefer SMS for a FIXED task always; for a FLEXIBLE task only when it's soon.
  const wantSms =
    opts.flexibility === "fixed" ||
    (opts.flexibility === "flexible" && isTodayOrTomorrowSydney(opts.slotDate));
  // The preferred channel first, the other as a fallback when the preferred
  // channel is missing or suppressed for a given target.
  const order: Array<"sms" | "email"> = wantSms ? ["sms", "email"] : ["email", "sms"];

  for (const target of targets) {
    let delivered = false;
    for (const channel of order) {
      if (channel === "sms") {
        if (!target.mobile) continue;
        if (await isSuppressed(target.mobile)) continue;
        if (await sendSms({ to: target.mobile, body: opts.message.body })) {
          delivered = true;
          break;
        }
      } else {
        if (!target.email) continue;
        if (await isSuppressed(target.email)) continue;
        const ok = await sendItem17Email({
          to: target.email,
          subject: opts.message.subject,
          body: opts.message.body,
          link: opts.link ?? null,
        });
        if (ok) {
          delivered = true;
          break;
        }
      }
    }
    if (!delivered) {
      logger.warn(
        { pageId: page.id, flexibility: opts.flexibility },
        "Item 17: a task-event notification target could not be reached on any channel",
      );
    }
  }
}

/**
 * Notify a HELPER that the task they claimed has changed or been cancelled, on
 * the channel they were reachable on. The body is verbatim copy and doubles as
 * the SMS text; `emailSubject` is used only when the channel is email.
 */
export async function notifyHelperOfTaskEvent(opts: {
  helperContact: string | null;
  body: string;
  emailSubject: string;
  /** A URL embedded in the body (the release link, or the page link). */
  link?: string | null;
}): Promise<void> {
  const contact = opts.helperContact?.trim();
  if (!contact) return;

  if (await isSuppressed(contact)) {
    logger.info({}, "Item 17: helper opted out — task-event notification skipped");
    return;
  }

  if (isEmailAddress(contact)) {
    await sendItem17Email({
      to: contact,
      subject: opts.emailSubject,
      body: opts.body,
      link: opts.link ?? null,
    });
  } else {
    await sendSms({ to: contact, body: opts.body });
  }
}

/** The public share link the recipient forwards to their people. */
export function shareLinkFor(page: SupportPage): string {
  return `${getAppBaseUrl()}/s/${page.slug}`;
}

/** A helper's private release link (the one-tap "can't any more" out). */
export function releaseLinkFor(cancelToken: string): string {
  return `${getAppBaseUrl()}/release/${cancelToken}`;
}
