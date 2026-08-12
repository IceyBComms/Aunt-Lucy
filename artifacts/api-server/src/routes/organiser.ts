import { Router, type IRouter } from "express";
import { db, supportPagesTable, slotsTable, pilotApplicationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth";
import { hashPin } from "../lib/pin";
import { isAdminEmail } from "../lib/admin";
import { uniqueSlug } from "../lib/slug";
import { defaultFlexibility } from "../lib/slotFlexibility";
import { grantRecipientAccess } from "../lib/accessGrants";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Coerce a client-supplied headcount into a sane positive integer, or null.
 * Accepts a number or a numeric string (a form input often sends the latter).
 * Caps at 100 — a meal train, not a wedding — so a scripted request can't stash
 * an absurd value. Anything non-positive or unparseable becomes null (the field
 * is always optional).
 */
function parseHeadcount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseInt(value, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  const rounded = Math.floor(n);
  if (rounded < 1) return null;
  return Math.min(rounded, 100);
}

// POST /api/organiser/pages — create a new support page (draft)
router.post("/organiser/pages", requireAuth as any, async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const { recipientName, situationDescription, location, privacy, pin } = req.body as {
    recipientName?: string;
    situationDescription?: string;
    location?: string;
    privacy?: string;
    pin?: string;
  };

  const nameTrimmed = typeof recipientName === "string" ? recipientName.trim() : "";
  if (!nameTrimmed) {
    res.status(400).json({ error: "Recipient name is required." });
    return;
  }

  let hashedPin: string | null = null;
  if (privacy === "pin_protected") {
    const pinTrimmed = typeof pin === "string" ? pin.trim() : "";
    if (!pinTrimmed || !/^\d{4,8}$/.test(pinTrimmed)) {
      res.status(400).json({ error: "A 4–8 digit PIN is required for PIN-protected pages." });
      return;
    }
    hashedPin = await hashPin(pinTrimmed);
  }

  const slug = await uniqueSlug();

  const [page] = await db
    .insert(supportPagesTable)
    .values({
      slug,
      organiserId: authReq.organiserId,
      recipientName: nameTrimmed,
      situationDescription: typeof situationDescription === "string" ? situationDescription.trim() || null : null,
      location: typeof location === "string" ? location.trim() || null : null,
      privacy: (privacy === "pin_protected" ? "pin_protected" : "open") as "open" | "pin_protected",
      pin: hashedPin,
      status: "draft",
      // Ledger marker (Item 14): a wizard-built page, distinct from a
      // crisis-free or gift-redeemed page. Additive — not the paid path.
      origin: "organiser",
    })
    .returning();

  // Section E — the affected person's own always-on access. Optional; acted on
  // only when the setup person has their contact AND says they're ready to be
  // looped in. Not-ready / blank persists nothing (Option 1); the /manage nudge
  // invites completing it later. Both outcomes logged for Option 1 sizing.
  const recipientContact =
    typeof (req.body as any)?.recipientContact === "string"
      ? (req.body as any).recipientContact.trim()
      : "";
  const recipientReady = (req.body as any)?.recipientReady === true;
  const contactLooksValid =
    !!recipientContact &&
    (recipientContact.includes("@")
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientContact)
      : /\d/.test(recipientContact));

  if (recipientContact && recipientReady && contactLooksValid) {
    await grantRecipientAccess({
      pageId: page.id,
      recipientName: nameTrimmed,
      contact: recipientContact,
    });
    logger.info(
      { event: "recipient_access_looped_in", pageId: page.id, source: "organiser_setup" },
      "Recipient given their own access at organiser setup",
    );
  } else {
    logger.info(
      { event: "recipient_access_deferred", pageId: page.id, flow: "organiser" },
      "Recipient's own access deferred at organiser setup (not ready or blank)",
    );
  }

  res.status(201).json({
    id: page.id,
    slug: page.slug,
    recipientName: page.recipientName,
    situationDescription: page.situationDescription,
    location: page.location,
    status: page.status,
    privacy: page.privacy,
    createdAt: page.createdAt.toISOString(),
  });
});

// POST /api/organiser/pages/:pageId/slots — add a slot
router.post("/organiser/pages/:pageId/slots", requireAuth as any, async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const { pageId } = req.params;

  const page = await db.query.supportPagesTable.findFirst({
    where: and(
      eq(supportPagesTable.id, pageId),
      eq(supportPagesTable.organiserId, authReq.organiserId),
    ),
  });

  if (!page) {
    res.status(404).json({ error: "Page not found." });
    return;
  }

  const { slotType, customLabel, slotDate, slotTime, notes, trustedHelpersOnly, dietaryNotes, headcount } = req.body as {
    slotType?: string;
    customLabel?: string;
    slotDate?: string;
    slotTime?: string | null;
    notes?: string;
    trustedHelpersOnly?: boolean;
    dietaryNotes?: string | null;
    headcount?: number | string | null;
  };

  const validTypes = ["meal", "school_pickup", "child_care", "errand", "dog_walking", "shopping", "visit", "other"];
  if (!slotType || !validTypes.includes(slotType)) {
    res.status(400).json({ error: "A valid slot type is required." });
    return;
  }
  if (!slotDate || !/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
    res.status(400).json({ error: "A valid date (YYYY-MM-DD) is required." });
    return;
  }

  const sensitiveTypes = ["school_pickup", "child_care"];
  const isTrustedOnly = sensitiveTypes.includes(slotType) || trustedHelpersOnly === true;

  // Meal detail fields (bug #006) are meal-only — never persisted on any other
  // type, so a stray dietary/headcount on a dog walk can't sneak in.
  const isMeal = slotType === "meal";
  const dietaryValue = isMeal && typeof dietaryNotes === "string" ? dietaryNotes.trim().slice(0, 500) || null : null;
  const headcountValue = isMeal ? parseHeadcount(headcount) : null;

  const [slot] = await db
    .insert(slotsTable)
    .values({
      pageId,
      slotType: slotType as any,
      customLabel: customLabel?.trim() || null,
      slotDate,
      slotTime: slotTime || null,
      notes: typeof notes === "string" ? notes.trim() || null : null,
      trustedHelpersOnly: isTrustedOnly,
      dietaryNotes: dietaryValue,
      headcount: headcountValue,
      // Item 17: category default. Organiser slots are always dated, so a dated
      // errand reads as a lift → fixed; a meal stays flexible regardless. The
      // page runner can flip it later on /manage.
      flexibility: defaultFlexibility(slotType, slotDate != null),
    })
    .returning();

  res.status(201).json({
    id: slot.id,
    pageId: slot.pageId,
    slotType: slot.slotType,
    customLabel: slot.customLabel,
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    notes: slot.notes,
    dietaryNotes: slot.dietaryNotes,
    headcount: slot.headcount,
    trustedHelpersOnly: slot.trustedHelpersOnly,
    isClaimed: slot.isClaimed,
    createdAt: slot.createdAt.toISOString(),
  });
});

// DELETE /api/organiser/slots/:slotId — remove a slot
router.delete("/organiser/slots/:slotId", requireAuth as any, async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const { slotId } = req.params;

  const slot = await db.query.slotsTable.findFirst({
    where: eq(slotsTable.id, slotId),
    with: { page: true },
  });

  if (!slot || slot.page.organiserId !== authReq.organiserId) {
    res.status(404).json({ error: "Slot not found." });
    return;
  }

  await db.delete(slotsTable).where(eq(slotsTable.id, slotId));
  res.json({ ok: true });
});

// POST /api/organiser/pages/:pageId/publish
router.post("/organiser/pages/:pageId/publish", requireAuth as any, async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const { pageId } = req.params;

  const page = await db.query.supportPagesTable.findFirst({
    where: and(
      eq(supportPagesTable.id, pageId),
      eq(supportPagesTable.organiserId, authReq.organiserId),
    ),
  });

  if (!page) {
    res.status(404).json({ error: "Page not found." });
    return;
  }

  const [updated] = await db
    .update(supportPagesTable)
    .set({ status: "active" })
    .where(eq(supportPagesTable.id, pageId))
    .returning();

  res.json({ slug: updated.slug, status: updated.status });
});

// GET /api/organiser/pages — list organiser's pages
router.get("/organiser/pages", requireAuth as any, async (req, res) => {
  const authReq = req as unknown as AuthRequest;

  const pages = await db.query.supportPagesTable.findMany({
    where: eq(supportPagesTable.organiserId, authReq.organiserId),
    with: { slots: true },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  res.json(
    pages.map((p) => ({
      id: p.id,
      slug: p.slug,
      recipientName: p.recipientName,
      location: p.location,
      status: p.status,
      privacy: p.privacy,
      createdAt: p.createdAt.toISOString(),
      slotCount: p.slots.length,
      claimedCount: p.slots.filter((s) => s.isClaimed).length,
    })),
  );
});

// GET /api/organiser/pages/:pageId — get a specific page with slots
router.get("/organiser/pages/:pageId", requireAuth as any, async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const { pageId } = req.params;

  const page = await db.query.supportPagesTable.findFirst({
    where: and(
      eq(supportPagesTable.id, pageId),
      eq(supportPagesTable.organiserId, authReq.organiserId),
    ),
    with: { slots: { orderBy: (t, { asc }) => [asc(t.slotDate), asc(t.slotTime)] } },
  });

  if (!page) {
    res.status(404).json({ error: "Page not found." });
    return;
  }

  res.json({
    id: page.id,
    slug: page.slug,
    recipientName: page.recipientName,
    situationDescription: page.situationDescription,
    location: page.location,
    status: page.status,
    privacy: page.privacy,
    createdAt: page.createdAt.toISOString(),
    slots: page.slots.map((s) => ({
      id: s.id,
      slotType: s.slotType,
      customLabel: s.customLabel,
      slotDate: s.slotDate,
      slotTime: s.slotTime,
      notes: s.notes,
      dietaryNotes: s.dietaryNotes,
      headcount: s.headcount,
      trustedHelpersOnly: s.trustedHelpersOnly,
      isClaimed: s.isClaimed,
      claimedByName: s.claimedByName,
      claimedNote: s.claimedNote,
    })),
  });
});

// GET /api/organiser/pilot-applications — list all pilot applications (admin only)
router.get("/organiser/pilot-applications", requireAuth as any, async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  if (!isAdminEmail(authReq.organiserEmail)) {
    res.status(403).json({ error: "You don't have access to this." });
    return;
  }

  const applications = await db
    .select()
    .from(pilotApplicationsTable)
    .orderBy(desc(pilotApplicationsTable.createdAt));

  res.json(
    applications.map((a) => ({
      id: a.id,
      fullName: a.fullName,
      role: a.role,
      email: a.email,
      phone: a.phone,
      orgName: a.orgName,
      orgType: a.orgType,
      usageDescription: a.usageDescription,
      hearAboutUs: a.hearAboutUs,
      createdAt: a.createdAt.toISOString(),
    })),
  );
});

export default router;
