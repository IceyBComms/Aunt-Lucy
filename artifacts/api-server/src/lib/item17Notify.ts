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
import { type SupportPage } from "@workspace/db";
import { isEmailAddress } from "./notifyTargets";
import { isContactSuppressed as isSuppressed, resolvePageNotifyTargets } from "./notifyTargetsDb";
import { sendSms } from "./sms";
import { sendItem17Email } from "./email";
import { getAppBaseUrl } from "./appUrl";
import { logger } from "./logger";
import type { SlotFlexibility } from "./slotFlexibility";
import type { RecipientMessage } from "./item17Copy";

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
  // rule: the page's own recipient_email / recipient_mobile, plus each active
  // management grant with its own contact, de-duplicated by contact point.
  //
  // That resolution now lives in lib/notifyTargets so the claim dispatcher
  // answers "who hears about this page?" identically (bug #025). Behaviour here
  // is unchanged - this call returns exactly what the inline block used to.
  const targets = await resolvePageNotifyTargets(page);

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
        const ok = await sendSms({
          to: target.mobile,
          body: opts.message.body,
          label: "recipientTaskEvent",
        });
        if (ok) {
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
  /**
   * Promote that URL to a button in the EMAIL only (#045). Opt-in per call
   * site: the task-CHANGED email carries one, the task-CANCELLED emails do
   * not — nothing is being asked of a helper whose task has gone away.
   * Ignored on the SMS path, which sends `body` verbatim either way.
   */
  ctaLabel?: string | null;
  ctaVariant?: "primary" | "quiet";
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
      ctaLabel: opts.ctaLabel ?? null,
      ctaVariant: opts.ctaVariant,
    });
  } else {
    await sendSms({ to: contact, body: opts.body, label: "helperTaskEvent" });
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
