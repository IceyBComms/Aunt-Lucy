import { Router, type IRouter } from "express";
import { db, slotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/slots/:slotId/claim", async (req, res) => {
  const { slotId } = req.params;
  const { firstName, contact, note } = req.body as {
    firstName: string;
    contact: string;
    note?: string;
  };

  if (!firstName || !contact) {
    res.status(400).json({ error: "First name and contact are required." });
    return;
  }

  const slot = await db.query.slotsTable.findFirst({
    where: eq(slotsTable.id, slotId),
  });

  if (!slot) {
    res.status(404).json({ error: "This slot doesn't exist." });
    return;
  }

  if (slot.isClaimed) {
    res.status(409).json({ error: "This slot has already been claimed by someone else." });
    return;
  }

  const [updated] = await db
    .update(slotsTable)
    .set({
      isClaimed: true,
      claimedByName: firstName.trim(),
      claimedByContact: contact.trim(),
      claimedNote: note?.trim() ?? null,
    })
    .where(eq(slotsTable.id, slotId))
    .returning();

  res.json({
    id: updated.id,
    pageId: updated.pageId,
    slotType: updated.slotType,
    customLabel: updated.customLabel ?? null,
    slotDate: updated.slotDate,
    slotTime: updated.slotTime ?? null,
    notes: updated.notes ?? null,
    isClaimed: updated.isClaimed,
    claimedByName: updated.claimedByName ?? null,
    claimedNote: updated.claimedNote ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
