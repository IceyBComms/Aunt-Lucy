import { Router, type IRouter } from "express";
import { db, giftsTable, giftSigningsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { TIERS, sellableTier } from "../lib/giftPricing";
import { uniqueToken } from "../lib/token";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const OCCASIONS = [
  "new_baby",
  "illness_recovery",
  "bereavement",
  "ongoing_support",
  "other",
] as const;

type Occasion = (typeof OCCASIONS)[number];

function asOccasion(value: unknown): Occasion | null {
  return typeof value === "string" && OCCASIONS.includes(value as Occasion)
    ? (value as Occasion)
    : null;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asEmail(value: unknown): string | null {
  const email = trimmed(value);
  return email.includes("@") ? email : null;
}

// GET /api/gift-tiers — what can be bought, and for how much.
//
// The price lives on the server so the buyer-facing figure can never drift from
// what the Stripe link actually charges. Note what is NOT in the response:
// paymentLink. A pack tier has no link at all, and a sellable tier's link is
// only ever used server-side by POST /gifts below, so the browser is never
// handed a URL it could use to skip creating the gift row.
router.get("/gift-tiers", async (_req, res) => {
  res.json(
    TIERS.map((tier) => ({
      id: tier.id,
      label: tier.label,
      blurb: tier.blurb,
      amountCents: tier.amountCents,
      gifts: tier.gifts,
      sellable: tier.sellable,
    })),
  );
});

// POST /api/gifts — create the pending gift, then hand back where to pay.
//
// This is the front half of the purchase handshake. The row must exist before
// the buyer reaches Stripe, because the Stripe webhook (Item 3) matches the
// payment back by client_reference_id = gift.id and can do nothing at all if no
// row is waiting. Appending that parameter here rather than in the browser is
// deliberate: it makes it structurally impossible to send someone to checkout
// without the handshake attached.
router.post("/gifts", async (req, res) => {
  const body = req.body as Record<string, unknown>;

  // The pack gate. sellableTier() returns undefined for the 5- and 10-packs, so
  // a hand-crafted request naming one is refused here — the UI gate on the tier
  // picker is presentation, this is the one that counts. See giftPricing.ts.
  const tier = sellableTier(trimmed(body.tierId));
  if (!tier?.paymentLink) {
    res.status(400).json({ error: "That gift isn't available to buy yet." });
    return;
  }

  const purchaserName = trimmed(body.purchaserName);
  const purchaserEmail = asEmail(body.purchaserEmail);
  if (!purchaserName || !purchaserEmail) {
    res.status(400).json({ error: "Just need a name and a situation — that's all." });
    return;
  }

  const forSelf = body.forSelf === true;
  const recipientName = forSelf ? purchaserName : trimmed(body.recipientName);
  if (!recipientName) {
    res.status(400).json({ error: "Just need a name and a situation — that's all." });
    return;
  }

  // When the buyer is setting this up for themselves they are the recipient, so
  // the gift is delivered to them and there is no "from" note to show.
  //
  // Otherwise recipientEmail may be null: the buyer chose to pass the link on
  // themselves (they gave a mobile, or nothing). Item 3 already reads a null
  // recipient email as "send the link to the buyer to deliver by hand", so
  // there is nothing more to record here — and deliberately no mobile column,
  // since gathering the recipient's contact details is Items 4 and 5.
  const recipientEmail = forSelf ? purchaserEmail : asEmail(body.recipientEmail);

  const giftedByNote = forSelf ? null : trimmed(body.giftedByNote) || null;

  // "Now" arrives as null rather than a timestamp — fulfilPaidGift treats null
  // as "as soon as the payment clears", which is exactly right and avoids a
  // date in the past if the buyer sits on the Stripe page for a while.
  const deliverAtRaw = trimmed(body.deliverAt);
  const deliverAt = deliverAtRaw ? new Date(deliverAtRaw) : null;
  if (deliverAt && Number.isNaN(deliverAt.getTime())) {
    res.status(400).json({ error: "That delivery date doesn't look right." });
    return;
  }

  const redemptionToken = await uniqueToken(async (token) => {
    const existing = await db.query.giftsTable.findFirst({
      where: eq(giftsTable.redemptionToken, token),
    });
    return !!existing;
  });

  const [gift] = await db
    .insert(giftsTable)
    .values({
      redemptionToken,
      purchaserName,
      purchaserEmail,
      recipientName,
      recipientEmail,
      occasion: asOccasion(body.occasion),
      giftedByNote,
      // Never from the client — the buyer cannot choose their own price.
      amountCents: tier.amountCents,
      currency: "AUD",
      status: "pending",
      deliverAt,
    })
    .returning();

  // ── The handshake ──
  // gift.id, not redemptionToken: the webhook looks the gift up by primary key,
  // and the redemption token is the recipient's private URL — it must never
  // travel through a payment query string.
  const checkoutUrl = new URL(tier.paymentLink);
  checkoutUrl.searchParams.set("client_reference_id", gift.id);

  logger.info(
    { giftId: gift.id, tierId: tier.id, amountCents: tier.amountCents },
    "Pending gift created, sending buyer to checkout",
  );

  res.status(201).json({ checkoutUrl: checkoutUrl.toString() });
});

router.get("/gifts/:redemptionToken", async (req, res) => {
  const { redemptionToken } = req.params;

  const gift = await db.query.giftsTable.findFirst({
    where: eq(giftsTable.redemptionToken, redemptionToken),
  });

  if (!gift) {
    res.status(404).json({ error: "This gift link isn't valid." });
    return;
  }

  // The gift experience is a read-only keepsake and is shown even before it
  // has been delivered (delivered_at may still be null) — we deliberately do
  // not gate on delivery here.
  const signings = await db.query.giftSigningsTable.findMany({
    where: eq(giftSigningsTable.giftId, gift.id),
    orderBy: (s, { asc }) => [asc(s.createdAt)],
  });

  res.json({
    recipientName: gift.recipientName,
    organisationMessage: gift.giftedByNote ?? null,
    giftedBy: gift.purchaserName,
    occasion: gift.occasion ?? null,
    signings: signings.map((s) => ({
      signerName: s.signerName,
      message: s.message,
    })),
  });
});

export default router;
