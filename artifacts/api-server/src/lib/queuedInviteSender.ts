/**
 * Send the invites that are queued and due — the database-bound half of invite
 * dispatch. `runInviteBatch` (lib/inviteDispatch.ts) is the tested loop; this
 * file supplies it real claims, real renders, real senders and real writes.
 *
 * TWO CALLERS, ONE SEND
 * - /internal/dispatch-invites (the cron, every page) — the safety net.
 * - POST /organiser/pages/:pageId/publish, for the ONE page it just made live.
 *   ✅ Kate's ruling, 14 Sep 2026: publishing sends that page's held
 *   invitations straight away. Before this, a page's first invitations waited
 *   up to fifteen minutes for the cron after "Make it live".
 * Both go through the same claim, so the two can overlap without anyone being
 * invited twice.
 *
 * PATTERN: claim-then-send, per-invite outcome, NO automatic retry (bug #048).
 * Compare /internal/dispatch-claim-notifications in routes/internal.ts, which
 * claims then REVERTS on failure so the next run retries — a deliberately
 * different choice, noted there. If you are changing one, read both.
 *
 * Claiming into "sending" rather than "sent" is the whole of bug #048. The old
 * code marked the entire batch sent before a single message left the building,
 * so a hard crash mid-batch left the remainder permanently marked delivered,
 * having never been sent. A row left in "sending" is a visible question
 * instead. Nothing re-queues one automatically — see bug #009.
 *
 * Wording is re-rendered from the row + page via the shared inviteCopy
 * templates, so a copy fix reaches invites still sitting in the queue.
 */
import { db, supportPagesTable, slotsTable, helperInvitesTable, contactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { sendHelperInviteEmail } from "./email";
import { sendSms } from "./sms";
import { getAppBaseUrl } from "./appUrl";
import { firstName } from "./giftFulfilment";
import { LIFT_WAIT_MODE_HELPER_LINES } from "./liftWaitMode";
import { taskLabel, whenLabel } from "./item17Copy";
import {
  resolvePronouns,
  applyPronounTokens,
  defaultSituationLine,
  defaultTrustedLine,
  generalInviteSms,
  trustedInviteSms,
  secondWaveSms,
  generalInviteEmailSubject,
  generalInviteEmailText,
  trustedInviteEmailSubject,
  trustedInviteEmailText,
  TRUSTED_INVITE_EMAIL_CTA,
  type RecipientPronouns,
} from "./inviteCopy";
import { runInviteBatch, type InviteBatchTally, type InviteDelivery } from "./inviteDispatch";
import { canSendInvite } from "./inviteSendRule";
import { claimQueuedInvites } from "./inviteClaimQuery";

/** Most a single run will send, so one bad batch can't melt the Resend quota. */
export const INVITE_BATCH_LIMIT = 100;

export interface QueuedInviteRun extends InviteBatchTally {
  claimed: number;
}

export async function sendQueuedInvites(
  opts: { pageId?: string; now?: Date } = {},
): Promise<QueuedInviteRun> {
  const now = opts.now ?? new Date();

  const claimed = await claimQueuedInvites({ now, limit: INVITE_BATCH_LIMIT, pageId: opts.pageId });

  const base = getAppBaseUrl();

  // One try/catch per invite, INSIDE the loop (bug #048). Whatever goes wrong
  // with this invite — a renderer that throws, a rejected Resend or Twilio
  // call, a DB error on the page lookup — costs this invite and only this
  // invite, visibly. Invites behind it still go.
  const tally = await runInviteBatch(claimed, {
    async deliver(invite): Promise<InviteDelivery> {
      const page = await db.query.supportPagesTable.findFirst({
        where: eq(supportPagesTable.id, invite.pageId),
      });
      // The contact may have opted out since the wave was scheduled.
      const contact = invite.contactId
        ? await db.query.contactsTable.findFirst({ where: eq(contactsTable.id, invite.contactId) })
        : null;

      // Decide only; the row is stamped by markCancelled / markHeld below, so
      // every exit from this function writes its outcome in exactly one place.
      // The SAME rule the inline send paths use (lib/inviteSendRule.ts): the
      // claim query already skips drafts, and this is the second guard, so a
      // page that isn't live can never be sent from even if the two drift.
      const verdict = canSendInvite(
        page,
        { scheduledFor: invite.scheduledFor, contactOptedOut: !!contact?.optedOutAt },
        now,
      );
      if (!verdict.send) return verdict.outcome === "hold" ? "held" : "cancelled";
      // Unreachable — canSendInvite cancels a missing page. Here for the type.
      if (!page) return "cancelled";

      const helperFirstName = firstName(invite.name);
      const recipientFirstName = firstName(page.recipientName);
      const pronounsEnum = page.recipientPronouns as RecipientPronouns;
      const situationLine = applyPronounTokens(
        page.situationLine ?? defaultSituationLine(page.occasion ?? null, page.babyStage),
        pronounsEnum,
      );
      const pronouns = resolvePronouns(pronounsEnum);
      const openingLine = invite.personalOpeningLine;

      let ok = false;
      if (invite.channel === "email" && invite.email) {
        // An emailed invite that carries its own grant token is slot-scoped, so it
        // must point at the grant page — the public page hides trusted tasks and
        // refuses to claim them (bug #031).
        const emailLink = invite.inviteToken
          ? `${base}/invite/${invite.inviteToken}`
          : `${base}/s/${page.slug}`;
        // A queued trusted invite gets the trusted body, exactly as it would have
        // done had the organiser pressed send instead of scheduling it (bug #032).
        // Without this the same choice produced two different emails depending on
        // when it went out, and the scheduled one never named the task.
        const trustedSlot =
          invite.kind === "trusted" && invite.slotId
            ? await db.query.slotsTable.findFirst({
                where: eq(slotsTable.id, invite.slotId),
              })
            : undefined;
        const unsubscribeUrl = `${base}/unsubscribe/${invite.contactId}`;
        ok = trustedSlot
          ? await sendHelperInviteEmail({
              to: invite.email,
              subject: trustedInviteEmailSubject(recipientFirstName),
              text: trustedInviteEmailText({
                helperFirstName,
                recipientFirstName,
                trustedLine: applyPronounTokens(
                  page.trustedLine ?? defaultTrustedLine(page.occasion ?? null, page.babyStage),
                  pronounsEnum,
                ),
                taskLabel: taskLabel(trustedSlot.slotType, trustedSlot.customLabel),
                when: whenLabel(
                  trustedSlot.slotDate,
                  trustedSlot.slotTime,
                  trustedSlot.flexibility,
                ),
                // Bug #033 — null on anything that isn't an answered lift, and
                // null renders no line at all.
                liftNote: trustedSlot.liftWaitMode
                  ? LIFT_WAIT_MODE_HELPER_LINES[trustedSlot.liftWaitMode]
                  : null,
                link: emailLink,
                unsubscribeUrl,
                openingLine,
              }),
              link: emailLink,
              ctaLabel: TRUSTED_INVITE_EMAIL_CTA,
              unsubscribeUrl,
              openingLine,
            })
          : await sendHelperInviteEmail({
              to: invite.email,
              subject: generalInviteEmailSubject(recipientFirstName),
              text: generalInviteEmailText({
                helperFirstName,
                recipientFirstName,
                situationLine,
                pronounObj: pronouns.obj,
                link: emailLink,
                unsubscribeUrl,
                openingLine,
              }),
              link: emailLink,
              unsubscribeUrl,
              openingLine,
            });
      } else if (invite.mobile) {
        let body: string;
        if (invite.kind === "trusted" && invite.inviteToken) {
          body = trustedInviteSms({
            helperFirstName,
            recipientFirstName,
            trustedLine: applyPronounTokens(
              page.trustedLine ?? defaultTrustedLine(page.occasion ?? null, page.babyStage),
              pronounsEnum,
            ),
            pronounPoss: pronouns.poss,
            link: `${base}/invite/${invite.inviteToken}`,
            openingLine,
          });
        } else if (invite.kind === "second_wave") {
          body = secondWaveSms({ helperFirstName, recipientFirstName, link: `${base}/s/${page.slug}`, openingLine });
        } else {
          body = generalInviteSms({ helperFirstName, recipientFirstName, situationLine, link: `${base}/s/${page.slug}`, openingLine });
        }
        ok = await sendSms({ to: invite.mobile, body, label: `inviteSms:${invite.kind}` });
      }

      // false from a sender is a failure, not a shrug: sendHelperInviteEmail
      // returns it for a refused render (#046) or a Resend error, and sendSms for
      // a Twilio error. Both mean this helper was not reached.
      return ok ? "sent" : "not_sent";
    },

    // sent_at is stamped HERE, at the moment the message actually went, rather
    // than when the batch was claimed. The old code stamped it up front, which
    // is how a never-sent invite could carry a confident delivery time.
    async markSent(invite) {
      await db
        .update(helperInvitesTable)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(helperInvitesTable.id, invite.id));
    },

    async markFailed(invite) {
      await db
        .update(helperInvitesTable)
        .set({ status: "failed", sentAt: null, failedAt: new Date() })
        .where(eq(helperInvitesTable.id, invite.id));
    },

    async markCancelled(invite) {
      await db
        .update(helperInvitesTable)
        .set({ status: "cancelled", sentAt: null })
        .where(eq(helperInvitesTable.id, invite.id));
    },

    // Hand the claim back. Nothing was sent and nothing is stamped; the row
    // is exactly as it was before this run touched it.
    async markHeld(invite) {
      await db
        .update(helperInvitesTable)
        .set({ status: "queued" })
        .where(eq(helperInvitesTable.id, invite.id));
    },

    onError(err, invite, stage) {
      logger.error(
        { err, inviteId: invite.id, pageId: invite.pageId, channel: invite.channel, stage },
        stage === "deliver"
          ? "Invite send failed — marking this invite failed and continuing the batch"
          : "Could not record an invite outcome — row left in sending",
      );
    },
  });

  if (tally.stuck > 0) {
    // Not a tally line to skim past. These rows were claimed, an attempt was
    // made, and we could not write down what happened — so they are sitting in
    // "sending" and only a human can settle them (bug #009).
    logger.error({ stuck: tally.stuck, pageId: opts.pageId }, "Invite rows left stuck in sending");
  }

  return { claimed: claimed.length, ...tally };
}
