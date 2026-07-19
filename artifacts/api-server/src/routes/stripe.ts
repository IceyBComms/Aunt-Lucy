import { Router, type IRouter } from "express";
import Stripe from "stripe";
import { db, giftsTable, stripeWebhookEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { fulfilPaidGift } from "../lib/giftFulfilment";

const router: IRouter = Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

/**
 * Postgres unique-violation. A duplicate Stripe event id loses the insert race
 * against the delivery that got there first, which is exactly how we detect it.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/**
 * POST /api/stripe/webhook — the listener that turns a payment into a gift.
 *
 * The raw request body is required for signature verification, so this path is
 * mounted with express.raw() ahead of express.json() in app.ts.
 *
 * Almost everything here answers 200. Stripe retries any non-2xx until it gives
 * up, so a 4xx/5xx for a problem *we* need to fix (an unknown gift, a failed
 * email) buys nothing but a retry storm. Only a failed signature check — the
 * one case where the request may not be from Stripe at all — returns an error.
 */
router.post("/stripe/webhook", async (req, res) => {
  if (!stripe || !webhookSecret) {
    logger.error(
      "STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not set — webhook cannot verify events",
    );
    res.status(503).json({ error: "Stripe is not configured." });
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    res.status(400).json({ error: "Missing stripe-signature header." });
    return;
  }

  // express.raw() leaves the body as a Buffer; anything else means the route
  // ordering in app.ts has been disturbed and signatures would silently fail.
  if (!Buffer.isBuffer(req.body)) {
    logger.error(
      "Stripe webhook body is not raw — check the express.raw() mount in app.ts",
    );
    res.status(500).json({ error: "Webhook misconfigured." });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      "Stripe webhook signature verification failed",
    );
    res.status(400).json({ error: "Invalid signature." });
    return;
  }

  // ── Idempotency, layer 1: the event ledger ──
  // Recorded before any work, so a retry or a dashboard replay of the same
  // event can never reach the emails a second time.
  try {
    await db.insert(stripeWebhookEventsTable).values({
      eventId: event.id,
      type: event.type,
      giftId:
        event.type === "checkout.session.completed"
          ? ((event.data.object as Stripe.Checkout.Session).client_reference_id ??
            null)
          : null,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      logger.info(
        { eventId: event.id, type: event.type },
        "Stripe event already processed — ignoring duplicate",
      );
      res.json({ received: true, duplicate: true });
      return;
    }
    throw err;
  }

  try {
    await handleEvent(event);
  } catch (err) {
    // The event is already in the ledger, so this will not be retried. Log
    // loudly: it needs a human, not another delivery attempt.
    logger.error(
      { err, eventId: event.id, type: event.type },
      "Stripe webhook handler failed after the event was recorded",
    );
  }

  res.json({ received: true });
});

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;

    case "checkout.session.async_payment_failed":
      await markGiftStatus(
        (event.data.object as Stripe.Checkout.Session).client_reference_id,
        "failed",
        "Async payment failed",
      );
      return;

    case "charge.refunded":
      // Log-and-mark only: full refund automation is out of scope, so nothing
      // is clawed back or unsent here.
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      return;

    default:
      logger.debug({ type: event.type }, "Unhandled Stripe event type");
  }
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const giftId = session.client_reference_id;
  if (!giftId) {
    logger.error(
      { sessionId: session.id },
      "Checkout session has no client_reference_id — cannot match it to a gift",
    );
    return;
  }

  const gift = await db.query.giftsTable.findFirst({
    where: eq(giftsTable.id, giftId),
  });

  if (!gift) {
    logger.error(
      { sessionId: session.id, giftId },
      "Checkout session references a gift that does not exist",
    );
    return;
  }

  // ── Idempotency, layer 2: gift state ──
  if (gift.status !== "pending") {
    logger.info(
      { giftId, status: gift.status },
      "Gift is no longer pending — skipping fulfilment",
    );
    return;
  }

  // amount_total is 0 for a 100%-off comp and null only on sessions that were
  // never priced. Both are treated as $0 and still deliver: a VIP gift is a
  // real gift.
  const amountCents = session.amount_total ?? 0;

  await fulfilPaidGift({
    gift,
    amountCents,
    currency: (session.currency ?? "aud").toUpperCase(),
    paymentReference: session.id,
  });
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  // A charge knows its payment intent but not the checkout session, while we
  // store the session id as the payment reference. Ask Stripe which session the
  // intent belongs to, then match on that.
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);

  if (!paymentIntentId || !stripe) {
    logger.warn(
      { chargeId: charge.id },
      "Refunded charge has no payment intent — needs manual review",
    );
    return;
  }

  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  const sessionId = sessions.data[0]?.id;

  const gift = sessionId
    ? await db.query.giftsTable.findFirst({
        where: eq(giftsTable.paymentReference, sessionId),
      })
    : undefined;

  if (!gift) {
    logger.warn(
      { chargeId: charge.id, paymentIntentId, sessionId },
      "Refunded charge could not be matched to a gift — needs manual review",
    );
    return;
  }

  await db
    .update(giftsTable)
    .set({ status: "refunded" })
    .where(eq(giftsTable.id, gift.id));

  logger.info({ giftId: gift.id, chargeId: charge.id }, "Gift marked refunded");
}

async function markGiftStatus(
  giftId: string | null,
  status: "failed",
  reason: string,
): Promise<void> {
  if (!giftId) {
    logger.warn({ reason }, "Stripe event has no client_reference_id");
    return;
  }

  await db
    .update(giftsTable)
    .set({ status })
    .where(eq(giftsTable.id, giftId));

  logger.warn({ giftId, status }, reason);
}

export default router;