import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, supportPagesTable, slotsTable, pilotApplicationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth";

const router: IRouter = Router();

// Support page URLs are public and unauthenticated, so the slug must be an
// unguessable random token (privacy requirement) rather than a readable name.
// 12 characters from a 62-character alphabet is ~71 bits of entropy.
const SLUG_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SLUG_LENGTH = 12;

function generateSlug(): string {
  // Rejection-sample bytes to avoid modulo bias (256 is not a multiple of 62).
  const maxUnbiased = 256 - (256 % SLUG_ALPHABET.length); // 248
  const chars: string[] = [];
  while (chars.length < SLUG_LENGTH) {
    const buf = crypto.randomBytes(SLUG_LENGTH);
    for (let i = 0; i < buf.length && chars.length < SLUG_LENGTH; i++) {
      if (buf[i] < maxUnbiased) {
        chars.push(SLUG_ALPHABET[buf[i] % SLUG_ALPHABET.length]);
      }
    }
  }
  return chars.join("");
}

async function uniqueSlug(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const slug = generateSlug();
    const existing = await db.query.supportPagesTable.findFirst({
      where: eq(supportPagesTable.slug, slug),
    });
    if (!existing) return slug;
  }
  // With ~71 bits of entropy, 10 collisions is effectively impossible; fall
  // back to another fresh token rather than a weaker one.
  return generateSlug();
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

  if (privacy === "pin_protected") {
    const pinTrimmed = typeof pin === "string" ? pin.trim() : "";
    if (!pinTrimmed || !/^\d{4,8}$/.test(pinTrimmed)) {
      res.status(400).json({ error: "A 4–8 digit PIN is required for PIN-protected pages." });
      return;
    }
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
      pin: privacy === "pin_protected" ? (pin as string).trim() : null,
      status: "draft",
    })
    .returning();

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

  const { slotType, customLabel, slotDate, slotTime, notes, trustedHelpersOnly } = req.body as {
    slotType?: string;
    customLabel?: string;
    slotDate?: string;
    slotTime?: string | null;
    notes?: string;
    trustedHelpersOnly?: boolean;
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
      trustedHelpersOnly: s.trustedHelpersOnly,
      isClaimed: s.isClaimed,
      claimedByName: s.claimedByName,
      claimedNote: s.claimedNote,
    })),
  });
});

// GET /api/organiser/pilot-applications — list all pilot applications
router.get("/organiser/pilot-applications", requireAuth as any, async (_req, res) => {
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
