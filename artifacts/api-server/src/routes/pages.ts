import { Router, type IRouter } from "express";
import { db, supportPagesTable, slotsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/pages/:slug", async (req, res) => {
  const { slug } = req.params;

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

  // NO PIN GATE. Dropped 21 September 2026 (Kate's ruling, bug #129). The PIN
  // was a leftover of the first build and contradicted the access model this
  // file already implements four lines down: the link is not the lock. What is
  // private is kept private by never being in the response — trusted-only tasks
  // are filtered out of the query, and their people arrive by invite link. A
  // second door with a code nobody could recover locked a real page (Pookey)
  // against the very helpers it was made for.
  //
  // Rows that still say privacy = "pin_protected" simply open. The column and
  // the enum value are left in place, dead, deliberately: switching a live
  // page's stored flag is a data change and belongs in its own job, and nothing
  // reads either any more.

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
    // Bug #033 — null on every task that isn't an answered lift, and the tile
    // renders nothing at all for null.
    liftWaitMode: slot.liftWaitMode,
    notes: slot.notes,
    dietaryNotes: slot.dietaryNotes,
    headcount: slot.headcount,
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
