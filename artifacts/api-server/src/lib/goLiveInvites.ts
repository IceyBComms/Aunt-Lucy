/**
 * WHEN A PAGE GOES LIVE, ITS INVITATIONS GO — independent of what made it live.
 *
 * Invitations added while a page is a draft are held (bug #113, Kate's ruling
 * 14 Sep 2026: nothing leaves a draft). The moment the page goes live they are
 * sent, through the shared sender (lib/queuedInviteSender.ts) and its atomic
 * pickup, so a go-live and a cron run can overlap without inviting anyone twice.
 *
 * WHY ONE HELPER, CALLED FROM EVERY GO-LIVE PATH. A page goes live in three
 * places — "Make it live" (routes/organiser.ts), scheduled activation
 * (routes/internal.ts) and a gift activated for right now, which creates the
 * page already live (routes/gifts.ts) — and the first version of this fix
 * widened only one of them, leaving a scheduled gift page's invitations waiting up to half an hour
 * for the cron. That is bug #025's shape exactly: two paths to the same event
 * with only one widened, which was live for eight days last time. So the rule
 * is stated once, here, and a source test (inviteSendRule.test.ts) fails if any
 * code that writes a page `active` does not call this.
 *
 * Callers call it AFTER responding. A slow or failing send must never turn into
 * a failed go-live on a page that is live — and on the cron path, a send inside
 * the request would risk cron-job.org's ~30-second ceiling (#026).
 *
 * The sender is passed in rather than imported so this file carries no
 * database, and its one promise — it never throws — can be tested directly.
 */
import { logger } from "./logger";

export type GoLiveTrigger = "publish" | "scheduled_activation" | "gift_activation";

export type SendPageInvites = (opts: { pageId: string }) => Promise<{ claimed: number }>;

export async function releaseHeldInvitesOnGoLive(
  pageId: string,
  trigger: GoLiveTrigger,
  send: SendPageInvites,
): Promise<void> {
  try {
    const run = await send({ pageId });
    if (run.claimed > 0) {
      logger.info({ pageId, trigger, ...run }, "Held invites released as the page went live");
    }
  } catch (err) {
    // Contained: the page is live whatever happens here. Anything this never
    // picked up is still queued, and /internal/dispatch-invites sends it on its
    // next run. An invite that WAS attempted and failed is stamped failed and
    // not retried (#048) — the cron is a safety net for "never tried", not for
    // "tried and refused".
    logger.error(
      { err, pageId, trigger },
      "Releasing held invites as the page went live failed — anything still queued goes on the next dispatch-invites run",
    );
  }
}
