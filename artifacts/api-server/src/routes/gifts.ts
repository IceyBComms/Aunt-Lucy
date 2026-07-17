import { Router, type IRouter } from "express";
import { db, giftsTable, giftSigningsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// The public gift experience page. The recipient (and colleagues via the
// signing link) reach a gift only through its unguessable redemption token —
// the internal id is never exposed, mirroring how support pages use slugs.
router.get("/gifts/:token", async (req, res) => {
  const { token } = req.params;

  const gift = await db.query.giftsTable.findFirst({
    where: eq(giftsTable.redemptionToken, token),
  });

  if (!gift) {
    res.status(404).json({ error: "This gift link is invalid or has expired." });
    return;
  }

  const signings = await db.query.giftSigningsTable.findMany({
    where: eq(giftSigningsTable.giftId, gift.id),
    orderBy: (s, { asc }) => [asc(s.createdAt)],
  });

  res.json({
    recipientName: gift.recipientName,
    purchaserName: gift.purchaserName,
    giftedByNote: gift.giftedByNote ?? null,
    occasion: gift.occasion ?? null,
    status: gift.status,
    redeemedAt: gift.redeemedAt ? gift.redeemedAt.toISOString() : null,
    signings: signings.map((s) => ({
      signerName: s.signerName,
      message: s.message,
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

export default router;
