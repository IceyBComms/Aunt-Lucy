import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  db,
  giftsTable,
  giftMessagesTable,
  supportPagesTable,
  helperInvitesTable,
  contactsTable,
} from "@workspace/db";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { firstName, giftLinkFor } from "../lib/giftFulfilment";
import { sendActivationReminder, sendGiftDelivery, sendHelperInviteEmail } from "../lib/email";
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
  type RecipientPronouns,
} from "../lib/inviteCopy";

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

  const now = new Date();

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

  logger.info({ claimed: claimed.length, sent, failed, cancelled }, "Dispatch run complete");
  res.json({ claimed: claimed.length, sent, failed, cancelled });
});

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

  const now = new Date();

  // Claim the batch by flipping queued → sent up front. As with the gift queue,
  // a mid-flight crash then drops a send rather than repeating one.
  const claimed = await db
    .update(helperInvitesTable)
    .set({ status: "sent", sentAt: now })
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
  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const invite of claimed) {
    const page = await db.query.supportPagesTable.findFirst({
      where: eq(supportPagesTable.id, invite.pageId),
    });
    // The contact may have opted out since the wave was scheduled.
    const contact = invite.contactId
      ? await db.query.contactsTable.findFirst({ where: eq(contactsTable.id, invite.contactId) })
      : null;

    if (!page || page.status === "closed" || (contact && contact.optedOutAt)) {
      await db
        .update(helperInvitesTable)
        .set({ status: "cancelled", sentAt: null })
        .where(eq(helperInvitesTable.id, invite.id));
      cancelled += 1;
      continue;
    }

    const helperFirstName = firstName(invite.name);
    const recipientFirstName = firstName(page.recipientName);
    const pronounsEnum = page.recipientPronouns as RecipientPronouns;
    const situationLine = applyPronounTokens(
      page.situationLine ?? defaultSituationLine(page.occasion ?? null),
      pronounsEnum,
    );
    const pronouns = resolvePronouns(pronounsEnum);
    const openingLine = invite.personalOpeningLine;

    let ok = false;
    if (invite.channel === "email" && invite.email) {
      ok = await sendHelperInviteEmail({
        to: invite.email,
        subject: generalInviteEmailSubject(recipientFirstName),
        text: generalInviteEmailText({
          helperFirstName,
          recipientFirstName,
          situationLine,
          pronounObj: pronouns.obj,
          link: `${base}/s/${page.slug}`,
          unsubscribeUrl: `${base}/unsubscribe/${invite.contactId}`,
          openingLine,
        }),
        link: `${base}/s/${page.slug}`,
        unsubscribeUrl: `${base}/unsubscribe/${invite.contactId}`,
        openingLine,
      });
    } else if (invite.mobile) {
      let body: string;
      if (invite.kind === "trusted" && invite.inviteToken) {
        body = trustedInviteSms({
          helperFirstName,
          recipientFirstName,
          trustedLine: applyPronounTokens(defaultTrustedLine(page.occasion ?? null), pronounsEnum),
          pronounPoss: pronouns.poss,
          link: `${base}/invite/${invite.inviteToken}`,
          openingLine,
        });
      } else if (invite.kind === "second_wave") {
        body = secondWaveSms({ helperFirstName, recipientFirstName, link: `${base}/s/${page.slug}`, openingLine });
      } else {
        body = generalInviteSms({ helperFirstName, recipientFirstName, situationLine, link: `${base}/s/${page.slug}`, openingLine });
      }
      ok = await sendSms({ to: invite.mobile, body });
    }

    if (ok) {
      sent += 1;
    } else {
      await db
        .update(helperInvitesTable)
        .set({ status: "failed", sentAt: null, failedAt: new Date() })
        .where(eq(helperInvitesTable.id, invite.id));
      failed += 1;
    }
  }

  logger.info({ claimed: claimed.length, sent, failed, cancelled }, "Invite dispatch run complete");
  res.json({ claimed: claimed.length, sent, failed, cancelled });
});

export default router;