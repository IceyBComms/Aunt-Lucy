import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, slotsTable, trustedHelperInvitesTable, supportPagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth";
import { sendInviteSms } from "../lib/sms";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getAppBaseUrl(): string {
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  if (replitDomain) return `https://${replitDomain}`;
  return process.env.APP_URL ?? "http://localhost:21112";
}

const SLOT_TYPE_LABELS: Record<string, string> = {
  meal: "Meal",
  school_pickup: "School Pickup",
  child_care: "Child Care",
  errand: "Errand",
  dog_walking: "Dog Walking",
  shopping: "Shopping",
  visit: "Visit",
  other: "Help",
};

// POST /api/organiser/pages/:pageId/slots/:slotId/invites
// Add a trusted helper and send SMS invite
router.post(
  "/organiser/pages/:pageId/slots/:slotId/invites",
  requireAuth as any,
  async (req, res) => {
    const authReq = req as AuthRequest;
    const { pageId, slotId } = req.params;

    // Verify organiser owns this page
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

    const slot = await db.query.slotsTable.findFirst({
      where: and(eq(slotsTable.id, slotId), eq(slotsTable.pageId, pageId)),
    });
    if (!slot) {
      res.status(404).json({ error: "Slot not found." });
      return;
    }

    const { name, mobile } = req.body as { name?: string; mobile?: string };
    const nameTrimmed = typeof name === "string" ? name.trim() : "";
    const mobileTrimmed = typeof mobile === "string" ? mobile.trim() : "";

    if (!nameTrimmed) {
      res.status(400).json({ error: "Helper name is required." });
      return;
    }
    if (!mobileTrimmed) {
      res.status(400).json({ error: "Mobile number is required." });
      return;
    }

    const inviteToken = crypto.randomBytes(24).toString("hex");
    const inviteUrl = `${getAppBaseUrl()}/invite/${inviteToken}`;

    const [invite] = await db
      .insert(trustedHelperInvitesTable)
      .values({
        slotId,
        name: nameTrimmed,
        mobile: mobileTrimmed,
        inviteToken,
      })
      .returning();

    // Send SMS
    await sendInviteSms({
      to: mobileTrimmed,
      recipientName: page.recipientName,
      slotTypeLabel:
        slot.customLabel ||
        SLOT_TYPE_LABELS[slot.slotType] ||
        slot.slotType,
      slotDate: slot.slotDate,
      slotTime: slot.slotTime,
      helperName: nameTrimmed,
      inviteUrl,
    });

    await db
      .update(trustedHelperInvitesTable)
      .set({ smsSentAt: new Date() })
      .where(eq(trustedHelperInvitesTable.id, invite.id));

    logger.info({ slotId, name: nameTrimmed }, "Trusted helper invite created");

    res.status(201).json({
      id: invite.id,
      name: invite.name,
      mobile: invite.mobile,
      smsSent: true,
    });
  },
);

// DELETE /api/organiser/invites/:inviteId
router.delete(
  "/organiser/invites/:inviteId",
  requireAuth as any,
  async (req, res) => {
    const authReq = req as AuthRequest;
    const { inviteId } = req.params;

    const invite = await db.query.trustedHelperInvitesTable.findFirst({
      where: eq(trustedHelperInvitesTable.id, inviteId),
      with: { slot: { with: { page: true } } },
    });

    if (!invite || invite.slot.page.organiserId !== authReq.organiserId) {
      res.status(404).json({ error: "Invite not found." });
      return;
    }

    await db
      .delete(trustedHelperInvitesTable)
      .where(eq(trustedHelperInvitesTable.id, inviteId));

    res.json({ ok: true });
  },
);

// ─── Public invite endpoints ──────────────────────────────────────────────────

// GET /api/invite/:token — get invite details
router.get("/invite/:token", async (req, res) => {
  const { token } = req.params;

  const invite = await db.query.trustedHelperInvitesTable.findFirst({
    where: eq(trustedHelperInvitesTable.inviteToken, token),
    with: {
      slot: {
        with: { page: true },
      },
    },
  });

  if (!invite) {
    res.status(404).json({ error: "This invitation link is invalid or has expired." });
    return;
  }

  const { slot } = invite;

  res.json({
    inviteId: invite.id,
    helperName: invite.name,
    alreadyClaimed: !!invite.claimedAt || slot.isClaimed,
    claimedByYou: !!invite.claimedAt,
    slot: {
      id: slot.id,
      slotType: slot.slotType,
      customLabel: slot.customLabel,
      slotDate: slot.slotDate,
      slotTime: slot.slotTime,
      notes: slot.notes,
    },
    page: {
      recipientName: slot.page.recipientName,
      location: slot.page.location,
      situationDescription: slot.page.situationDescription,
      slug: slot.page.slug,
    },
  });
});

// POST /api/invite/:token/claim — claim via invite
router.post("/invite/:token/claim", async (req, res) => {
  const { token } = req.params;

  const invite = await db.query.trustedHelperInvitesTable.findFirst({
    where: eq(trustedHelperInvitesTable.inviteToken, token),
    with: { slot: true },
  });

  if (!invite) {
    res.status(404).json({ error: "This invitation link is invalid." });
    return;
  }

  if (invite.claimedAt) {
    res.status(409).json({ error: "You've already confirmed this slot." });
    return;
  }

  if (invite.slot.isClaimed) {
    res.status(409).json({
      error: "Sorry — this slot has already been claimed by someone else.",
    });
    return;
  }

  const now = new Date();

  await db
    .update(slotsTable)
    .set({
      isClaimed: true,
      claimedByName: invite.name,
      claimedByContact: invite.mobile,
    })
    .where(eq(slotsTable.id, invite.slotId));

  await db
    .update(trustedHelperInvitesTable)
    .set({ claimedAt: now })
    .where(eq(trustedHelperInvitesTable.id, invite.id));

  logger.info({ inviteId: invite.id, name: invite.name }, "Trusted helper claimed slot");

  res.json({ ok: true, claimedByName: invite.name });
});

export default router;
