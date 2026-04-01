import { Router, type IRouter } from "express";
import { db, supportPagesTable, slotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/pages/:slug", async (req, res) => {
  const { slug } = req.params;
  const { pin } = req.query as { pin?: string };

  const page = await db.query.supportPagesTable.findFirst({
    where: eq(supportPagesTable.slug, slug),
  });

  if (!page) {
    res.status(404).json({ error: "This support page doesn't exist or has been removed." });
    return;
  }

  if (page.status === "closed") {
    res.status(404).json({ error: "This support page has been closed." });
    return;
  }

  if (page.privacy === "pin_protected") {
    if (!pin || pin !== page.pin) {
      res.status(401).json({ error: "A PIN is required to view this page.", pinRequired: true });
      return;
    }
  }

  const slots = await db.query.slotsTable.findMany({
    where: eq(slotsTable.pageId, page.id),
    orderBy: (s, { asc }) => [asc(s.slotDate), asc(s.slotTime)],
  });

  const publicSlots = slots.map((slot) => ({
    id: slot.id,
    pageId: slot.pageId,
    slotType: slot.slotType,
    customLabel: slot.customLabel,
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    // Hide task instructions for invitation-only slots on the public page
    notes: slot.trustedHelpersOnly ? null : slot.notes,
    isClaimed: slot.isClaimed,
    claimedByName: slot.claimedByName ?? null,
    claimedNote: slot.claimedNote ?? null,
    invitationOnly: slot.trustedHelpersOnly,
    createdAt: slot.createdAt.toISOString(),
  }));

  res.json({
    id: page.id,
    slug: page.slug,
    recipientName: page.recipientName,
    situationDescription: page.situationDescription ?? null,
    location: page.location ?? null,
    status: page.status,
    privacy: page.privacy,
    slots: publicSlots,
  });
});

export default router;
