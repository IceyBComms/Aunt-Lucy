import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, slotsTable, helperInvitesTable, supportPagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth";
import { sendSms } from "../lib/sms";
import { sendHelperInviteEmail } from "../lib/email";
import { sendClaimConfirmationToHelper } from "../lib/claimNotify";
import { logger } from "../lib/logger";
import { LIFT_WAIT_MODE_HELPER_LINES, asLiftWaitMode } from "../lib/liftWaitMode";
import { getAppBaseUrl } from "../lib/appUrl";
import { firstName } from "../lib/giftFulfilment";
import { createInviteClaimRouter, type InviteClaimStore } from "../lib/inviteClaim";
import { inviteShape } from "../lib/inviteShape";
import { placeInvite } from "../lib/inviteDispatch";
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

    // ✅ Kate's ruling, 14 Sep 2026: invitations are HELD until the page is
    // published. Step 2 of setup calls this route for every trusted helper on a
    // saved task — on a page that is, by definition, still a draft — and it used
    // to send right here regardless, while the screen said "Nothing has been
    // sent yet." The row is always written; placeInvite sends inline only when
    // canSendInvite says the page is live, and otherwise leaves it queued for
    // /internal/dispatch-invites to send on its first run after publish.
    const now = new Date();
    const { row: invite, status } = await placeInvite(
      page,
      // A typed name and number, not a contact row, so there is no opt-out to read.
      { scheduledFor: now, contactOptedOut: false },
      {
        async insertQueued() {
          const [row] = await db
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
              scheduledFor: now,
            })
            .returning();
          return row;
        },

        async send() {
          if (channel === "email") {
            // A slot is always chosen on this route, so this is always a trusted
            // ask. PR #62 had to send the general 9c body here because the
            // trusted copy was SMS-only and there was nothing else to send; the
            // link carried the specificity and the wording didn't. There is an
            // approved trusted email now (bug #032), so the words match the ask
            // as well as the link does.
            return sendHelperInviteEmail({
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
                when: whenLabel(slot.slotDate, slot.slotTime, slot.flexibility),
                // Bug #033 — null on anything that isn't an answered lift, and
                // null renders no line at all.
                liftNote: slot.liftWaitMode
                  ? LIFT_WAIT_MODE_HELPER_LINES[slot.liftWaitMode]
                  : null,
                link,
                // Unchanged from what this path has always sent (see the footer
                // note in the PR): the public page, not a real unsubscribe
                // route. Passed through, deliberately not rewired here.
                unsubscribeUrl: `${base}/s/${page.slug}`,
              }),
              link,
              ctaLabel: TRUSTED_INVITE_EMAIL_CTA,
              unsubscribeUrl: `${base}/s/${page.slug}`,
            });
          }
          return sendSms({
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
        },

        async markSent(row) {
          await db
            .update(helperInvitesTable)
            .set({ status: "sent", sentAt: new Date() })
            .where(eq(helperInvitesTable.id, row.id));
        },

        async markFailed(row) {
          await db
            .update(helperInvitesTable)
            .set({ status: "failed", failedAt: new Date() })
            .where(eq(helperInvitesTable.id, row.id));
        },
      },
      now,
    );

    logger.info(
      { slotId, name: nameTrimmed, kind, via: channel, status, pageStatus: page.status },
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
// The routes themselves live in lib/inviteClaim.ts, against a store, so they can
// be tested over HTTP with no database. This is the real store.

const inviteClaimStore: InviteClaimStore = {
  async findByToken(token) {
    const invite = await db.query.helperInvitesTable.findFirst({
      where: eq(helperInvitesTable.inviteToken, token),
      with: { slot: { with: { page: true } } },
    });
    if (!invite) return null;
    const { slot, ...rest } = invite;
    if (!slot) return { ...rest, slot: null, page: null };
    const { page, ...slotRow } = slot;
    return { ...rest, slot: slotRow, page: page ?? null };
  },

  async claimSlot(slotId, fields) {
    const [row] = await db
      .update(slotsTable)
      .set({ isClaimed: true, ...fields })
      .where(and(eq(slotsTable.id, slotId), eq(slotsTable.isClaimed, false)))
      .returning();
    return row ?? null;
  },

  async markInviteClaimed(inviteId, now) {
    await db
      .update(helperInvitesTable)
      .set({ claimedAt: now })
      .where(eq(helperInvitesTable.id, inviteId));
  },
};

router.use(
  createInviteClaimRouter({
    store: inviteClaimStore,
    onClaimed({ invite, page, slot, cancelToken, calendarToken }) {
      // Confirm the claim on the helper's own channel, exactly as the public path
      // does (bug #013). The invite's own name field — the trusted helper never
      // types one. The contact mirrors the claimed_by_contact fallback the claim
      // wrote, so the channel is worked out from the same value that was stored.
      // When the invite carried neither mobile nor email that value is the
      // helper's NAME, and the dispatcher answers "unknown" and warns rather than
      // texting a name.
      void sendClaimConfirmationToHelper({
        slotId: slot.id,
        helperFirstName: invite.name,
        helperContact: invite.mobile ?? invite.email ?? invite.name,
        recipientName: page.recipientName,
        slotType: slot.slotType,
        customLabel: slot.customLabel,
        slotDate: slot.slotDate,
        slotTime: slot.slotTime,
        flexibility: slot.flexibility,
        // Narrowed rather than cast. This call used to end in a blanket
        // `as Parameters<...>[0]`, which existed only because InviteClaimSlot
        // types liftWaitMode as a plain string — and which would ALSO have let
        // row #145's new required `flexibility` go missing here in silence, on
        // the one claim path no compiler was watching. One field narrowed is
        // cheaper than a cast that hides every future field.
        liftWaitMode: asLiftWaitMode(slot.liftWaitMode),
        notes: slot.notes,
        dietaryNotes: slot.dietaryNotes,
        headcount: slot.headcount,
        location: page.location,
        cancelToken,
        calendarToken,
      });
    },
    log: logger,
  }),
);

export default router;
