import { Router, type IRouter } from "express";
import crypto from "crypto";
import {
  db,
  supportPagesTable,
  slotsTable,
  contactsTable,
  helperInvitesTable,
  giftsTable,
  pageGrantsTable,
  pageFeedbackTable,
  organisersTable,
  type SupportPage,
  type Contact,
} from "@workspace/db";
import { and, eq, isNull, desc } from "drizzle-orm";
import {
  listActiveGrants,
  mintManagerGrant,
  grantRecipientAccess,
} from "../lib/accessGrants";
import {
  requireManagementToken,
  requireManagementTokenAllowingClosed,
  type ManagementRequest,
} from "../middleware/requireManagementToken";
import { canClosePage, canReopenPage, closureCancellations } from "../lib/pageClosure";
import {
  asClosureGrant,
  loadClosureContext,
  loadClosureSlots,
  performClosure,
  performReopen,
} from "../lib/pageClosureDb";
import { getAppBaseUrl } from "../lib/appUrl";
import { firstName } from "../lib/giftFulfilment";
import { logger } from "../lib/logger";
import { asLiftWaitMode, LIFT_WAIT_MODE_SMS_CLAUSES } from "../lib/liftWaitMode";
import { sendSms } from "../lib/sms";
import { sendHelperInviteEmail, sendPageFeedbackNotification } from "../lib/email";
import { placeInvite } from "../lib/inviteDispatch";
import {
  notifyHelperOfTaskEvent,
  shareLinkFor,
  releaseLinkFor,
} from "../lib/item17Notify";
import {
  taskLabel,
  taskName,
  whenLabel,
  helperTaskChanged,
  helperTaskCancelledStandard,
  helperTaskCancelledBereavement,
  helperEmailSubject,
} from "../lib/item17Copy";
import { type SlotFlexibility } from "../lib/slotFlexibility";
import {
  feedbackBlockState,
  feedbackRateLimitKey,
  lookupFeedbackSafely,
  readFeedbackSubmission,
  FEEDBACK_RATE_LIMIT,
  FEEDBACK_RATE_LIMITED,
} from "../lib/pageFeedback";
import { hitRateLimit } from "../lib/rateLimit";
import {
  resolvePronouns,
  applyPronounTokens,
  defaultSituationLine,
  defaultTrustedLine,
  generalInviteSms,
  trustedInviteSms,
  secondWaveSms,
  generalInviteEmailSubject,
  generalInviteEmailText,
  trustedInviteEmailSubject,
  trustedInviteEmailText,
  TRUSTED_INVITE_EMAIL_CTA,
  type RecipientPronouns,
  type BabyStage,
} from "../lib/inviteCopy";

const router: IRouter = Router();

const PRONOUN_VALUES: readonly RecipientPronouns[] = ["she_her", "he_him", "they_them"];
const BABY_STAGE_VALUES: readonly BabyStage[] = ["expecting", "arrived"];
type InviteKind = "general" | "trusted" | "second_wave";
const OPENER_MAX = 200;

function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ─── Read: the manage home state ─────────────────────────────────────────────

/**
 * GET /api/welcome/:token — the intro a crisis recipient lands on (bug #074).
 *
 * The link texted to the affected person used to drop them straight onto the
 * management screen — "Your people", an admin console — with no explanation of
 * what the page was, who made it, or why it existed. Kate, 23 Aug: "when the
 * link for the page is texted to the recipient, it goes straight to the Your
 * people page." This endpoint feeds the doorway that now sits in front of it.
 *
 * It returns only what the copy needs, and everything it returns is already
 * available to whoever holds this token — they have full management access to
 * the page. No slots, no contacts, no invites: this is a greeting, not a view.
 */
router.get("/welcome/:token", requireManagementToken as any, async (req, res) => {
  const { pageId, grantRole } = req as unknown as ManagementRequest;

  const page = await db.query.supportPagesTable.findFirst({
    where: eq(supportPagesTable.id, pageId),
    columns: { recipientName: true, occasion: true, organiserId: true, status: true },
  });
  if (!page) {
    res.status(404).json({ error: "Page not found." });
    return;
  }

  // Who set this up. Null for any organiser created before migration 0014 —
  // the copy has a nameless variant for exactly that case, because "Someone set
  // this page up for you" is eerie rather than reassuring on a bereavement page.
  const organiser = page.organiserId
    ? await db.query.organisersTable.findFirst({
        where: eq(organisersTable.id, page.organiserId),
        columns: { name: true },
      })
    : null;

  res.json({
    setUpByFirstName: organiser?.name ? firstName(organiser.name) : null,
    recipientFirstName: page.recipientName ? firstName(page.recipientName) : null,
    occasion: page.occasion ?? null,
    // A manager following their own link should not be told the page was set up
    // "for you" — they are the one running it.
    isRecipient: grantRole === "recipient",
  });
});

router.get("/manage/:token", requireManagementTokenAllowingClosed as any, async (req, res) => {
  const { pageId, grantId, grantRole, pageClosed } = req as unknown as ManagementRequest;

  // ── A CLOSED PAGE SERVES A REDUCED SCREEN, AND THE REDUCTION IS DONE HERE ──
  //
  // Kate's ruling, 20 September 2026: on a closed page /manage permits exactly
  // two things — seeing that it is closed (and when), and reopening it.
  // Everything else stays 410, which every mutating route below gets for free
  // from the ordinary middleware.
  //
  // Letting the READ through does not mean the management UI renders. It is cut
  // off at the SERVER, not merely hidden in the browser: no tasks, no contacts,
  // no invitations and no invite copy leave the machine for a closed page. A
  // closed page is one that has stopped, and a screen offering to edit its
  // school pickup would be the product arguing with itself.
  if (pageClosed) {
    const closedPage = await db.query.supportPagesTable.findFirst({
      where: eq(supportPagesTable.id, pageId),
      columns: {
        recipientName: true,
        occasion: true,
        slug: true,
        status: true,
        closedAt: true,
        recipientPronouns: true,
      },
    });
    if (!closedPage) {
      res.status(404).json({ error: "Page not found." });
      return;
    }
    res.json({
      role: grantRole,
      recipientName: closedPage.recipientName,
      status: closedPage.status,
      // Null-safe on purpose: a page closed by a build that predates migration
      // 0017 landing would have no date, and "closed, we don't know when" is a
      // truthful screen. The client simply omits the line.
      closedAt: closedPage.closedAt?.toISOString() ?? null,
      slug: closedPage.slug,
      occasion: closedPage.occasion ?? null,
      recipientPronouns: closedPage.recipientPronouns,
      // Everything a running page would carry, emptied. The client renders the
      // closed screen off `status`; these keep the response shape stable for
      // the generated types rather than describing anything real.
      managers: [],
      recipientHasOwnAccess: false,
      feedbackVisible: false,
      feedbackGiven: false,
      cardKeepsakeUrl: null,
      situationLine: null,
      situationLineDefault: "",
      trustedLine: null,
      trustedLineDefault: "",
      babyStage: null,
      recipientEmail: null,
      recipientMobile: null,
      bereavement: closedPage.occasion === "bereavement",
      shareLink: `${getAppBaseUrl()}/s/${closedPage.slug}`,
      tasks: [],
      contacts: [],
      invites: [],
    });
    return;
  }

  const page = await db.query.supportPagesTable.findFirst({
    where: eq(supportPagesTable.id, pageId),
    with: {
      slots: { orderBy: (t, { asc }) => [asc(t.slotDate)] },
      contacts: { orderBy: (t, { desc }) => [desc(t.createdAt)] },
      invites: { orderBy: (t, { desc }) => [desc(t.createdAt)] },
    },
  });
  if (!page) {
    res.status(404).json({ error: "Page not found." });
    return;
  }

  // If this page came from a sealed workplace team card, surface a re-entry to
  // the keepsake. The gift row (and its notes) persists for the gift's 12-month
  // life, so this link keeps working long after activation.
  const gift = await db.query.giftsTable.findFirst({
    where: eq(giftsTable.pageId, pageId),
  });
  const cardKeepsakeUrl =
    gift?.cardSealedAt && gift.redemptionToken
      ? `${getAppBaseUrl()}/gift/${gift.redemptionToken}`
      : null;

  // Who has access (section B), and whether the affected person themselves holds
  // a grant (drives the section-E "give them their own access" nudge). A grant's
  // removability (section C) is computed here so the client never has to know the
  // rules: a recipient's own grant is unrevocable by anyone; only the recipient
  // can remove a manager (a manager self-revoke path is deliberately not built
  // yet); and the last remaining grant can never be removed, so a page can't be
  // left unmanageable.
  const grants = await listActiveGrants(pageId);
  const recipientHasOwnAccess = grants.some((g) => g.role === "recipient");
  const managers = grants.map((g) => {
    let canRevoke = true;
    if (g.role === "recipient") canRevoke = false;
    else if (grantRole !== "recipient") canRevoke = false;
    else if (grants.length <= 1) canRevoke = false;
    return {
      grantId: g.id,
      role: g.role,
      // The recipient's own self-grant carries no name/contact (the page is
      // already theirs); a nominated manager carries both.
      personName: g.personName,
      personContact: g.personContact,
      isSelf: g.id === grantId,
      canRevoke,
      addedAt: g.createdAt.toISOString(),
    };
  });

  // Has THIS person already left feedback? Per-grant, not per-page, on purpose:
  // if her sister submitted, thanking the recipient for words she never wrote
  // would be a small lie, and she would lose the invitation to say her own
  // thing. One extra query, and it removes the "did that actually save?" doubt
  // entirely — which matters more than usual here, because #102 has already
  // proved this product can swallow something silently.
  //
  // ⚠️ GUARDED, AND THE GUARD IS THE POINT. /manage is where an organiser runs
  // everything; a feedback box must never be able to take it down. This exact
  // failure happened during the build — the whole route 500'd on a database
  // branch where page_feedback did not exist — and it is the server-side twin of
  // #077, where one unguarded call took a whole screen with it. On failure the
  // block simply is not offered (see feedbackBlockState) and every other section
  // renders as normal.
  const feedbackLookup = await lookupFeedbackSafely(
    async () => {
      const [row] = await db
        .select({ id: pageFeedbackTable.id })
        .from(pageFeedbackTable)
        .where(and(eq(pageFeedbackTable.pageId, pageId), eq(pageFeedbackTable.grantId, grantId)))
        .limit(1);
      return !!row;
    },
    (err) =>
      logger.error(
        { err, pageId },
        "Feedback lookup failed — serving /manage without the feedback block",
      ),
  );
  const feedbackState = feedbackBlockState(page.slots, feedbackLookup);

  res.json({
    role: grantRole,
    recipientName: page.recipientName,
    managers,
    recipientHasOwnAccess,
    // Whether to offer the feedback form at all, and whether this person has
    // already answered. See lib/pageFeedback.ts — the rule is "once at least
    // one task has been claimed", because someone whose page has had no claims
    // has nothing to report yet and being asked reads as a product fishing.
    // Both read false if the lookup above failed: the block is dropped, the
    // rest of the page is untouched.
    ...feedbackState,
    // Present only for a sealed team card — the "See your card 💛" entry point.
    cardKeepsakeUrl,
    slug: page.slug,
    status: page.status,
    // Always null here: this branch only runs for a page that is NOT closed.
    // Present so the response shape is the same either way (bug #090).
    closedAt: null,
    occasion: page.occasion ?? null,
    recipientPronouns: page.recipientPronouns,
    // The RAW stored overrides (null = "using the default"), so the /manage form
    // can render the field as empty-with-ghost-text rather than pre-filled. The
    // *Default fields carry the occasion (and baby-stage) default wording the UI
    // shows as that placeholder. Tokens ({poss}/{obj}) are left in — the client
    // resolves them against recipientPronouns, same as the activation screen.
    situationLine: page.situationLine,
    situationLineDefault: defaultSituationLine(page.occasion ?? null, page.babyStage),
    trustedLine: page.trustedLine,
    trustedLineDefault: defaultTrustedLine(page.occasion ?? null, page.babyStage),
    babyStage: page.babyStage,
    // Where the recipient is notified when help arrives — shown so they can add
    // or change it if they skipped it at activation.
    recipientEmail: page.recipientEmail ?? null,
    recipientMobile: page.recipientMobile ?? null,
    // Bereavement defaults the invite flow to self-share, waves off unless the
    // recipient explicitly confirms — surfaced so the UI can lead with that.
    bereavement: page.occasion === "bereavement",
    shareLink: `${getAppBaseUrl()}/s/${page.slug}`,
    tasks: page.slots.map((s) => ({
      id: s.id,
      slotType: s.slotType,
      // #127 — NEVER `?? s.slotType`. That fallback put the raw enum key
      // ("dog_walking", "errand") on the family's own screen in six places,
      // while the claim email for the same task said "Dog walking". taskName()
      // is the shared lookup the sent messages already use, so a rename lands
      // in one file (see item17Copy.ts).
      label: taskName(s.slotType, s.customLabel),
      // Raw fields the family edit form needs (label above is the display value).
      customLabel: s.customLabel,
      notes: s.notes ?? null,
      // Item 17: is the time this task's helper's to nudge, or the family's fact?
      flexibility: s.flexibility,
      trustedHelpersOnly: s.trustedHelpersOnly,
      isClaimed: s.isClaimed,
      // The recipient always sees who claimed, regardless of the helper's public
      // visibility choice — this is the "look who showed up" payoff, and the note
      // is the helper's message to them. Safe: shown only to the recipient.
      claimedByName: s.claimedByName,
      claimedNote: s.claimedNote ?? null,
      claimedAt: s.claimedAt?.toISOString() ?? null,
      slotDate: s.slotDate,
      slotTime: s.slotTime,
      liftWaitMode: s.liftWaitMode,
      dietaryNotes: s.dietaryNotes,
      headcount: s.headcount,
    })),
    contacts: page.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      email: c.email,
      trusted: c.trusted,
      optedOut: !!c.optedOutAt,
    })),
    invites: page.invites.map((i) => ({
      id: i.id,
      contactId: i.contactId,
      name: i.name,
      kind: i.kind,
      channel: i.channel,
      status: i.status,
      scheduledFor: i.scheduledFor.toISOString(),
      sentAt: i.sentAt?.toISOString() ?? null,
      claimedAt: i.claimedAt?.toISOString() ?? null,
    })),
  });
});

// ─── Update pronoun / situation line ─────────────────────────────────────────

router.patch("/manage/:token/details", requireManagementToken as any, async (req, res) => {
  const { pageId } = req as unknown as ManagementRequest;
  const body = req.body as Record<string, unknown>;

  const patch: Partial<typeof supportPagesTable.$inferInsert> = {};
  if (body.recipientPronouns !== undefined) {
    const p = trimmed(body.recipientPronouns);
    if (!(PRONOUN_VALUES as readonly string[]).includes(p)) {
      res.status(400).json({ error: "That doesn't look like a valid pronoun choice." });
      return;
    }
    patch.recipientPronouns = p as RecipientPronouns;
  }
  if (body.situationLine !== undefined) {
    patch.situationLine = trimmed(body.situationLine).slice(0, 120) || null;
  }
  // The trusted "support circle" line override — same shape as situationLine:
  // empty clears it back to the occasion/baby-stage default at send time.
  if (body.trustedLine !== undefined) {
    patch.trustedLine = trimmed(body.trustedLine).slice(0, 120) || null;
  }
  // new_baby only, but harmless elsewhere. A recognised value sets the stage; an
  // empty/unrecognised value clears it back to null (stage-agnostic default).
  // Flipping this after a page is live updates the default for invites sent from
  // then on (set while pregnant → change once the baby's here).
  if (body.babyStage !== undefined) {
    const b = trimmed(body.babyStage);
    patch.babyStage = (BABY_STAGE_VALUES as readonly string[]).includes(b)
      ? (b as BabyStage)
      : null;
  }
  // Where claim notifications are sent — settable here for a recipient who
  // skipped it at activation. An empty value clears it; a non-empty value must
  // look like an email address.
  if (body.recipientEmail !== undefined) {
    const e = trimmed(body.recipientEmail);
    if (e && !isEmail(e)) {
      res.status(400).json({ error: "That email address doesn't look right." });
      return;
    }
    patch.recipientEmail = e || null;
  }
  if (body.recipientMobile !== undefined) {
    patch.recipientMobile = trimmed(body.recipientMobile).slice(0, 40) || null;
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }

  const [updated] = await db
    .update(supportPagesTable)
    .set(patch)
    .where(eq(supportPagesTable.id, pageId))
    .returning();

  res.json({
    recipientPronouns: updated.recipientPronouns,
    situationLine: updated.situationLine,
    trustedLine: updated.trustedLine,
    babyStage: updated.babyStage,
    recipientEmail: updated.recipientEmail ?? null,
    recipientMobile: updated.recipientMobile ?? null,
  });
});

// ─── Contacts CRUD ───────────────────────────────────────────────────────────

router.post("/manage/:token/contacts", requireManagementToken as any, async (req, res) => {
  const { pageId } = req as unknown as ManagementRequest;
  const body = req.body as Record<string, unknown>;

  const name = trimmed(body.name);
  const mobile = trimmed(body.mobile) || null;
  const email = trimmed(body.email) || null;
  const trusted = body.trusted === true;

  if (!name) {
    res.status(400).json({ error: "A name is required." });
    return;
  }
  if (!mobile && !email) {
    res.status(400).json({ error: "Add a mobile number or an email address." });
    return;
  }
  if (email && !isEmail(email)) {
    res.status(400).json({ error: "That email address doesn't look right." });
    return;
  }

  const [contact] = await db
    .insert(contactsTable)
    .values({ pageId, name, mobile, email, trusted })
    .returning();

  res.status(201).json({
    id: contact.id,
    name: contact.name,
    mobile: contact.mobile,
    email: contact.email,
    trusted: contact.trusted,
    optedOut: false,
  });
});

router.patch("/manage/:token/contacts/:contactId", requireManagementToken as any, async (req, res) => {
  const { pageId } = req as unknown as ManagementRequest;
  const { contactId } = req.params;
  const body = req.body as Record<string, unknown>;

  const contact = await db.query.contactsTable.findFirst({
    where: and(eq(contactsTable.id, contactId), eq(contactsTable.pageId, pageId)),
  });
  if (!contact) {
    res.status(404).json({ error: "Contact not found." });
    return;
  }

  const patch: Partial<typeof contactsTable.$inferInsert> = {};
  if (body.name !== undefined) {
    const n = trimmed(body.name);
    if (!n) {
      res.status(400).json({ error: "A name is required." });
      return;
    }
    patch.name = n;
  }
  if (body.mobile !== undefined) patch.mobile = trimmed(body.mobile) || null;
  if (body.email !== undefined) {
    const e = trimmed(body.email) || null;
    if (e && !isEmail(e)) {
      res.status(400).json({ error: "That email address doesn't look right." });
      return;
    }
    patch.email = e;
  }
  if (body.trusted !== undefined) patch.trusted = body.trusted === true;

  const [updated] = await db
    .update(contactsTable)
    .set(patch)
    .where(eq(contactsTable.id, contactId))
    .returning();

  res.json({
    id: updated.id,
    name: updated.name,
    mobile: updated.mobile,
    email: updated.email,
    trusted: updated.trusted,
    optedOut: !!updated.optedOutAt,
  });
});

router.delete("/manage/:token/contacts/:contactId", requireManagementToken as any, async (req, res) => {
  const { pageId } = req as unknown as ManagementRequest;
  const { contactId } = req.params;

  const contact = await db.query.contactsTable.findFirst({
    where: and(eq(contactsTable.id, contactId), eq(contactsTable.pageId, pageId)),
  });
  if (!contact) {
    res.status(404).json({ error: "Contact not found." });
    return;
  }
  await db.delete(contactsTable).where(eq(contactsTable.id, contactId));
  res.json({ ok: true });
});

// ─── Access grants — share / list / revoke the running of a page ─────────────
//
// The list itself is returned by GET /manage (the `managers` array). These
// endpoints add and remove people. A grant's token is its holder's own
// /manage credential, delivered on the contact they were added with.

/**
 * POST /manage/:token/managers — share the running of this page with a named
 * person (section A). Mints a manager grant and sends them their own link.
 */
router.post("/manage/:token/managers", requireManagementToken as any, async (req, res) => {
  const { pageId, grantId } = req as unknown as ManagementRequest;
  const body = req.body as Record<string, unknown>;

  const name = trimmed(body.name);
  const contact = trimmed(body.contact);
  if (!name) {
    res.status(400).json({ error: "A name is required." });
    return;
  }
  if (!contact) {
    res.status(400).json({ error: "Add their mobile number or email address." });
    return;
  }
  // A value with an @ must be a valid email; a value without is treated as a
  // mobile (the same light rule the contacts form uses).
  if (contact.includes("@") && !isEmail(contact)) {
    res.status(400).json({ error: "That email address doesn't look right." });
    return;
  }

  const page = await db.query.supportPagesTable.findFirst({
    where: eq(supportPagesTable.id, pageId),
  });
  if (!page) {
    res.status(404).json({ error: "Page not found." });
    return;
  }

  const { grant, delivered } = await mintManagerGrant({
    pageId,
    byGrantId: grantId,
    recipientName: page.recipientName,
    name,
    contact,
  });

  logger.info({ pageId, grantId: grant.id, delivered }, "Manager grant added");
  res.status(201).json({
    grantId: grant.id,
    role: grant.role,
    personName: grant.personName,
    personContact: grant.personContact,
    isSelf: false,
    canRevoke: true,
    addedAt: grant.createdAt.toISOString(),
    delivered,
  });
});

/**
 * DELETE /manage/:token/managers/:grantId — take back someone's access
 * (section C). Enforces every rule server-side, never trusting the client:
 * a recipient's own grant is unrevocable by anyone; only the recipient may
 * remove a manager; and the last active grant can never be removed.
 */
router.delete(
  "/manage/:token/managers/:grantId",
  requireManagementToken as any,
  async (req, res) => {
    const { pageId, grantRole } = req as unknown as ManagementRequest;
    const targetId = req.params.grantId;

    const target = await db.query.pageGrantsTable.findFirst({
      where: and(
        eq(pageGrantsTable.id, targetId),
        eq(pageGrantsTable.pageId, pageId),
        isNull(pageGrantsTable.revokedAt),
      ),
    });
    if (!target) {
      res.status(404).json({ error: "That person doesn't have access, or already had it removed." });
      return;
    }

    if (target.role === "recipient") {
      res.status(403).json({
        error: "This is the page owner's own access — it can't be removed by anyone else.",
      });
      return;
    }
    if (grantRole !== "recipient") {
      res.status(403).json({
        error: "Only the person this page is for can remove someone from running it.",
      });
      return;
    }

    const active = await listActiveGrants(pageId);
    if (active.length <= 1) {
      res.status(409).json({
        error:
          "This is the only person who can manage this page — add someone else first.",
      });
      return;
    }

    await db
      .update(pageGrantsTable)
      .set({ revokedAt: new Date() })
      .where(eq(pageGrantsTable.id, targetId));

    logger.info({ pageId, grantId: targetId }, "Manager grant revoked");
    res.json({ ok: true });
  },
);

/**
 * POST /manage/:token/recipient-access — give the affected person their own
 * always-on access (section E loop-in from the nudge). Mints their recipient
 * grant and sends them their link. No-op-guarded: refuses if they already hold
 * one. Logs the loop-in so we can measure how often deferred setups get
 * completed (see the deferral log in crisis.ts / organiser.ts).
 */
router.post(
  "/manage/:token/recipient-access",
  requireManagementToken as any,
  async (req, res) => {
    const { pageId, grantId } = req as unknown as ManagementRequest;
    const contact = trimmed((req.body as Record<string, unknown>).contact);

    if (!contact) {
      res.status(400).json({ error: "Add their mobile number or email address." });
      return;
    }
    if (contact.includes("@") && !isEmail(contact)) {
      res.status(400).json({ error: "That email address doesn't look right." });
      return;
    }

    const page = await db.query.supportPagesTable.findFirst({
      where: eq(supportPagesTable.id, pageId),
    });
    if (!page) {
      res.status(404).json({ error: "Page not found." });
      return;
    }

    const existing = await listActiveGrants(pageId);
    if (existing.some((g) => g.role === "recipient")) {
      res.status(409).json({ error: `${firstName(page.recipientName)} already has their own access.` });
      return;
    }

    const { grant, delivered } = await grantRecipientAccess({
      pageId,
      recipientName: page.recipientName,
      contact,
      byGrantId: grantId,
      // A bereavement or serious-illness page takes the gentler wording.
      occasion: page.occasion,
    });

    // Instrumentation (Option 1 sizing): a deferred setup was later completed.
    // Grep `event=recipient_access_looped_in` against the deferral count.
    logger.info(
      { event: "recipient_access_looped_in", pageId, source: "manage_nudge", delivered },
      "Recipient looped in to their own page via the /manage nudge",
    );
    res.status(201).json({
      grantId: grant.id,
      role: grant.role,
      personName: grant.personName,
      personContact: grant.personContact,
      isSelf: false,
      canRevoke: false,
      addedAt: grant.createdAt.toISOString(),
      delivered,
    });
  },
);

// ─── Invite composition (shared by preview / send / schedule) ────────────────

interface InviteRequest {
  contactId: string;
  slotId?: string | null;
  kind?: InviteKind;
  openingLine?: string | null;
}

interface PreparedInvite {
  contact: Contact;
  slotId: string | null;
  kind: InviteKind;
  channel: "sms" | "email";
  name: string;
  mobile: string | null;
  email: string | null;
  openingLine: string | null;
  inviteToken: string | null;
  link: string;
  body: string;
  subject: string | null;
  /** The CTA words in `body`, so the HTML button reads the same. Email only. */
  ctaLabel: string | null;
  unsubscribeUrl: string | null;
}

/**
 * Turns one invite request into a fully-rendered message, or an error string.
 * Pure apart from reading the slot; no rows are written here, so it serves the
 * preview step and the send/schedule steps identically.
 */
async function prepareInvite(
  page: SupportPage,
  contacts: Map<string, Contact>,
  req: InviteRequest,
): Promise<PreparedInvite | { error: string }> {
  const contact = contacts.get(req.contactId);
  if (!contact) return { error: "Unknown contact." };
  if (contact.optedOutAt) return { error: `${contact.name} has opted out.` };

  const channel: "sms" | "email" = contact.mobile ? "sms" : "email";
  if (channel === "email" && !contact.email) {
    return { error: `${contact.name} has no mobile or email.` };
  }

  const base = getAppBaseUrl();
  const pronouns = page.recipientPronouns as RecipientPronouns;
  const helperFirstName = firstName(contact.name);
  const recipientFirstName = firstName(page.recipientName);
  // Resolve {poss}/{obj} pronoun tokens in the occasion lines.
  const situationLine = applyPronounTokens(
    page.situationLine ?? defaultSituationLine(page.occasion ?? null, page.babyStage),
    pronouns,
  );
  const openingLine = trimmed(req.openingLine).slice(0, OPENER_MAX) || null;

  // Resolve the kind. A slot makes it a trusted ask; otherwise general, unless
  // the caller explicitly asked for a second-wave nudge.
  const kind: InviteKind = req.kind ?? (req.slotId ? "trusted" : "general");
  let slotId: string | null = null;
  let inviteToken: string | null = null;
  let link = `${base}/s/${page.slug}`;
  let slot: typeof slotsTable.$inferSelect | undefined;

  if (kind === "trusted") {
    // The trusted invite grants the specific slot. The SMS wording doesn't name
    // the task (its label shows on the invite page instead); the email does —
    // see the note on trustedInviteEmailText for why the channel changes that.
    if (!req.slotId) return { error: "A trusted invite needs a task." };
    slot = await db.query.slotsTable.findFirst({
      where: and(eq(slotsTable.id, req.slotId), eq(slotsTable.pageId, page.id)),
    });
    if (!slot) return { error: "That task isn't on this page." };
    slotId = slot.id;
    inviteToken = crypto.randomBytes(24).toString("hex");
    link = `${base}/invite/${inviteToken}`;
  }

  const unsubscribeUrl = `${base}/unsubscribe/${contact.id}`;
  const { obj, poss } = resolvePronouns(pronouns);

  let body: string;
  let subject: string | null = null;
  let ctaLabel: string | null = null;

  // Two decisions, kept apart (bug #031, restated in lib/inviteShape.ts): the
  // KIND came from whether a task was chosen, above; the CHANNEL comes from the
  // contact format, and decides nothing else. This branch used to break that —
  // an email address rewrote a trusted invite into a general one, dropped the
  // slot and the grant with it, and told nobody (bug #032). It did that only
  // because the trusted ask had no email body to send. It has one now.
  if (kind === "trusted" && slot) {
    const trustedLine = applyPronounTokens(
      page.trustedLine ?? defaultTrustedLine(page.occasion ?? null, page.babyStage),
      pronouns,
    );
    if (channel === "email") {
      subject = trustedInviteEmailSubject(recipientFirstName);
      ctaLabel = TRUSTED_INVITE_EMAIL_CTA;
      body = trustedInviteEmailText({
        helperFirstName,
        recipientFirstName,
        trustedLine,
        taskLabel: taskLabel(slot.slotType, slot.customLabel),
        when: whenLabel(slot.slotDate, slot.slotTime),
        link,
        unsubscribeUrl,
        openingLine,
      });
    } else {
      body = trustedInviteSms({
        helperFirstName,
        recipientFirstName,
        trustedLine,
        pronounPoss: poss,
        link,
        openingLine,
      });
    }
  } else if (channel === "email") {
    // General and second-wave invites are about the page, not one task, so they
    // carry the 9c body and point at the public page. Unchanged.
    subject = generalInviteEmailSubject(recipientFirstName);
    body = generalInviteEmailText({
      helperFirstName,
      recipientFirstName,
      situationLine,
      pronounObj: obj,
      link: `${base}/s/${page.slug}`,
      unsubscribeUrl,
      openingLine,
    });
    link = `${base}/s/${page.slug}`;
  } else if (kind === "second_wave") {
    body = secondWaveSms({ helperFirstName, recipientFirstName, link, openingLine });
  } else {
    body = generalInviteSms({ helperFirstName, recipientFirstName, situationLine, link, openingLine });
  }

  return {
    contact,
    slotId,
    kind,
    channel,
    name: contact.name,
    mobile: contact.mobile,
    email: contact.email,
    openingLine,
    inviteToken,
    link,
    body,
    subject,
    ctaLabel,
    unsubscribeUrl: channel === "email" ? unsubscribeUrl : null,
  };
}

async function loadContacts(pageId: string): Promise<Map<string, Contact>> {
  const rows = await db.query.contactsTable.findMany({
    where: eq(contactsTable.pageId, pageId),
  });
  return new Map(rows.map((c) => [c.id, c]));
}

// ─── Preview ─────────────────────────────────────────────────────────────────

router.post("/manage/:token/invites/preview", requireManagementToken as any, async (req, res) => {
  const { pageId } = req as unknown as ManagementRequest;
  const page = await db.query.supportPagesTable.findFirst({ where: eq(supportPagesTable.id, pageId) });
  if (!page) {
    res.status(404).json({ error: "Page not found." });
    return;
  }
  const requests = Array.isArray((req.body as any)?.invites) ? (req.body as any).invites : [];
  const contacts = await loadContacts(pageId);

  const previews = [];
  for (const r of requests as InviteRequest[]) {
    const prepared = await prepareInvite(page, contacts, r);
    if ("error" in prepared) {
      previews.push({ contactId: r.contactId, error: prepared.error });
    } else {
      previews.push({
        contactId: prepared.contact.id,
        name: prepared.name,
        kind: prepared.kind,
        channel: prepared.channel,
        subject: prepared.subject,
        body: prepared.body,
      });
    }
  }
  res.json({ previews });
});

// ─── Send now / schedule a wave ──────────────────────────────────────────────

async function dispatchOrQueue(
  req: ManagementRequest,
  res: import("express").Response,
  mode: "now" | "schedule",
) {
  const { pageId } = req;
  const body = (req as any).body as Record<string, unknown>;

  const page = await db.query.supportPagesTable.findFirst({ where: eq(supportPagesTable.id, pageId) });
  if (!page) {
    res.status(404).json({ error: "Page not found." });
    return;
  }

  // Bereavement gate: a wide automated send may be the wrong call, so it is off
  // by default and requires an explicit confirmation. Self-share is the lead.
  if (page.occasion === "bereavement" && body.confirmed !== true) {
    res.status(409).json({
      error: "bereavement_confirmation_required",
      message:
        "For a bereavement, sharing the link yourself is often kinder. Confirm to send invites anyway.",
    });
    return;
  }

  let scheduledFor = new Date();
  if (mode === "schedule") {
    const raw = trimmed(body.scheduledFor);
    const parsed = raw ? new Date(raw) : new Date(NaN);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ error: "That send time doesn't look right." });
      return;
    }
    scheduledFor = parsed;
  }

  const requests = Array.isArray(body.invites) ? (body.invites as InviteRequest[]) : [];
  if (requests.length === 0) {
    res.status(400).json({ error: "No one to invite." });
    return;
  }

  const contacts = await loadContacts(pageId);
  const results: Array<{ contactId: string; status: string; error?: string }> = [];

  for (const r of requests) {
    const prepared = await prepareInvite(page, contacts, r);
    if ("error" in prepared) {
      results.push({ contactId: r.contactId, status: "skipped", error: prepared.error });
      continue;
    }

    const insertQueued = async () => {
      const [row] = await db
        .insert(helperInvitesTable)
        .values({
          pageId,
          contactId: prepared.contact.id,
          slotId: prepared.slotId,
          kind: prepared.kind,
          channel: prepared.channel,
          name: prepared.name,
          mobile: prepared.mobile,
          email: prepared.email,
          personalOpeningLine: prepared.openingLine,
          inviteToken: prepared.inviteToken,
          status: "queued",
          scheduledFor,
        })
        .returning();
      return row;
    };

    if (mode === "schedule") {
      await insertQueued();
      results.push({ contactId: prepared.contact.id, status: "queued" });
      continue;
    }

    // Send now — inline ONLY if the page is live (Kate's ruling, 14 Sep 2026:
    // nothing leaves a draft). /manage opens on any page that isn't closed, so
    // this is reachable on a draft: a crisis page before it is published, or a
    // gift page scheduled to activate later. There the row is left queued and
    // goes on the dispatcher's first run after the page is live. An opted-out
    // contact was already refused by prepareInvite, so it is false here.
    const { status } = await placeInvite(
      page,
      { scheduledFor, contactOptedOut: false },
      {
        insertQueued,
        send: () =>
          prepared.channel === "sms"
            ? sendSms({
                to: prepared.mobile!,
                body: prepared.body,
                label: `inviteSms:${prepared.kind}`,
              })
            : sendHelperInviteEmail({
                to: prepared.email!,
                subject: prepared.subject!,
                text: prepared.body,
                link: prepared.link,
                ctaLabel: prepared.ctaLabel ?? undefined,
                unsubscribeUrl: prepared.unsubscribeUrl!,
                openingLine: prepared.openingLine,
              }),
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
    );

    results.push({ contactId: prepared.contact.id, status });
  }

  logger.info({ pageId, mode, count: results.length }, "Helper invites processed");
  res.status(201).json({ mode, results });
}

router.post("/manage/:token/invites/send", requireManagementToken as any, async (req, res) => {
  await dispatchOrQueue(req as unknown as ManagementRequest, res, "now");
});

router.post("/manage/:token/invites/schedule", requireManagementToken as any, async (req, res) => {
  await dispatchOrQueue(req as unknown as ManagementRequest, res, "schedule");
});

// ─── Task edit / cancel (Item 17 — "When plans change") ──────────────────────
//
// The family side: the recipient, or the admin running the page, editing or
// cancelling a task. Editing a CLAIMED task keeps the claim standing and always
// tells the helper (no silent rewrites of what someone agreed to), carrying a
// one-tap "can't any more" out. Cancelling: unclaimed is a quiet removal;
// claimed always thanks the helper and lets them know it's covered.
//
// Sensitivity (trusted_helpers_only) is deliberately NOT editable here — that
// belongs to the trusted-contact model CLAUDE.md flags as a "stop and ask"
// area, not to Item 17's time/date/details edit.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const FLEXIBILITY_VALUES: readonly SlotFlexibility[] = ["flexible", "fixed"];

function parseHeadcountValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  const rounded = Math.floor(n);
  if (rounded < 1) return null;
  return Math.min(rounded, 100);
}

/**
 * PATCH /manage/:token/tasks/:slotId — edit a task's time / date / details, and
 * optionally flip its flexible/fixed flag. The claim (if any) stands; the helper
 * is told.
 */
router.patch(
  "/manage/:token/tasks/:slotId",
  requireManagementToken as any,
  async (req, res) => {
    const { pageId } = req as unknown as ManagementRequest;
    const { slotId } = req.params;
    const body = req.body as Record<string, unknown>;

    const [row] = await db
      .select({ slot: slotsTable, page: supportPagesTable })
      .from(slotsTable)
      .innerJoin(supportPagesTable, eq(slotsTable.pageId, supportPagesTable.id))
      .where(and(eq(slotsTable.id, slotId), eq(slotsTable.pageId, pageId)))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "That task isn't on this page." });
      return;
    }
    const { slot, page } = row;
    const isMeal = slot.slotType === "meal";

    const patch: Partial<typeof slotsTable.$inferInsert> = {};

    if (body.slotDate !== undefined) {
      const d = trimmed(body.slotDate);
      if (d && !DATE_RE.test(d)) {
        res.status(400).json({ error: "That date doesn't look right — please try again." });
        return;
      }
      patch.slotDate = d || null;
    }
    if (body.slotTime !== undefined) {
      const t = trimmed(body.slotTime);
      if (t && !TIME_RE.test(t)) {
        res.status(400).json({ error: "That time doesn't look right — please try again." });
        return;
      }
      patch.slotTime = t || null;
    }
    // Bug #033 — the wait-or-not answer is editable here, because it is the
    // fact most likely to change after the appointment is booked. Explicit null
    // clears it, which correctly returns the task to rendering nothing at all.
    if (body.liftWaitMode !== undefined) {
      patch.liftWaitMode = asLiftWaitMode(body.liftWaitMode);
    }
    if (body.customLabel !== undefined) {
      patch.customLabel = trimmed(body.customLabel).slice(0, 120) || null;
    }
    if (body.notes !== undefined) {
      patch.notes = trimmed(body.notes).slice(0, 500) || null;
    }
    // Meal detail is meal-only, matching the create paths — a stray dietary note
    // or headcount on a non-meal task is dropped rather than stored.
    if (body.dietaryNotes !== undefined) {
      patch.dietaryNotes = isMeal ? trimmed(body.dietaryNotes).slice(0, 500) || null : null;
    }
    if (body.headcount !== undefined) {
      patch.headcount = isMeal ? parseHeadcountValue(body.headcount) : null;
    }
    if (body.flexibility !== undefined) {
      const f = trimmed(body.flexibility);
      if (!(FLEXIBILITY_VALUES as readonly string[]).includes(f)) {
        res.status(400).json({ error: "That flexibility value isn't valid." });
        return;
      }
      patch.flexibility = f as SlotFlexibility;
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Nothing to update." });
      return;
    }

    // If the task is claimed we must be able to give the helper a one-tap out.
    // A claim made before cancel_token existed has none — mint one now so the
    // "can't any more" link in their message works (reusing the un-claim
    // mechanics exactly).
    let cancelToken = slot.cancelToken;
    if (slot.isClaimed && !cancelToken) {
      cancelToken = crypto.randomBytes(24).toString("hex");
      patch.cancelToken = cancelToken;
    }

    const [updated] = await db
      .update(slotsTable)
      .set(patch)
      .where(eq(slotsTable.id, slotId))
      .returning();

    // Tell the helper — always, on their own channel. The claim stands; the
    // message carries the one-tap out. The effective flexibility (post-edit) also
    // decides nothing here — this notification always goes to the helper.
    if (updated.isClaimed && updated.claimedByContact) {
      // Bug #033 — if the family flipped the wait-or-not answer, the helper's
      // commitment may just have gone from twenty minutes to half a day, so the
      // "here's what changed" line has to say so. This adds no NEW send: this
      // notification already fires on every edit to a claimed task. It was
      // simply reporting the when and nothing else, which would have read as
      // reassuringly unchanged on precisely the edit that matters most.
      //
      // Uses the GSM-safe SMS wording rather than the fuller email sentence,
      // because a lift is FIXED and a fixed task's notification goes by SMS.
      const waitClause = updated.liftWaitMode
        ? ` (${LIFT_WAIT_MODE_SMS_CLAUSES[updated.liftWaitMode]})`
        : "";
      const newDetail = `${whenLabel(updated.slotDate, updated.slotTime)}${waitClause}`;
      const label = taskLabel(updated.slotType, updated.customLabel);
      const releaseLink = cancelToken ? releaseLinkFor(cancelToken) : shareLinkFor(page);
      void notifyHelperOfTaskEvent({
        helperContact: updated.claimedByContact,
        emailSubject: helperEmailSubject(firstName(page.recipientName)),
        body: helperTaskChanged({
          helperFirstName: firstName(updated.claimedByName ?? "there"),
          recipientFirstName: firstName(page.recipientName),
          task: label,
          newDetail,
          releaseLink,
        }),
        link: releaseLink,
        // Primary, matching every other email. The case for a quiet control was
        // that it shouldn't invite people to hand tasks back — but that only
        // bites where a quiet button sits NEXT TO a green one and loses the
        // comparison, which is the claim confirmation (#052), not here. This is
        // the only control in the email, so there is nothing for it to compete
        // with, and looking like the rest of the family is worth more.
        //
        // Neutral label because the page it opens is already conditional —
        // reschedule for a flexible task, note-only for a fixed one — and
        // duplicating that rule in the copy would put the same decision in two
        // places, with the email much the harder of the two to keep right.
        ctaLabel: "Sort it out here",
      });
    }

    logger.info({ pageId, slotId, claimed: updated.isClaimed }, "Item 17: task edited");

    res.json({
      id: updated.id,
      slotType: updated.slotType,
      // #127, the same fault as the GET payload above: without this the raw
      // key comes BACK on every edit, so a fixed screen breaks again the
      // moment the family touches a task.
      label: taskName(updated.slotType, updated.customLabel),
      customLabel: updated.customLabel,
      notes: updated.notes ?? null,
      flexibility: updated.flexibility,
      slotDate: updated.slotDate,
      slotTime: updated.slotTime,
      liftWaitMode: updated.liftWaitMode,
      dietaryNotes: updated.dietaryNotes,
      headcount: updated.headcount,
      trustedHelpersOnly: updated.trustedHelpersOnly,
      isClaimed: updated.isClaimed,
      claimedByName: updated.claimedByName,
    });
  },
);

/**
 * DELETE /manage/:token/tasks/:slotId — cancel a task.
 *
 * Unclaimed: a quiet removal, no message to anyone. Claimed: the helper is
 * always thanked and told it's covered (bereavement pages get the gentler
 * variant), then the task is removed. Removing rather than reopening is correct
 * here — the family no longer needs it done at all, which is different from a
 * helper handing a still-needed task back (that's the release path).
 */
router.delete(
  "/manage/:token/tasks/:slotId",
  requireManagementToken as any,
  async (req, res) => {
    const { pageId } = req as unknown as ManagementRequest;
    const { slotId } = req.params;

    const [row] = await db
      .select({ slot: slotsTable, page: supportPagesTable })
      .from(slotsTable)
      .innerJoin(supportPagesTable, eq(slotsTable.pageId, supportPagesTable.id))
      .where(and(eq(slotsTable.id, slotId), eq(slotsTable.pageId, pageId)))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "That task isn't on this page." });
      return;
    }
    const { slot, page } = row;

    // Remove the task first, then tell the helper — a helper is never told a
    // task is "covered now" until it has actually been taken off the list. The
    // notify reads the slot/page data captured above, not the deleted row, and
    // is fire-and-forget: a slow send never blocks the cancel.
    await db.delete(slotsTable).where(eq(slotsTable.id, slotId));

    if (slot.isClaimed && slot.claimedByContact) {
      const label = taskLabel(slot.slotType, slot.customLabel);
      const pageLink = shareLinkFor(page);
      const helperFirstName = firstName(slot.claimedByName ?? "there");
      const recipientFirstName = firstName(page.recipientName);
      const bereavement = page.occasion === "bereavement";
      const bodyText = bereavement
        ? helperTaskCancelledBereavement({
            helperFirstName,
            recipientFirstName,
            task: label,
            pageLink,
          })
        : helperTaskCancelledStandard({
            helperFirstName,
            recipientFirstName,
            task: label,
            pageLink,
          });
      void notifyHelperOfTaskEvent({
        helperContact: slot.claimedByContact,
        emailSubject: helperEmailSubject(recipientFirstName),
        body: bodyText,
        link: pageLink,
      });
    }

    logger.info({ pageId, slotId, wasClaimed: slot.isClaimed }, "Item 17: task cancelled");
    res.json({ ok: true });
  },
);

// ─── Closing the page (bug #090) ─────────────────────────────────────────────
//
// `page_status` has carried a `closed` value since the first migration and
// NOTHING anywhere wrote it, so "the person a page is about must always be able
// to see everything and shut it down" was half unbuilt. These three routes are
// that half. Every decision in them lives in lib/pageClosure.ts, which has no
// database in it; these are the thin wiring, per the lib/draftDeletion
// precedent set on #071.
//
// ⚠️ close and reopen do NOT use requireManagementToken. They resolve the token
// themselves via loadClosureContext, which applies no `revoked_at` filter and
// returns closed pages, because the middleware's SQL filter would make ruling 7
// ("the recipient can never be locked out") and ruling 5 (reversibility)
// unreachable before any rule ran.

/**
 * GET /manage/:token/closure-preview — exactly who will be told, and how many.
 *
 * ⚠️ THE CONFIRM SCREEN MUST NAME THE PEOPLE, so the answer is computed HERE,
 * by the same closureCancellations the close route runs, rather than re-derived
 * in the browser from the task list. Two implementations of "which claims are
 * live and still ahead of us" would drift, and the one that drifted would be
 * the one a family read before pressing the button.
 *
 * Read-only: it changes nothing and can be opened as often as you like. It uses
 * the ordinary middleware, so it 410s on an already-closed page.
 */
router.get(
  "/manage/:token/closure-preview",
  requireManagementToken as any,
  async (req, res) => {
    const { pageId } = req as unknown as ManagementRequest;

    const page = await db.query.supportPagesTable.findFirst({
      where: eq(supportPagesTable.id, pageId),
    });
    if (!page) {
      res.status(404).json({ error: "Page not found." });
      return;
    }

    const slots = await loadClosureSlots(pageId);
    const { cancelled } = closureCancellations(slots, new Date());

    res.json({
      recipientName: page.recipientName,
      // Each person and the task they committed to — never a bare count. A
      // helper with no contact on file still appears: their claim is cancelled
      // like everyone else's, and the screen has to be honest that there is
      // nowhere to send their message.
      people: cancelled.map((s) => ({
        slotId: s.id,
        name: s.claimedByName,
        task: taskLabel(s.slotType, s.customLabel),
        when: whenLabel(s.slotDate, s.slotTime),
        reachable: !!s.claimedByContact?.trim(),
      })),
    });
  },
);

/**
 * POST /manage/:token/close — one button. It stops the page immediately and
 * cancels the live claims.
 *
 * ⚠️ A SECOND STATE — "closed to new claims while the existing ones run" — was
 * CONSIDERED AND DECLINED by Kate on 20 September 2026: it is close to what you
 * already get by not adding tasks. Recorded here, and in bug row #090, so its
 * absence is never filed as an oversight.
 */
router.post("/manage/:token/close", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const context = await loadClosureContext(String(req.params.token ?? ""));

  const verdict = canClosePage(
    context ? asClosureGrant(context.grant) : null,
    context?.page ?? null,
  );
  if (!verdict.ok) {
    res.status(verdict.status).json({ error: verdict.error });
    return;
  }
  const { grant, page } = context!;

  // Ruling 3 — the closer chooses who does the telling. The DEFAULT IS TRUE:
  // an old client, a retry or a malformed body must never silently produce the
  // silent variant. Choosing not to tell people is a deliberate act, so it has
  // to be said explicitly.
  const tellHelpers = body.tellHelpers !== false;
  // Ruling 4(b) — empty by default, never prefilled. Length-capped like every
  // other free-text field here; blank and whitespace both mean "nothing added".
  const rawNote = typeof body.note === "string" ? body.note.trim() : "";
  const note = rawNote ? rawNote.slice(0, 1000) : null;

  const slots = await loadClosureSlots(page.id);
  const outcome = await performClosure({ page, grant, slots, tellHelpers, note });

  res.json({ ok: true, ...outcome });
});

/**
 * POST /manage/:token/reopen — the page comes back, the commitments do not.
 *
 * BOTH HALVES ARE TRUE AND THE SCREEN SAYS BOTH. Reopening restores the PAGE —
 * to the status it HAD when it was closed, so an unpublished page comes back
 * unpublished rather than going live. It does not restore the cancelled claims — those tasks return to the list
 * unclaimed — it does not restore invitations cancelled at closure, and
 * messages already sent cannot be unsent.
 */
router.post("/manage/:token/reopen", async (req, res) => {
  const context = await loadClosureContext(String(req.params.token ?? ""));

  const verdict = canReopenPage(
    context ? asClosureGrant(context.grant) : null,
    context?.page ?? null,
  );
  if (!verdict.ok) {
    res.status(verdict.status).json({ error: verdict.error });
    return;
  }

  // The status it came back AS, not a constant: a draft reopens as a draft, a
  // scheduled gift as scheduled. Returned so the client can say which.
  const status = await performReopen(context!.page);
  res.json({ ok: true, status });
});

// ─── Feedback: how did it actually go? ───────────────────────────────────────

/**
 * POST /manage/:token/feedback — the organiser's own account of how the page
 * went, stored here and forwarded to Kate.
 *
 * ⚠️ THE ORDER OF OPERATIONS IS THE WHOLE DESIGN. WRITE THE ROW FIRST, THEN
 * SEND THE EMAIL, and never the other way round. The row is the record; the
 * email is only the notification. On 2 September a real notification reached
 * nobody and logged nothing (#102) — feedback that vanishes the same way would
 * be worse than never asking, because the person spent their goodwill, Kate got
 * nothing, and nobody would ever find out. A send that throws is caught, logged
 * loudly with the id of the row that DOES exist, and never shown to the person:
 * they wrote it, it was kept, and an internal email problem is not their
 * problem to be told about.
 *
 * NOT GATED ON A CLAIM. feedbackFormVisible decides whether the form is OFFERED,
 * which is a presentation rule. Acceptance is not gated on it: if the only claim
 * on the page is released while someone is part-way through typing, their words
 * are still taken. Refusing them would be the same silent loss this endpoint
 * exists to prevent.
 */
router.post("/manage/:token/feedback", requireManagementToken as any, async (req, res) => {
  const { pageId, grantId } = req as unknown as ManagementRequest;

  const verdict = readFeedbackSubmission((req.body ?? {}) as Record<string, unknown>);
  if (!verdict.ok) {
    res.status(verdict.status).json({ error: verdict.error });
    return;
  }

  // RATE LIMIT — checked AFTER validation, so a fumbled empty submission (which
  // writes nothing and sends nothing) never uses up someone's allowance. Only
  // submissions that would really write a row and send an email are counted.
  //
  // Not a security control: the endpoint is already behind a 32-random-byte
  // management token. What is being protected is the FEATURE — this is only
  // worth anything because Kate reads every one of these herself, so a flood of
  // hello@auntlucy.com.au attacks the feature rather than the server. The
  // realistic case is a stuck client retrying, not an attacker.
  const limited = hitRateLimit(
    feedbackRateLimitKey(grantId),
    FEEDBACK_RATE_LIMIT.limit,
    FEEDBACK_RATE_LIMIT.windowMs,
  );
  if (limited.limited) {
    // Same shape as the crisis limiter: a Retry-After and a warm line, never a
    // wall. The client renders this sentence inline under the form, which still
    // holds everything they typed.
    res.setHeader("Retry-After", Math.ceil(limited.retryAfterMs / 1000));
    res.status(429).json({ error: FEEDBACK_RATE_LIMITED });
    return;
  }

  // 1. THE RECORD. Everything after this point may fail without costing the
  //    person their words.
  const [row] = await db
    .insert(pageFeedbackTable)
    .values({
      pageId,
      grantId,
      wentWell: verdict.value.wentWell,
      gotInTheWay: verdict.value.gotInTheWay,
    })
    .returning();

  // 2. THE NOTIFICATION. Best effort, by design.
  try {
    const page = await db.query.supportPagesTable.findFirst({
      where: eq(supportPagesTable.id, pageId),
      columns: { recipientName: true, occasion: true },
    });
    await sendPageFeedbackNotification({
      recipientName: page?.recipientName ?? "a page",
      occasion: page?.occasion ?? null,
      receivedAt: row.createdAt,
      wentWell: row.wentWell,
      gotInTheWay: row.gotInTheWay,
    });
  } catch (err) {
    // Loud, and recoverable: the id is enough to read the feedback straight out
    // of the table. The text itself is deliberately NOT logged — it belongs to
    // Kate's inbox and the database, not to a log aggregator.
    logger.error(
      { err, pageId, feedbackId: row.id },
      "Page feedback SAVED but the notification email failed — read it from page_feedback",
    );
  }

  logger.info({ pageId, feedbackId: row.id }, "Page feedback received");
  res.status(201).json({ ok: true });
});

export default router;
