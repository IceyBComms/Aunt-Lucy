import { Router, type IRouter } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { db, giftsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * POST /api/dev/gifts — mint a pending gift so the Stripe webhook can be driven
 * end to end before Item 2 (the purchase form) exists.
 *
 * This router is only registered when NODE_ENV !== "production" (see
 * routes/index.ts), so it cannot exist on Railway. It is scaffolding: delete it
 * once Item 2 creates the pending row for real.
 */
router.post("/dev/gifts", async (req, res) => {
  const {
    purchaserName = "Test Buyer",
    purchaserEmail,
    recipientName = "Test Recipient",
    recipientEmail,
    amountCents = 5900,
    deliverAt,
    occasion = "new_baby",
    giftedByNote,
  } = req.body as Record<string, unknown>;

  if (typeof purchaserEmail !== "string" || !purchaserEmail.includes("@")) {
    res.status(400).json({ error: "purchaserEmail is required." });
    return;
  }

  const id = randomUUID();
  const [gift] = await db
    .insert(giftsTable)
    .values({
      id,
      redemptionToken: randomBytes(24).toString("base64url"),
      purchaserName: String(purchaserName),
      purchaserEmail,
      recipientName: String(recipientName),
      recipientEmail:
        typeof recipientEmail === "string" && recipientEmail.includes("@")
          ? recipientEmail
          : null,
      amountCents: Number(amountCents),
      currency: "AUD",
      status: "pending",
      occasion: occasion as never,
      giftedByNote: typeof giftedByNote === "string" ? giftedByNote : null,
      deliverAt: typeof deliverAt === "string" ? new Date(deliverAt) : null,
    })
    .returning();

  logger.info({ giftId: gift.id }, "Dev pending gift created");

  res.status(201).json({
    giftId: gift.id,
    redemptionToken: gift.redemptionToken,
    // Paste this onto the Stripe payment link, or pass it to the Stripe CLI as
    // the checkout session's client_reference_id.
    clientReferenceId: gift.id,
  });
});

export default router;