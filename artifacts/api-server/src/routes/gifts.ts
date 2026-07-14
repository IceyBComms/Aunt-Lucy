import { Router, type IRouter } from "express";
import { db, giftsTable, giftSigningsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

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
