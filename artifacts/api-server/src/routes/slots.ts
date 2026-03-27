import { Router, type IRouter } from "express";
import { db, slotsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

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

  // Verify slot exists before attempting claim
  const slot = await db.query.slotsTable.findFirst({
    where: eq(slotsTable.id, slotId),
  });

  if (!slot) {
    res.status(404).json({ error: "This slot doesn't exist." });
    return;
  }

  // Atomic conditional update: only update if is_claimed = false.
  // This prevents race conditions where two helpers claim simultaneously.
  // If the update returns 0 rows, the slot was already taken.
  const updated = await db
    .update(slotsTable)
    .set({
      isClaimed: true,
      claimedByName: firstName.trim(),
      claimedByContact: contact.trim(),
      claimedNote: note?.trim() ?? null,
    })
    .where(and(eq(slotsTable.id, slotId), eq(slotsTable.isClaimed, false)))
    .returning();

  if (updated.length === 0) {
    res.status(409).json({ error: "This slot has already been claimed by someone else." });
    return;
  }

  const [row] = updated;

  res.json({
    id: row.id,
    pageId: row.pageId,
    slotType: row.slotType,
    customLabel: row.customLabel ?? null,
    slotDate: row.slotDate,
    slotTime: row.slotTime ?? null,
    notes: row.notes ?? null,
    isClaimed: row.isClaimed,
    claimedByName: row.claimedByName ?? null,
    claimedNote: row.claimedNote ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
