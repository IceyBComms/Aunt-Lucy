/**
 * Turns a successful payment into a delivered gift.
 *
 * Shared by the Stripe webhook (which fulfils at payment time) and the
 * scheduled dispatcher (which sends anything the webhook queued for later), so
 * an immediate gift and a future-dated one travel the same path.
 */
import { db, giftsTable, giftMessagesTable, type Gift } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { getAppBaseUrl } from "./appUrl";
import { firstName } from "./names";
import { gstBreakdown } from "./gst";
import { giftReference, tierName } from "./giftPricing";
import {
  buildDeliveryLine,
  sendBuyerConfirmation,
  sendGiftDelivery,
  sendOrganiserCardShare,
} from "./email";

/**
 * How long after delivery the single activation nudge fires.
 *
 * The brief describes this as "the chosen date, else +14 days". Anchoring it to
 * the delivery date rather than the purchase date is deliberate: a gift
 * scheduled three weeks out would otherwise be nudged about before it had even
 * arrived.
 */
const REMINDER_DELAY_DAYS = 14;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// Re-exported from its own module so copy/notify code can use it without
// importing this one, which opens a database connection at module scope.
export { firstName };

export function giftLinkFor(redemptionToken: string): string {
  return `${getAppBaseUrl()}/gift/${redemptionToken}`;
}

/** The public "sign the card" link shared with the whole team. */
export function signingLinkFor(signingToken: string): string {
  return `${getAppBaseUrl()}/sign/${signingToken}`;
}

/** The organiser's private review / remove / seal link. */
export function cardReviewLinkFor(organiserToken: string): string {
  return `${getAppBaseUrl()}/card/${organiserToken}`;
}

/**
 * Queues the recipient's keepsake and the single activation nudge, sending the
 * keepsake immediately if its delivery date has already arrived.
 *
 * Shared by the consumer fulfilment path (delivered at payment) and the
 * workplace card path (delivered only once the card is sealed), so both follow
 * the exact same dispatcher-backed route. The caller guarantees a recipient
 * email; a gift with none is delivered by hand and never reaches here.
 */
async function queueAndSendKeepsake(params: {
  gift: Gift;
  deliverAt: Date;
  remindAt: Date;
  now: Date;
}): Promise<void> {
  const { gift, deliverAt, remindAt, now } = params;
  const deliverNow = deliverAt <= now;

  // ── Keepsake — now, or queued for the chosen date ──
  await db.insert(giftMessagesTable).values({
    giftId: gift.id,
    type: "gift_delivery",
    toName: gift.recipientName,
    toEmail: gift.recipientEmail,
    subject: "Someone's got you",
    // The dispatcher re-renders from the gift row at send time, so this is a
    // human-readable record of what is queued, not the wire content. Copy fixes
    // therefore reach mail that is already sitting in the queue.
    body: `Gift delivery keepsake for ${gift.recipientName}, from ${gift.purchaserName}.`,
    scheduledFor: deliverAt,
    ...(deliverNow ? { status: "sent" as const, sentAt: now } : {}),
  });

  if (deliverNow) {
    try {
      await sendGiftDelivery({
        to: gift.recipientEmail!,
        recipientFirstName: firstName(gift.recipientName),
        buyerFirstName: firstName(gift.purchaserName),
        giftLink: giftLinkFor(gift.redemptionToken),
        occasion: gift.occasion,
      });
      await db
        .update(giftsTable)
        .set({ status: "delivered", deliveredAt: now })
        .where(eq(giftsTable.id, gift.id));
      logger.info({ giftId: gift.id }, "Gift delivered immediately");
    } catch (err) {
      logger.error({ err, giftId: gift.id }, "Immediate gift delivery failed");
    }
  }

  // ── The single gentle nudge ──
  await db.insert(giftMessagesTable).values({
    giftId: gift.id,
    type: "activation_reminder",
    toName: gift.recipientName,
    toEmail: gift.recipientEmail,
    subject: "Still here whenever you're ready",
    body: `Activation nudge for ${gift.recipientName} if the gift is still unopened.`,
    scheduledFor: remindAt,
  });
}

/**
 * Marks a gift paid, emails the buyer their receipt, and either delivers the
 * keepsake now or queues it for the buyer's chosen date.
 *
 * A workplace card gift is the exception: nothing is delivered to the recipient
 * at payment, because the card is a surprise that must not be opened
 * half-signed. Instead the organiser is emailed the signing link, and the
 * keepsake reaches the recipient only once the card is sealed — see sealCard().
 *
 * Email failures are logged rather than thrown: the payment has already
 * succeeded, so the database must reflect that even if Resend is having a bad
 * day. A dropped email is recoverable by hand; a gift stuck in `pending` while
 * the customer's card has been charged is not.
 */
export async function fulfilPaidGift(params: {
  gift: Gift;
  amountCents: number;
  currency: string;
  paymentReference: string;
}): Promise<void> {
  const { gift, amountCents, currency, paymentReference } = params;

  const now = new Date();
  const deliverAt = gift.deliverAt ?? now;
  const remindAt = addDays(deliverAt, REMINDER_DELAY_DAYS);
  const hasRecipientEmail = !!gift.recipientEmail;
  const isCardGift = !!gift.signingToken;

  await db
    .update(giftsTable)
    .set({
      status: "paid",
      paymentProvider: "stripe",
      paymentReference,
      amountCents,
      currency,
      deliverAt,
      remindAt,
    })
    .where(eq(giftsTable.id, gift.id));

  logger.info(
    { giftId: gift.id, amountCents, currency, isCardGift },
    "Gift marked paid",
  );

  // ── Buyer receipt — always immediate ──
  try {
    await sendBuyerConfirmation({
      to: gift.purchaserEmail,
      buyerFirstName: firstName(gift.purchaserName),
      recipientFirstName: firstName(gift.recipientName),
      deliveryLine: buildDeliveryLine({ deliverAt, now }),
      selfDeliveryLink:
        hasRecipientEmail || isCardGift
          ? null
          : giftLinkFor(gift.redemptionToken),
      giftReference: giftReference(gift.id),
      purchaseDate: now,
      tierName: tierName(amountCents),
      breakdown: gstBreakdown(amountCents),
      currency,
    });
  } catch (err) {
    logger.error({ err, giftId: gift.id }, "Buyer confirmation email failed");
  }

  // ── Workplace card: the buyer is the organiser; send them the signing link ──
  // Nothing goes to the recipient yet. Delivery waits for the seal (manual, or
  // auto-sealed at deliver_at by the dispatcher), so the card is never opened
  // half-signed and there are no per-signature pings.
  if (isCardGift) {
    try {
      await sendOrganiserCardShare({
        to: gift.purchaserEmail,
        organiserFirstName: firstName(gift.purchaserName),
        recipientFirstName: firstName(gift.recipientName),
        signingLink: signingLinkFor(gift.signingToken!),
        organiserLink: gift.organiserToken
          ? cardReviewLinkFor(gift.organiserToken)
          : null,
      });
    } catch (err) {
      logger.error({ err, giftId: gift.id }, "Organiser card-share email failed");
    }
    return;
  }

  // The buyer kept delivery in their own hands: there is no recipient address
  // to send to and nobody to nudge, so the link in their receipt is the whole
  // handover. Nothing is queued.
  if (!hasRecipientEmail) {
    logger.info(
      { giftId: gift.id },
      "No recipient email — buyer is delivering the link themselves",
    );
    return;
  }

  await queueAndSendKeepsake({ gift, deliverAt, remindAt, now });
}

/**
 * Seals ("sends") a workplace team card, then delivers the keepsake.
 *
 * Shared by the organiser's explicit "Send the card" action and the dispatcher
 * auto-seal that fires if a card is never sealed by its delivery date. Sealing
 * closes the card to new notes and triggers delivery — now, or scheduled for
 * the buyer's chosen deliver_at, exactly like a consumer gift.
 *
 * Idempotent: a card already sealed is left untouched, so an overlapping
 * dispatcher run and a late manual seal can't double-deliver.
 *
 * Returns what happened, so the caller can react — an organiser sealing a card
 * with no recipient email is told to hand the link over themselves.
 */
export async function sealCard(params: {
  gift: Gift;
  now?: Date;
  reason: "organiser" | "auto";
}): Promise<
  | { sealed: false; reason: "already_sealed" }
  | { sealed: true; delivery: "sent" | "scheduled" | "manual"; giftLink: string }
> {
  const { gift, reason } = params;
  const now = params.now ?? new Date();

  // Claim the seal atomically: only flip a card that is still open. RETURNING
  // tells us whether this call is the one that sealed it, so two overlapping
  // runs can never both go on to deliver.
  const [sealedRow] = await db
    .update(giftsTable)
    .set({ cardSealedAt: now })
    .where(and(eq(giftsTable.id, gift.id), isNull(giftsTable.cardSealedAt)))
    .returning();

  if (!sealedRow) {
    return { sealed: false, reason: "already_sealed" };
  }

  logger.info({ giftId: gift.id, reason }, "Team card sealed");

  const giftLink = giftLinkFor(gift.redemptionToken);
  const deliverAt = gift.deliverAt ?? now;
  const remindAt = gift.remindAt ?? addDays(deliverAt, REMINDER_DELAY_DAYS);

  // No recipient email means we cannot deliver by email — the organiser passes
  // the link on by hand, the same as a consumer gift bought without one. The
  // card is still sealed (signing is closed); only the send channel differs.
  if (!gift.recipientEmail) {
    logger.info(
      { giftId: gift.id },
      "Card sealed but no recipient email — organiser delivers the link by hand",
    );
    return { sealed: true, delivery: "manual", giftLink };
  }

  await queueAndSendKeepsake({ gift: sealedRow, deliverAt, remindAt, now });

  return {
    sealed: true,
    delivery: deliverAt <= now ? "sent" : "scheduled",
    giftLink,
  };
}
