/**
 * Turns a successful payment into a delivered gift.
 *
 * Shared by the Stripe webhook (which fulfils at payment time) and the
 * scheduled dispatcher (which sends anything the webhook queued for later), so
 * an immediate gift and a future-dated one travel the same path.
 */
import { db, giftsTable, giftMessagesTable, type Gift } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getAppBaseUrl } from "./appUrl";
import { gstBreakdown } from "./gst";
import { giftReference, tierName } from "./giftPricing";
import {
  buildDeliveryLine,
  sendBuyerConfirmation,
  sendGiftDelivery,
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

/** First name only — the email copy addresses people informally throughout. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}

export function giftLinkFor(redemptionToken: string): string {
  return `${getAppBaseUrl()}/gift/${redemptionToken}`;
}

/**
 * Marks a gift paid, emails the buyer their receipt, and either delivers the
 * keepsake now or queues it for the buyer's chosen date.
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
  const deliverNow = deliverAt <= now;
  const remindAt = addDays(deliverAt, REMINDER_DELAY_DAYS);
  const hasRecipientEmail = !!gift.recipientEmail;

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
    { giftId: gift.id, amountCents, currency, deliverNow },
    "Gift marked paid",
  );

  // ── Buyer receipt — always immediate ──
  try {
    await sendBuyerConfirmation({
      to: gift.purchaserEmail,
      buyerFirstName: firstName(gift.purchaserName),
      recipientFirstName: firstName(gift.recipientName),
      deliveryLine: buildDeliveryLine({ deliverAt, now }),
      selfDeliveryLink: hasRecipientEmail
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