import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  db,
  ensureDbAwake,
  giftsTable,
  giftMessagesTable,
  supportPagesTable,
  slotsTable,
  pageGrantsTable,
  helperInvitesTable,
  contactsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, isNotNull, lte, ne, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { LIFT_WAIT_MODE_HELPER_LINES } from "../lib/liftWaitMode";
import { firstName, giftLinkFor, sealCard } from "../lib/giftFulfilment";
import {
  sendActivationReminder,
  sendGiftDelivery,
  sendHelperInviteEmail,
  sendRecipientClaimNotification,
  sendFounderDigest,
  type RecipientClaimItem,
} from "../lib/email";
import { computeFounderStats } from "../lib/founderStats";
import { sendSms } from "../lib/sms";
import { getAppBaseUrl } from "../lib/appUrl";
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
} from "../lib/inviteCopy";
import { taskLabel, whenLabel } from "../lib/item17Copy";
import { runInviteBatch, type InviteDelivery } from "../lib/inviteDispatch";

const router: IRouter = Router();

/** Most a single run will send, so one bad batch can't melt the Resend quota. */
const BATCH_LIMIT = 100;

/** Compares secrets without leaking their length or content through timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Shared gate for every cron-triggered endpoint in this file. Answers the
 * request and returns false when the caller should stop.
 */
function cronAuthorised(req: Request, res: Response): boolean {
  const expected = process.env.INTERNAL_CRON_SECRET;
  if (!expected) {
    // Fail closed: an unset secret must not mean an open endpoint.
    logger.error("INTERNAL_CRON_SECRET not set — dispatcher is disabled");
    res.status(503).json({ error: "Dispatcher is not configured." });
    return false;
  }

  const provided = req.headers["x-internal-cron-secret"];
  if (typeof provided !== "string" || !secretMatches(provided, expected)) {
    res.status(401).json({ error: "Unauthorised." });
    return false;
  }

  return true;
}

/**
 * POST /api/internal/dispatch-scheduled — the minimum scheduler.
 *
 * Triggered by an external cron roughly every 15 minutes. Sends any queued gift
 * email that has come due: the keepsake for future-dated gifts, and the single
 * activation nudge for gifts still unopened.
 *
 * Only the two fulfilment message types are claimed. Helper reminders and
 * thank-yous share this queue but belong to later items, so they are left
 * untouched rather than being sent by a dispatcher that doesn't understand them.
 */
router.post("/internal/dispatch-scheduled", async (req, res) => {
  if (!cronAuthorised(req, res)) return;

  // Wake Neon (scale-to-zero) and confirm a live connection before any work, so
  // a cold-start hiccup becomes a short retry rather than a failed cron run.
  await ensureDbAwake();

  const now = new Date();

  // PATTERN: claim-then-send by marking rows SENT up front — the third and
  // oldest of the three dispatchers in this file, and the only one still doing
  // it this way after bug #048. Left as-is deliberately, not overlooked.
  //
  // The reasoning below is genuinely different from the invite queue's: this
  // queue carries the keepsake gift and its one nudge, where a duplicate is a
  // spoiled moment rather than a mild embarrassment. But the cost is real and
  // has already been paid once — bug #007, where every send was failing and
  // Neil's gift sat stamped `sent`, delivered to nobody. If that trade is ever
  // revisited, it is bug #009's ground, not #048's.
  //
  // Claim the batch in one atomic update. Marking rows sent *before* sending
  // means a crash mid-flight can drop an email, which is the right way round:
  // this queue carries the keepsake and a nudge, and sending either twice is
  // worse than sending it late by hand.
  const claimed = await db
    .update(giftMessagesTable)
    .set({ status: "sent", sentAt: now })
    .where(
      inArray(
        giftMessagesTable.id,
        db
          .select({ id: giftMessagesTable.id })
          .from(giftMessagesTable)
          .where(
            and(
              eq(giftMessagesTable.status, "scheduled"),
              lte(giftMessagesTable.scheduledFor, now),
              inArray(giftMessagesTable.type, [
                "gift_delivery",
                "activation_reminder",
              ]),
            ),
          )
          .limit(BATCH_LIMIT),
      ),
    )
    .returning();

  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const message of claimed) {
    const gift = await db.query.giftsTable.findFirst({
      where: eq(giftsTable.id, message.giftId),
    });

    if (!gift || !message.toEmail) {
      await db
        .update(giftMessagesTable)
        .set({ status: "cancelled", sentAt: null })
        .where(eq(giftMessagesTable.id, message.id));
      cancelled += 1;
      continue;
    }

    // The nudge exists to reach people who haven't opened their gift. Once
    // they have, it would just be noise.
    if (message.type === "activation_reminder" && gift.redeemedAt) {
      await db
        .update(giftMessagesTable)
        .set({ status: "cancelled", sentAt: null })
        .where(eq(giftMessagesTable.id, message.id));
      cancelled += 1;
      logger.info(
        { giftId: gift.id },
        "Gift already activated — nudge cancelled",
      );
      continue;
    }

    const emailParams = {
      to: message.toEmail,
      recipientFirstName: firstName(gift.recipientName),
      buyerFirstName: firstName(gift.purchaserName),
      giftLink: giftLinkFor(gift.redemptionToken),
      occasion: gift.occasion,
    };

    try {
      if (message.type === "gift_delivery") {
        await sendGiftDelivery(emailParams);
        await db
          .update(giftsTable)
          .set({ status: "delivered", deliveredAt: now })
          .where(eq(giftsTable.id, gift.id));
      } else {
        await sendActivationReminder(emailParams);
      }
      sent += 1;
    } catch (err) {
      await db
        .update(giftMessagesTable)
        .set({ status: "failed", sentAt: null })
        .where(eq(giftMessagesTable.id, message.id));
      failed += 1;
      logger.error(
        { err, giftMessageId: message.id, giftId: gift.id },
        "Scheduled gift email failed",
      );
    }
  }

  // Same cron, one more job: auto-seal any workplace card the organiser never
  // sent, so its keepsake still reaches the recipient. Kept here rather than on
  // a separate endpoint to avoid wiring a new cron for a rare, low-volume sweep.
  const autoSealed = await autoSealDueCards(now);

  logger.info(
    { claimed: claimed.length, sent, failed, cancelled, autoSealed },
    "Dispatch run complete",
  );
  res.json({ claimed: claimed.length, sent, failed, cancelled, autoSealed });
});

/**
 * Seals ("sends") any workplace card that was never sealed by its deadline, so
 * a forgotten card still reaches the recipient rather than sitting undelivered
 * forever. The deadline is the buyer's chosen delivery date, or 14 days after
 * purchase when they chose none.
 *
 * Delivery itself is handled by sealCard(), which is idempotent — so a card a
 * distracted organiser seals in the same minute this runs can't be sent twice.
 */
async function autoSealDueCards(now: Date): Promise<number> {
  const due = await db
    .select()
    .from(giftsTable)
    .where(
      and(
        isNotNull(giftsTable.signingToken),
        isNull(giftsTable.cardSealedAt),
        eq(giftsTable.status, "paid"),
        lte(
          sql`COALESCE(${giftsTable.deliverAt}, ${giftsTable.createdAt} + interval '14 days')`,
          now,
        ),
      ),
    )
    .limit(BATCH_LIMIT);

  let sealed = 0;
  for (const gift of due) {
    const result = await sealCard({ gift, now, reason: "auto" });
    if (result.sealed) {
      sealed += 1;
      logger.info({ giftId: gift.id }, "Card auto-sealed at its delivery deadline");
    }
  }
  return sealed;
}

/**
 * POST /api/internal/activate-scheduled-pages — the delayed go-live.
 *
 * Recipients who chose "go live on a later date" already have a real page and
 * real tasks; status 'draft' keeps it invisible at /s/:slug until the day
 * arrives. This sweep is what makes the day arrive. Share the same cron as the
 * dispatcher above — date-level granularity means the exact minute is moot.
 *
 * Deliberately narrow: only draft pages carrying a scheduled_activate_at in the
 * past. A draft with no scheduled date is an organiser's half-finished wizard
 * and is none of this job's business.
 */
router.post("/internal/activate-scheduled-pages", async (req, res) => {
  if (!cronAuthorised(req, res)) return;

  // Wake Neon (scale-to-zero) and confirm a live connection before any work, so
  // a cold-start hiccup becomes a short retry rather than a failed cron run.
  await ensureDbAwake();

  const due = await db
    .select({ id: supportPagesTable.id, slug: supportPagesTable.slug })
    .from(supportPagesTable)
    .where(
      and(
        eq(supportPagesTable.status, "draft"),
        isNotNull(supportPagesTable.scheduledActivateAt),
        lte(supportPagesTable.scheduledActivateAt, new Date()),
      ),
    )
    .limit(BATCH_LIMIT);

  let activated = 0;
  for (const page of due) {
    // Re-check the status inside the update so two overlapping cron runs cannot
    // both claim the same page.
    const flipped = await db
      .update(supportPagesTable)
      .set({ status: "active" })
      .where(
        and(eq(supportPagesTable.id, page.id), eq(supportPagesTable.status, "draft")),
      )
      .returning({ id: supportPagesTable.id });

    if (flipped.length > 0) {
      activated++;
      logger.info({ pageId: page.id, slug: page.slug }, "Scheduled page went live");
    }
  }

  res.json({ considered: due.length, activated });
});

/**
 * POST /api/internal/dispatch-invites — the wave sender.
 *
 * Shares the cron and the claim-before-send discipline of the gift dispatcher,
 * but is a SEPARATE queue: helper_invites carries SMS as well as email and is
 * page-scoped, so it never touches gift_messages. "Send now" is handled inline
 * in the manage routes; this endpoint is only for scheduled waves.
 *
 * Wording is re-rendered from the row + page via the shared inviteCopy
 * templates, so a copy fix reaches invites still sitting in the queue.
 */
router.post("/internal/dispatch-invites", async (req, res) => {
  if (!cronAuthorised(req, res)) return;

  // Wake Neon (scale-to-zero) and confirm a live connection before any work, so
  // a cold-start hiccup becomes a short retry rather than a failed cron run.
  await ensureDbAwake();

  const now = new Date();

  // PATTERN: claim-then-send, per-invite outcome, NO automatic retry (bug #048).
  // Compare /internal/dispatch-claim-notifications below, which claims then
  // REVERTS on failure so the next run retries — a deliberately different
  // choice, noted there. If you are changing one, read both.
  //
  // Claim the batch by flipping queued → SENDING. This is the concurrency lock:
  // one atomic update, so two overlapping cron runs can never grab the same
  // row. It is NOT a claim that anything was delivered — each invite writes its
  // own outcome below, and sent_at is stamped at the moment the message
  // actually goes, not here.
  //
  // Claiming into "sending" rather than "sent" is the whole of bug #048. The
  // old code marked the entire batch sent before a single message left the
  // building, so a hard crash mid-batch left the remainder permanently marked
  // delivered, having never been sent: nothing to retry from, nothing to alert
  // on, and helpers who were never asked. A row left in "sending" is a visible
  // question instead. Nothing re-queues one automatically — see bug #009.
  const claimed = await db
    .update(helperInvitesTable)
    .set({ status: "sending" })
    .where(
      inArray(
        helperInvitesTable.id,
        db
          .select({ id: helperInvitesTable.id })
          .from(helperInvitesTable)
          .where(
            and(
              eq(helperInvitesTable.status, "queued"),
              lte(helperInvitesTable.scheduledFor, now),
            ),
          )
          .limit(BATCH_LIMIT),
      ),
    )
    .returning();

  const base = getAppBaseUrl();

  // One try/catch per invite, INSIDE the loop (bug #048). Whatever goes wrong
  // with this invite — a renderer that throws, a rejected Resend or Twilio
  // call, a DB error on the page lookup — costs this invite and only this
  // invite, visibly. Invites behind it still go. The loop itself lives in
  // lib/inviteDispatch.ts so that guarantee can actually be tested.
  const { sent, failed, cancelled, stuck } = await runInviteBatch(claimed, {
    async deliver(invite): Promise<InviteDelivery> {
      const page = await db.query.supportPagesTable.findFirst({
        where: eq(supportPagesTable.id, invite.pageId),
      });
      // The contact may have opted out since the wave was scheduled.
      const contact = invite.contactId
        ? await db.query.contactsTable.findFirst({ where: eq(contactsTable.id, invite.contactId) })
        : null;

      if (!page || page.status === "closed" || (contact && contact.optedOutAt)) {
        // Decide only; the row is stamped by markCancelled below, so every exit
        // from this function writes its outcome in exactly one place.
        return "cancelled";
      }

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
                when: whenLabel(trustedSlot.slotDate, trustedSlot.slotTime),
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

    onError(err, invite, stage) {
      logger.error(
        { err, inviteId: invite.id, pageId: invite.pageId, channel: invite.channel, stage },
        stage === "deliver"
          ? "Invite send failed — marking this invite failed and continuing the batch"
          : "Could not record an invite outcome — row left in sending",
      );
    },
  });

  if (stuck > 0) {
    // Not a tally line to skim past. These rows were claimed, an attempt was
    // made, and we could not write down what happened — so they are sitting in
    // "sending" and only a human can settle them (bug #009).
    logger.error({ stuck }, "Invite rows left stuck in sending");
  }

  logger.info({ claimed: claimed.length, sent, failed, cancelled, stuck }, "Invite dispatch run complete");
  res.json({ claimed: claimed.length, sent, failed, cancelled, stuck });
});

/**
 * POST /api/internal/dispatch-claim-notifications — tell the recipient help
 * arrived (Item 8).
 *
 * Shares the cron with the other internal jobs. Batches by page: every claimed
 * slot not yet notified is gathered into ONE email per page, so a flurry of
 * claims becomes a single warm note rather than a stream of pings.
 *
 * Only pages that actually hold a recipient_email are considered — a page with
 * none is left pending (not stamped), so the moment an email is added via
 * /manage the next run picks the backlog up. Nothing is ever lost; the /manage
 * "help arriving" view is the always-on fallback in the meantime.
 *
 * PATTERN: claim-then-send, REVERT-ON-FAILURE, so the next run retries — the
 * opposite half of the split noted on /internal/dispatch-invites above. Both
 * patterns are deliberate and they differ on purpose: an invite is a message to
 * a third party and re-sending one is socially costly, so it is stamped failed
 * and left for a human; this one is a note to the recipient about their own
 * page, where a duplicate costs nothing and silence costs them the news. Two
 * philosophies in one file with no note is how bug #048 stayed invisible.
 *
 * ⚠️ NOT FIXED HERE (bug #048, deliberately out of scope for that branch): this
 * loop still has no per-page try/catch. sendRecipientClaimNotification does not
 * wrap its Resend call, so a network throw would abort the whole run with the
 * current page's slots already stamped notified and no email sent — the same
 * shape of fault, on a smaller blast radius. Scoped, not built.
 *
 * Claim-then-send: the pending slots are stamped notified up front (atomically,
 * so two overlapping runs can't both grab them). On a send failure the stamp is
 * reverted so the next run retries — for this feature eventual delivery matters
 * more than the rare duplicate.
 */
router.post("/internal/dispatch-claim-notifications", async (req, res) => {
  if (!cronAuthorised(req, res)) return;

  // Wake Neon (scale-to-zero) and confirm a live connection before any work, so
  // a cold-start hiccup becomes a short retry rather than a failed cron run.
  await ensureDbAwake();

  const base = getAppBaseUrl();

  // Pages with at least one un-notified claim AND somewhere to send it.
  const candidates = await db
    .selectDistinct({ pageId: slotsTable.pageId })
    .from(slotsTable)
    .innerJoin(supportPagesTable, eq(slotsTable.pageId, supportPagesTable.id))
    .where(
      and(
        eq(slotsTable.isClaimed, true),
        isNull(slotsTable.recipientNotifiedAt),
        isNotNull(supportPagesTable.recipientEmail),
        ne(supportPagesTable.status, "closed"),
      ),
    )
    .limit(BATCH_LIMIT);

  let pagesNotified = 0;
  let claimsNotified = 0;
  let failed = 0;

  for (const { pageId } of candidates) {
    const now = new Date();

    // Atomically claim this page's pending slots by stamping them. RETURNING
    // gives us exactly the rows this run owns — concurrency-safe.
    const rows = await db
      .update(slotsTable)
      .set({ recipientNotifiedAt: now })
      .where(
        and(
          eq(slotsTable.pageId, pageId),
          eq(slotsTable.isClaimed, true),
          isNull(slotsTable.recipientNotifiedAt),
        ),
      )
      .returning();

    if (rows.length === 0) continue; // another run beat us to it

    const page = await db.query.supportPagesTable.findFirst({
      where: eq(supportPagesTable.id, pageId),
    });
    if (!page || !page.recipientEmail) {
      // Lost the email between select and now — release the rows for a retry.
      await releaseNotificationStamp(rows.map((r) => r.id), now);
      continue;
    }

    // The recipient's own management link — "see who's helping".
    const grant = await db.query.pageGrantsTable.findFirst({
      where: and(eq(pageGrantsTable.pageId, pageId), eq(pageGrantsTable.role, "recipient")),
    });
    const manageLink = grant
      ? `${base}/manage/${grant.token}`
      : `${base}/s/${page.slug}`;

    const claims: RecipientClaimItem[] = rows.map((s) => ({
      helperName: s.claimedByName ?? "A friend",
      slotType: s.slotType,
      customLabel: s.customLabel,
      slotDate: s.slotDate,
      slotTime: s.slotTime,
      note: s.claimedNote,
    }));

    const ok = await sendRecipientClaimNotification({
      to: page.recipientEmail,
      recipientFirstName: firstName(page.recipientName),
      manageLink,
      claims,
      occasion: page.occasion ?? null,
    });

    if (ok) {
      pagesNotified += 1;
      claimsNotified += rows.length;
    } else {
      failed += 1;
      // Revert so the next run retries rather than dropping the news entirely.
      await releaseNotificationStamp(rows.map((r) => r.id), now);
    }
  }

  logger.info(
    { considered: candidates.length, pagesNotified, claimsNotified, failed },
    "Claim-notification dispatch run complete",
  );
  res.json({ considered: candidates.length, pagesNotified, claimsNotified, failed });
});

/**
 * Reverts a notification stamp back to null for the given slots, but only the
 * ones this run set (matched on the exact timestamp), so a concurrent run's
 * stamps are never clobbered.
 */
async function releaseNotificationStamp(slotIds: string[], stamp: Date): Promise<void> {
  if (slotIds.length === 0) return;
  await db
    .update(slotsTable)
    .set({ recipientNotifiedAt: null })
    .where(
      and(
        inArray(slotsTable.id, slotIds),
        eq(slotsTable.recipientNotifiedAt, stamp),
      ),
    );
}

/**
 * POST /api/internal/founder-digest — cron endpoint #5.
 *
 * Composes the weekly founder digest from read-only analytics and sends exactly
 * one email to the founder. Follows the same shape as the other four cron
 * endpoints: secret-gated (fail closed), Neon woken before any query, JSON
 * summary out. Triggered weekly (Monday 08:00 Sydney) by the external cron.
 *
 * Read-only: computeFounderStats issues only SELECTs. The single side effect is
 * the one outbound email.
 */
router.post("/internal/founder-digest", async (req, res) => {
  if (!cronAuthorised(req, res)) return;

  await ensureDbAwake();

  const stats = await computeFounderStats();
  const sent = await sendFounderDigest(stats);

  logger.info(
    {
      sent,
      pagesCreatedWeek: stats.pages.createdWeek,
      giftsSoldWeek: stats.gifts.soldWeek,
    },
    "Founder digest dispatch run complete",
  );

  res.json({
    sent,
    weekStart: stats.weekStart.toISOString(),
    pagesCreatedWeek: stats.pages.createdWeek,
    giftsSoldWeek: stats.gifts.soldWeek,
  });
});

export default router;