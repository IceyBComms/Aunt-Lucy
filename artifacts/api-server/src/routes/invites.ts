import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, slotsTable, helperInvitesTable, supportPagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth";
import { sendSms } from "../lib/sms";
import { sendHelperInviteEmail } from "../lib/email";
import { sendClaimConfirmationToHelper } from "../lib/claimNotify";
import { logger } from "../lib/logger";
import { LIFT_WAIT_MODE_HELPER_LINES } from "../lib/liftWaitMode";
import { getAppBaseUrl } from "../lib/appUrl";
import { firstName } from "../lib/giftFulfilment";
import { calendarSubscribeUrl } from "../lib/calendarFeed";
import { inviteShape } from "../lib/inviteShape";
import {
  resolvePronouns,
  applyPronounTokens,
  defaultTrustedLine,
  trustedInviteSms,
  trustedInviteEmailSubject,
  trustedInviteEmailText,
  TRUSTED_INVITE_EMAIL_CTA,
  type RecipientPronouns,
} from "../lib/inviteCopy";
import { taskLabel, whenLabel } from "../lib/item17Copy";

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

    // Two decisions, two variables — never one ternary (bug #031). A slot is
    // always chosen on this route (it is in the path and was loaded above), so
    // every invite minted here is a trusted, slot-scoped ask; the contact format
    // only decides how the message travels. See lib/inviteShape.ts for why
    // collapsing them left emailed helpers unable to claim the task they were
    // invited to.
    const contactIsEmail = isEmail(contactTrimmed);
    const { kind, channel, needsInviteToken } = inviteShape({
      slotChosen: true,
      contactIsEmail,
    });

    const base = getAppBaseUrl();
    // The grant that makes a trusted slot claimable. Minted for the invite's
    // KIND, not its channel — an emailed trusted invite needs it exactly as much
    // as a texted one.
    const inviteToken = needsInviteToken
      ? crypto.randomBytes(24).toString("hex")
      : null;
    // Where the invite points. A slot-scoped invite points at its own grant
    // page (which names the task); a general one at the public page.
    const link = inviteToken ? `${base}/invite/${inviteToken}` : `${base}/s/${page.slug}`;
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
        kind,
        channel,
        name: nameTrimmed,
        mobile: contactIsEmail ? null : contactTrimmed,
        email: contactIsEmail ? contactTrimmed : null,
        inviteToken,
        status: "queued",
        scheduledFor: new Date(),
      })
      .returning();

    let ok: boolean;
    if (channel === "email") {
      // A slot is always chosen on this route, so this is always a trusted ask.
      // PR #62 had to send the general 9c body here because the trusted copy was
      // SMS-only and there was nothing else to send; the link carried the
      // specificity and the wording didn't. There is an approved trusted email
      // now (bug #032), so the words match the ask as well as the link does.
      ok = await sendHelperInviteEmail({
        to: contactTrimmed,
        subject: trustedInviteEmailSubject(recipientFirstName),
        text: trustedInviteEmailText({
          helperFirstName,
          recipientFirstName,
          trustedLine: applyPronounTokens(
            page.trustedLine ?? defaultTrustedLine(page.occasion ?? null, page.babyStage),
            pronounsEnum,
          ),
          taskLabel: taskLabel(slot.slotType, slot.customLabel),
          when: whenLabel(slot.slotDate, slot.slotTime),
          // Bug #033 — null on anything that isn't an answered lift, and null
          // renders no line at all.
          liftNote: slot.liftWaitMode
            ? LIFT_WAIT_MODE_HELPER_LINES[slot.liftWaitMode]
            : null,
          link,
          // Unchanged from what this path has always sent (see the footer note
          // in the PR): the public page, not a real unsubscribe route. Passed
          // through, deliberately not rewired here.
          unsubscribeUrl: `${base}/s/${page.slug}`,
        }),
        link,
        ctaLabel: TRUSTED_INVITE_EMAIL_CTA,
        unsubscribeUrl: `${base}/s/${page.slug}`,
      });
    } else {
      ok = await sendSms({
        label: "trustedInviteSms",
        to: contactTrimmed,
        body: trustedInviteSms({
          helperFirstName,
          recipientFirstName,
          trustedLine: applyPronounTokens(
            page.trustedLine ?? defaultTrustedLine(page.occasion ?? null, page.babyStage),
            pronounsEnum,
          ),
          pronounPoss: pronouns.poss,
          link,
        }),
      });
    }

    await db
      .update(helperInvitesTable)
      .set(ok ? { status: "sent", sentAt: new Date() } : { status: "failed", failedAt: new Date() })
      .where(eq(helperInvitesTable.id, invite.id));

    logger.info(
      { slotId, name: nameTrimmed, kind, via: channel, ok },
      "Helper invite created (organiser)",
    );

    res.status(201).json({
      id: invite.id,
      name: invite.name,
      contact: contactTrimmed,
      via: channel,
      kind,
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
      liftWaitMode: slot.liftWaitMode,
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

  // Atomic conditional update: only claim if the slot is still unclaimed, exactly
  // like the public claim path. The isClaimed read above can go stale between two
  // near-simultaneous claims (two invites to the same slot, or an invite racing a
  // public claim); without this guard the second write would silently overwrite
  // the first helper's name/note. If we lose the race, RETURNING is empty and we
  // report the 409 rather than stamping the invite as claimed.
  // A fresh release handle, exactly as the public claim path mints one — a
  // trusted helper releases their slot the same way anyone else does (the
  // release endpoint only ever touches the slot, never this invite row).
  const cancelToken = crypto.randomBytes(24).toString("hex");
  // Sibling calendar-feed handle, minted on the same claim as the public path
  // (see slots.ts). Survives release so the feed can render STATUS:CANCELLED.
  const calendarToken = crypto.randomBytes(24).toString("hex");

  const claimed = await db
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
      cancelToken,
      calendarToken,
    })
    .where(and(eq(slotsTable.id, invite.slotId!), eq(slotsTable.isClaimed, false)))
    .returning();

  if (claimed.length === 0) {
    res.status(409).json({
      error: "Sorry — this slot has already been claimed by someone else.",
    });
    return;
  }

  await db
    .update(helperInvitesTable)
    .set({ claimedAt: now })
    .where(eq(helperInvitesTable.id, invite.id));

  logger.info({ inviteId: invite.id, name: invite.name }, "Trusted helper claimed slot");

  // Confirm the claim on the helper's own channel, exactly as the public path
  // does. This path previously sent NOTHING — it handed the release and calendar
  // links to the confirmation SCREEN only, which is React state and is gone on
  // reload. That left the worst-affected cohort with no durable record at all:
  // a trusted invite is SMS-delivered by design, so these helpers are almost
  // always phone-only (bug #013).
  //
  // The page is loaded for its recipient name and location, which the public
  // claim path already has in hand and this one does not.
  const claimPage = await db.query.supportPagesTable.findFirst({
    where: eq(supportPagesTable.id, invite.pageId),
  });
  if (claimPage) {
    void sendClaimConfirmationToHelper({
      slotId: claimed[0].id,
      // The invite's own name field — the trusted helper never types one.
      helperFirstName: invite.name,
      // Mirrors the claimed_by_contact fallback written above, so the channel is
      // worked out from the same value that was stored. When the invite carried
      // neither mobile nor email that value is the helper's NAME, and the
      // dispatcher answers "unknown" and warns rather than texting a name.
      helperContact: invite.mobile ?? invite.email ?? invite.name,
      recipientName: claimPage.recipientName,
      slotType: claimed[0].slotType,
      customLabel: claimed[0].customLabel,
      slotDate: claimed[0].slotDate,
      slotTime: claimed[0].slotTime,
      liftWaitMode: claimed[0].liftWaitMode,
      notes: claimed[0].notes,
      dietaryNotes: claimed[0].dietaryNotes,
      headcount: claimed[0].headcount,
      location: claimPage.location,
      cancelToken,
      calendarToken,
    });
  } else {
    logger.warn(
      { slotId: claimed[0].id },
      "Claim confirmation not sent — page missing for a trusted-invite claim",
    );
  }

  // Hand back the release token so the confirmed screen can offer a "Can't make
  // it?" link, matching the public path. It's the helper's own handle to the
  // claim they just made. calendarUrl is the webcal:// subscribe form, given
  // only for a dated task (an undated offer isn't an appointment); the confirmed
  // screen shows an "Add to your calendar" link when present.
  res.json({
    ok: true,
    claimedByName: invite.name,
    cancelToken,
    calendarUrl: claimed[0].slotDate ? calendarSubscribeUrl(calendarToken) : null,
  });
});

export default router;
