/**
 * The per-page fan-out for /internal/dispatch-claim-notifications (bug #025).
 *
 * WHY THIS IS A SEPARATE FILE
 * Same reason as lib/inviteDispatch (#048): the loop lived inline in a route
 * over a module-singleton `db`, so the one behaviour that mattered — WHO gets
 * told — could not be tested without a database. That is how it went eight days
 * in production reaching nobody on a crisis page. The route supplies real
 * senders; the tests supply fakes and assert the audience.
 *
 * WHAT WAS WRONG
 * The dispatcher only ever read `support_pages.recipient_email`, a column the
 * crisis (`crisis.ts`) and organiser (`organiser.ts`) flows never populate, and
 * skipped the page entirely when it was null. Meanwhile release / reschedule /
 * note had been widened to reach every grant holder. So on a friend-run
 * bereavement page, a helper GIVING BACK a task notified the managers and a
 * helper TAKING one notified nobody.
 *
 * THREE RULINGS THIS IMPLEMENTS (Kate, 30 Aug)
 *  1. CHANNEL — a target reachable only by mobile gets an SMS. Email-only would
 *     have left the exact case #025 is about still silent, because a crisis
 *     manager's grant contact is usually a phone number.
 *  2. PER-TARGET TOKENS — every target's link is built from their OWN grant
 *     token. Fanning the recipient's token out to a manager would hand her the
 *     recipient's private handle.
 *  3. ONE STAMP, DUPLICATES ACCEPTED — `slots.recipient_notified_at` stays a
 *     single column for what is now N readers. It can say "this claim was
 *     notified"; it cannot say "the recipient got it, the manager didn't". So a
 *     partial failure reverts the whole page and the next run re-sends to
 *     everyone, including whoever already had it. That is delivery-beats-dedupe,
 *     the same ruling made on #048, and it needs no migration.
 *
 * THE BATCHING IS LOAD-BEARING AND IS PRESERVED EXACTLY.
 * Every un-notified claim on a page becomes ONE message per reader, not one per
 * claim. A bereavement page carries a dozen-plus claimable slots; routing this
 * through the immediate per-event path would have turned a single warm note
 * into a stream of texts to someone grieving. Fixing silence with a barrage is
 * not fixing it.
 */
import type { NotifyTarget } from "./notifyTargets";

/** The page fields this fan-out needs. Narrow on purpose so tests can build one. */
export interface ClaimNotifyPage {
  id: string;
  slug: string;
  recipientName: string | null;
  occasion: string | null;
}

export interface ClaimNotifySenders {
  /** Send the digest email. Returns false (or throws) if it did not go. */
  sendEmail(args: {
    to: string;
    recipientFirstName: string;
    greetingFirstName: string;
    isRecipient: boolean;
    manageLink: string;
    occasion: string | null;
  }): Promise<boolean>;
  /** Send the digest SMS. Returns false (or throws) if it did not go. */
  sendSms(args: { to: string; body: string }): Promise<boolean>;
  /** STOP / unsubscribe suppression, checked per contact point. */
  isSuppressed(contact: string): Promise<boolean>;
  /** This reader's own management URL, built from their own token. */
  manageLinkFor(token: string): string;
  /** Fallback when a target holds no grant of their own. */
  publicPageLink(slug: string): string;
}

export interface ClaimNotifyTally {
  /** How many readers this page resolved to. Zero means nobody to tell — yet. */
  targets: number;
  /** Readers reached on some channel. */
  delivered: number;
  /** Readers we tried and could not reach. Any of these reverts the stamp. */
  failed: number;
  /** Readers skipped because every channel they have is suppressed. */
  suppressed: number;
}

function firstNameOf(full: string | null | undefined, fallback: string): string {
  const trimmed = full?.trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\s+/)[0] ?? fallback;
}

/**
 * Tell everyone with active access to this page about the claims in this batch.
 *
 * One message per reader carrying all the claims — never one per claim. Each
 * reader is addressed correctly ("for you" vs "for Nadia") and linked to their
 * own management page.
 *
 * Never throws: a sender that throws is recorded as a failure for that reader
 * and the remaining readers are still attempted, so one unreachable manager
 * cannot cost the recipient her news. That is the #048 guarantee applied to
 * this loop, which the route comment flagged as missing and out of scope then.
 */
export async function notifyPageOfClaims(args: {
  page: ClaimNotifyPage;
  targets: NotifyTarget[];
  claimCount: number;
  senders: ClaimNotifySenders;
  buildSmsBody(a: {
    recipientFirstName: string;
    isRecipient: boolean;
    claimCount: number;
    manageLink: string;
    occasion?: string | null;
  }): string;
  onError?(err: unknown, contact: string): void;
}): Promise<ClaimNotifyTally> {
  const { page, targets, senders } = args;
  const recipientFirstName = firstNameOf(page.recipientName, "there");

  const tally: ClaimNotifyTally = {
    targets: targets.length,
    delivered: 0,
    failed: 0,
    suppressed: 0,
  };

  for (const target of targets) {
    // Ruling 2: their own token, never a shared one.
    const manageLink = target.token
      ? senders.manageLinkFor(target.token)
      : senders.publicPageLink(page.slug);

    // Email first when we have one, so the long-standing gift-page case (a
    // recipient_email and nothing else) behaves exactly as it always has. SMS
    // is the fallback that makes ruling 1 real for a mobile-only manager.
    const channels: Array<"email" | "sms"> = [];
    if (target.email) channels.push("email");
    if (target.mobile) channels.push("sms");

    let delivered = false;
    let attempted = false;

    for (const channel of channels) {
      const contact = channel === "email" ? target.email! : target.mobile!;
      try {
        if (await senders.isSuppressed(contact)) continue;
        attempted = true;
        const ok =
          channel === "email"
            ? await senders.sendEmail({
                to: contact,
                recipientFirstName,
                // A manager is greeted by her own name, not the recipient's.
                greetingFirstName: firstNameOf(target.personName, recipientFirstName),
                isRecipient: target.isRecipient,
                manageLink,
                occasion: page.occasion,
              })
            : await senders.sendSms({
                to: contact,
                body: args.buildSmsBody({
                  recipientFirstName,
                  isRecipient: target.isRecipient,
                  claimCount: args.claimCount,
                  manageLink,
                  occasion: page.occasion,
                }),
              });
        if (ok) {
          delivered = true;
          break;
        }
      } catch (err) {
        // One reader's failure must never abandon the readers behind them.
        args.onError?.(err, contact);
      }
    }

    if (delivered) tally.delivered += 1;
    else if (attempted) tally.failed += 1;
    else tally.suppressed += 1;
  }

  return tally;
}
