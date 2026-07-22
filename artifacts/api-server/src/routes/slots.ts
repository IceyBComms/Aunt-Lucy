import { Router, type IRouter } from "express";
import { db, slotsTable, supportPagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendClaimConfirmation } from "../lib/email";
import { verifyPin } from "../lib/pin";

const router: IRouter = Router();

router.post("/slots/:slotId/claim", async (req, res) => {
  const { slotId } = req.params;
  const { firstName, contact, note, pin, showName } = req.body as {
    firstName: string;
    contact: string;
    note?: string;
    pin?: string;
    showName?: boolean;
  };

  const firstNameTrimmed = typeof firstName === "string" ? firstName.trim() : "";
  const contactTrimmed = typeof contact === "string" ? contact.trim() : "";

  if (!firstNameTrimmed || !contactTrimmed) {
    res.status(400).json({ error: "First name and contact are required." });
    return;
  }
  if (firstNameTrimmed.length > 100 || contactTrimmed.length > 200) {
    res.status(400).json({ error: "Input exceeds maximum length." });
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

  // Only allow claiming on active pages
  if (page.status !== "active") {
    res.status(404).json({ error: "This slot doesn't exist." });
    return;
  }

  // PIN-protected pages require the PIN when claiming
  if (page.privacy === "pin_protected") {
    if (!pin || !(await verifyPin(pin, page.pin))) {
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
      claimedByName: firstNameTrimmed,
      claimedByContact: contactTrimmed,
      claimedNote: note?.trim() ?? null,
      claimedAt: new Date(),
      // Opt-in, defaulting false: the name is shown to other helpers on the
      // public page only if the helper ticked "show my name". The recipient sees
      // it either way (via /manage), so this flag never hides it from them.
      claimedNameVisible: showName === true,
    })
    .where(and(eq(slotsTable.id, slot.id), eq(slotsTable.isClaimed, false)))
    .returning();

  if (updated.length === 0) {
    res.status(409).json({ error: "This slot has already been claimed by someone else." });
    return;
  }

  const [row] = updated;

  void sendClaimConfirmation({
    helperFirstName: firstNameTrimmed,
    helperContact: contactTrimmed,
    recipientName: page.recipientName,
    slotType: row.slotType,
    customLabel: row.customLabel,
    slotDate: row.slotDate,
    slotTime: row.slotTime,
    notes: row.notes,
    location: page.location,
  });

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
