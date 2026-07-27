import { Router, type IRouter } from "express";
import { db, supportPagesTable, slotsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { verifyPin } from "../lib/pin";

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

  // A page that isn't active yet is not public — this covers an organiser's
  // half-finished wizard and, more importantly, a gift the recipient activated
  // with a future go-live date. "Nothing is visible to anyone until then" is a
  // promise made on the activation screen, and this is where it is kept.
  if (page.status !== "active") {
    res.status(404).json({ error: "This support page isn't available yet." });
    return;
  }

  if (page.privacy === "pin_protected") {
    if (!pin || !(await verifyPin(pin, page.pin))) {
      res.status(401).json({ error: "A PIN is required to view this page.", pinRequired: true });
      return;
    }
  }

  // Trusted-only tasks are not part of the public page at all — they are
  // filtered out in the query, so the row never leaves the database. Their
  // people reach them through the invite link, never through /s/:slug.
  const slots = await db.query.slotsTable.findMany({
    where: and(
      eq(slotsTable.pageId, page.id),
      eq(slotsTable.trustedHelpersOnly, false),
    ),
    orderBy: (s, { asc }) => [asc(s.slotDate), asc(s.slotTime)],
  });

  const publicSlots = slots.map((slot) => ({
    id: slot.id,
    pageId: slot.pageId,
    slotType: slot.slotType,
    customLabel: slot.customLabel,
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    notes: slot.notes,
    isClaimed: slot.isClaimed,
    // Name is shown to other helpers ONLY if the claimer opted in. Everyone else
    // sees the ambient count below instead — hidden by default, never surprised
    // into being shown. The recipient sees names via /manage, not this endpoint.
    claimedByName: slot.claimedNameVisible ? (slot.claimedByName ?? null) : null,
    // The claim note is a private message to the recipient — never public. It is
    // surfaced on /manage, not here.
    claimedNote: null,
    createdAt: slot.createdAt.toISOString(),
  }));

  // Ambient presence: distinct people helping, deduped by claimed contact (which
  // stays stable even when a helper's name is hidden). Someone who claimed two
  // tasks counts once. Trusted-only slots are excluded here by the query above,
  // so this reflects the public page — a warm signal, never a roster.
  const helpingCount = new Set(
    slots
      .filter((s) => s.isClaimed)
      .map((s) => s.claimedByContact ?? `slot:${s.id}`),
  ).size;

  res.json({
    id: page.id,
    slug: page.slug,
    recipientName: page.recipientName,
    situationDescription: page.situationDescription ?? null,
    location: page.location ?? null,
    status: page.status,
    privacy: page.privacy,
    goodToKnow: page.goodToKnow ?? null,
    helpingCount,
    slots: publicSlots,
  });
});

export default router;
