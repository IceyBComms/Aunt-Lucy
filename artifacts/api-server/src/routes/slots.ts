import { Router, type IRouter } from "express";
import { db, slotsTable, supportPagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.post("/slots/:slotId/claim", async (req, res) => {
  const { slotId } = req.params;
  const { firstName, contact, note, pin } = req.body as {
    firstName: string;
    contact: string;
    note?: string;
    pin?: string;
  };

  if (!firstName || !contact) {
    res.status(400).json({ error: "First name and contact are required." });
    return;
  }

  // Load slot together with its parent page to enforce PIN protection
  const [result] = await db
    .select({ slot: slotsTable, page: supportPagesTable })
    .from(slotsTable)
    .innerJoin(supportPagesTable, eq(slotsTable.pageId, supportPagesTable.id))
    .where(eq(slotsTable.id, slotId))
    .limit(1);

  if (!result) {
    res.status(404).json({ error: "This slot doesn't exist." });
    return;
  }

  const { slot, page } = result;

  // PIN-protected pages require the PIN when claiming
  if (page.privacy === "pin_protected") {
    if (!pin || pin !== page.pin) {
      res.status(401).json({ error: "A valid PIN is required to claim a slot on this page." });
      return;
    }
  }

  // Atomic conditional update: only update if is_claimed = false.
  // Prevents race conditions where two helpers claim simultaneously.
  const updated = await db
    .update(slotsTable)
    .set({
      isClaimed: true,
      claimedByName: firstName.trim(),
      claimedByContact: contact.trim(),
      claimedNote: note?.trim() ?? null,
    })
    .where(and(eq(slotsTable.id, slot.id), eq(slotsTable.isClaimed, false)))
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
