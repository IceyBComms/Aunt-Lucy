import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, slotsTable, helperInvitesTable, supportPagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth";
import { sendSms } from "../lib/sms";
import { sendHelperInviteEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { getAppBaseUrl } from "../lib/appUrl";
import { firstName } from "../lib/giftFulfilment";
import {
  resolvePronouns,
  applyPronounTokens,
  defaultSituationLine,
  defaultTrustedLine,
  trustedInviteSms,
  generalInviteEmailSubject,
  generalInviteEmailText,
  type RecipientPronouns,
} from "../lib/inviteCopy";

const router: IRouter = Router();

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ─── Organiser (authed) — invite a named person to one slot ──────────────────
// The account-based path for organiser-created / self-purchase pages. The
// account-free recipient path lives in routes/manage.ts. Both write to the same
// helper_invites table and use the same approved copy.
router.post(
  "/organiser/pages/:pageId/slots/:slotId/invites",
  requireAuth as any,
  async (req, res) => {
    const authReq = req as unknown as AuthRequest;
    const { pageId, slotId } = req.params;

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

    const { name, contact } = req.body as { name?: string; contact?: string };
    const nameTrimmed = typeof name === "string" ? name.trim() : "";
    const contactTrimmed = typeof contact === "string" ? contact.trim() : "";

    if (!nameTrimmed) {
      res.status(400).json({ error: "Helper name is required." });
      return;
    }
    if (!contactTrimmed) {
      res.status(400).json({ error: "Mobile number or email address is required." });
      return;
    }

    const contactIsEmail = isEmail(contactTrimmed);
    const base = getAppBaseUrl();
    const inviteToken = crypto.randomBytes(24).toString("hex");
    const helperFirstName = firstName(nameTrimmed);
    const recipientFirstName = firstName(page.recipientName);
    const pronounsEnum = page.recipientPronouns as RecipientPronouns;
    const pronouns = resolvePronouns(pronounsEnum);

    const [invite] = await db
      .insert(helperInvitesTable)
      .values({
        pageId,
        contactId: null,
        slotId,
        kind: contactIsEmail ? "general" : "trusted",
        channel: contactIsEmail ? "email" : "sms",
        name: nameTrimmed,
        mobile: contactIsEmail ? null : contactTrimmed,
        email: contactIsEmail ? contactTrimmed : null,
        inviteToken: contactIsEmail ? null : inviteToken,
        status: "queued",
        scheduledFor: new Date(),
      })
      .returning();

    let ok: boolean;
    if (contactIsEmail) {
      ok = await sendHelperInviteEmail({
        to: contactTrimmed,
        subject: generalInviteEmailSubject(recipientFirstName),
        text: generalInviteEmailText({
          helperFirstName,
          recipientFirstName,
          situationLine: applyPronounTokens(
            page.situationLine ?? defaultSituationLine(page.occasion ?? null),
            pronounsEnum,
          ),
          pronounObj: pronouns.obj,
          link: `${base}/s/${page.slug}`,
          unsubscribeUrl: `${base}/s/${page.slug}`,
        }),
        link: `${base}/s/${page.slug}`,
        unsubscribeUrl: `${base}/s/${page.slug}`,
      });
    } else {
      ok = await sendSms({
        to: contactTrimmed,
        body: trustedInviteSms({
          helperFirstName,
          recipientFirstName,
          trustedLine: applyPronounTokens(defaultTrustedLine(page.occasion ?? null), pronounsEnum),
          pronounPoss: pronouns.poss,
          link: `${base}/invite/${inviteToken}`,
        }),
      });
    }

    await db
      .update(helperInvitesTable)
      .set(ok ? { status: "sent", sentAt: new Date() } : { status: "failed", failedAt: new Date() })
      .where(eq(helperInvitesTable.id, invite.id));

    logger.info(
      { slotId, name: nameTrimmed, via: contactIsEmail ? "email" : "sms", ok },
      "Helper invite created (organiser)",
    );

    res.status(201).json({
      id: invite.id,
      name: invite.name,
      contact: contactTrimmed,
      via: contactIsEmail ? "email" : "sms",
    });
  },
);

// DELETE /api/organiser/invites/:inviteId
router.delete(
  "/organiser/invites/:inviteId",
  requireAuth as any,
  async (req, res) => {
    const authReq = req as unknown as AuthRequest;
    const { inviteId } = req.params;

    const invite = await db.query.helperInvitesTable.findFirst({
      where: eq(helperInvitesTable.id, inviteId),
      with: { page: true },
    });

    if (!invite || invite.page.organiserId !== authReq.organiserId) {
      res.status(404).json({ error: "Invite not found." });
      return;
    }

    await db.delete(helperInvitesTable).where(eq(helperInvitesTable.id, inviteId));
    res.json({ ok: true });
  },
);

// ─── Public invite endpoints (trusted-slot claim via token) ──────────────────

// GET /api/invite/:token — get invite details
router.get("/invite/:token", async (req, res) => {
  const { token } = req.params;

  const invite = await db.query.helperInvitesTable.findFirst({
    where: eq(helperInvitesTable.inviteToken, token),
    with: { slot: { with: { page: true } } },
  });

  if (!invite || !invite.slot) {
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
  const { showName } = req.body as { showName?: boolean };

  const invite = await db.query.helperInvitesTable.findFirst({
    where: eq(helperInvitesTable.inviteToken, token),
    with: { slot: true },
  });

  if (!invite || !invite.slot) {
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
      claimedByContact: invite.mobile ?? invite.email ?? invite.name,
      claimedAt: now,
      // Same opt-in default as the public claim path. A trusted, named helper
      // still chooses whether other helpers see their name; the recipient always
      // does.
      claimedNameVisible: showName === true,
    })
    .where(eq(slotsTable.id, invite.slotId!));

  await db
    .update(helperInvitesTable)
    .set({ claimedAt: now })
    .where(eq(helperInvitesTable.id, invite.id));

  logger.info({ inviteId: invite.id, name: invite.name }, "Trusted helper claimed slot");

  res.json({ ok: true, claimedByName: invite.name });
});

export default router;
