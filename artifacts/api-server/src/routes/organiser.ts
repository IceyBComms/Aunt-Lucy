import { Router, type IRouter } from "express";
import {
  db,
  supportPagesTable,
  slotsTable,
  // giftsTable: #071's draft-delete guard (a gift page is a draft when
  // activation is scheduled). organisersTable: #081's setup-person name.
  // Both sides of this merge added one symbol; the union keeps both.
  giftsTable,
  organisersTable,
  pilotApplicationsTable,
  helperInvitesTable,
} from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { sendQueuedInvites } from "../lib/queuedInviteSender";
import { releaseHeldInvitesOnGoLive } from "../lib/goLiveInvites";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth";
import { isAdminEmail } from "../lib/admin";
import { uniqueSlug } from "../lib/slug";
import { validateNewTask } from "../lib/newTaskInput";
import {
  grantRecipientAccess,
  grantSetupPersonAccess,
  listActiveGrants,
  manageLinkFor,
} from "../lib/accessGrants";
import { logger } from "../lib/logger";
import { canDeleteDraft } from "../lib/draftDeletion";
import { canPublish, PUBLISH_REFUSALS } from "../lib/pagePublish";

const router: IRouter = Router();

// POST /api/organiser/pages — create a new support page (draft)
router.post("/organiser/pages", requireAuth as any, async (req, res) => {
  const authReq = req as unknown as AuthRequest;

  /**
   * ADMIN ONLY (Kate's ruling, 21 September 2026 — Part B).
   *
   * Signing in is passwordless and unverified by design: type any address and
   * you have an organiser account. That is right for the people who are meant
   * to be here, but it meant this route handed anyone who typed anything an
   * unlimited supply of free support pages — a back door straight around the
   * $59 gift, with no purchase and no crisis form in the way.
   *
   * The two legitimate doors are unchanged and neither comes through here: a
   * paid page is created by Stripe fulfilment, and a free crisis page by
   * POST /crisis/pages (which has its own rate limit and is meant to be free).
   * The setup flow that follows either one uses
   * POST /organiser/pages/:pageId/slots, which is deliberately NOT gated —
   * a draft still has to be finishable.
   *
   * Hiding the dashboard button is not the lock. This is.
   */
  if (!isAdminEmail(authReq.organiserEmail)) {
    res.status(403).json({ error: "You don't have access to this." });
    return;
  }

  // `privacy` and `pin` are deliberately NOT read (Kate's ruling, 21 September
  // 2026, bug #129 — the page PIN is dropped). A client still sending them,
  // which a cached bundle will do for a while after deploy, is not refused:
  // the fields are ignored and the page comes out open, like every other one.
  const { recipientName, situationDescription, location } = req.body as {
    recipientName?: string;
    situationDescription?: string;
    location?: string;
  };

  const nameTrimmed = typeof recipientName === "string" ? recipientName.trim() : "";
  if (!nameTrimmed) {
    res.status(400).json({ error: "Recipient name is required." });
    return;
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
      // Every page is open. This is the ONLY place that ever wrote anything
      // else (crisis.ts takes the column default, gifts.ts writes "open"), so
      // with this line no new pin_protected row can be created. Written
      // explicitly rather than left to the default so the intent is readable.
      privacy: "open" as const,
      pin: null,
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
  // Bug #081 — same as the crisis path: whoever built this page is on its
  // access list, so claims reach them. Always "manager" here: the organiser
  // wizard has no "who is this for?" fork (that is #070, crisis-path only) and
  // its whole framing is building a page FOR someone. If a fork is ever added
  // to this form, the role must follow it — see grantSetupPersonAccess.
  const organiserRow = await db.query.organisersTable.findFirst({
    where: eq(organisersTable.id, authReq.organiserId),
    columns: { name: true },
  });
  await grantSetupPersonAccess({
    pageId: page.id,
    contact: authReq.organiserEmail,
    name: organiserRow?.name ?? null,
    forSelf: false,
  });

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
      // The organiser wizard never asks the occasion, so this is null by
      // design (a separately sequenced item, deliberately not fixed here).
      // Null takes the base wording, which reads correctly on any occasion.
      occasion: null,
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

  // One validator, two doors (Part C, 21 September 2026). The rules that
  // matter — a school run is always trusted-only, a lift must say whether the
  // helper waits, meal detail is meal-only — now live in lib/newTaskInput and
  // are shared verbatim with POST /manage/:token/tasks. A second copy would
  // drift, and the drifted one is the one a family hits.
  const parsed = validateNewTask(req.body ?? {});
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const values = parsed.values;
  const [slot] = await db
    .insert(slotsTable)
    .values({
      pageId,
      ...values,
      slotType: values.slotType as any,
    })
    .returning();

  res.status(201).json({
    id: slot.id,
    pageId: slot.pageId,
    slotType: slot.slotType,
    customLabel: slot.customLabel,
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    liftWaitMode: slot.liftWaitMode,
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

/**
 * DELETE /api/organiser/pages/:pageId — throw away a DRAFT page (bug #071).
 *
 * A draft could be neither re-opened nor deleted, so an abandoned attempt sat
 * on the dashboard for ever with no way in and no way out. Kate's own dashboard
 * carries eight of them, seven called "Support for Val". On the crisis path
 * that is the serious half: someone setting up help for a dying relative gets
 * interrupted — the single most likely thing to happen to that person — and
 * their half-finished attempt becomes permanent clutter they cannot clear.
 *
 * ⚠️ DRAFT ONLY, AND THE GUARDS ARE THE POINT. Deleting a LIVE page would be a
 * far worse bug than the one this fixes: helpers have committed to real tasks
 * and a family is depending on them. Three independent locks, each of which
 * would be sufficient on its own:
 *
 *   1. OWNERSHIP — the page must belong to the caller. This also happens to
 *      exclude every gift page, because those are created with organiserId
 *      null (gifts.ts) and NULL never equals a real id.
 *   2. STATUS — draft only. Active and closed both refuse.
 *   3. NO GIFT ATTACHED — belt and braces, and NOT redundant. A gift page IS
 *      created as a draft when the recipient schedules activation for later
 *      (`status: scheduledActivateAt ? "draft" : "active"`, gifts.ts:568), so
 *      "draft" alone does not mean "disposable". Deleting one would destroy a
 *      page somebody paid $59 for AND null its gifts.page_id (the FK is
 *      onDelete: "set null"), leaving a gift marked redeemed but pointing at
 *      nothing. Lock 1 already prevents it today; this lock means it stays
 *      prevented if page ownership is ever reworked.
 *
 * The row really is removed rather than soft-deleted, which the confirm copy
 * states plainly ("This can't be undone"). Safe to do: every child FK is
 * onDelete cascade (slots, contacts, helper_invites, page_grants), so nothing
 * is orphaned and no migration is needed.
 */
router.delete("/organiser/pages/:pageId", requireAuth as any, async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const { pageId } = req.params;

  const page = await db.query.supportPagesTable.findFirst({
    where: eq(supportPagesTable.id, pageId),
  });
  const gift = page
    ? await db.query.giftsTable.findFirst({ where: eq(giftsTable.pageId, page.id) })
    : undefined;

  const verdict = canDeleteDraft(page, authReq.organiserId, !!gift);
  if (!verdict.ok) {
    if (verdict.status === 409 && gift) {
      logger.warn(
        { event: "draft_delete_refused_gift_page", pageId, giftId: gift.id },
        "Refused to delete a draft that belongs to a gift",
      );
    }
    res.status(verdict.status).json({ error: verdict.error });
    return;
  }

  await db.delete(supportPagesTable).where(eq(supportPagesTable.id, page!.id));
  logger.info(
    { event: "draft_page_deleted", pageId: page!.id, origin: page!.origin },
    "Draft support page deleted by its organiser",
  );
  res.status(204).end();
});

// POST /api/organiser/pages/:pageId/publish
//
// 14 Sep 2026 — GOING LIVE IS A DELIBERATE ACT, and this is the half that
// actually guards it. The step-3 screen used to call this route on mount, and
// the route accepted any page in any state, with or without a single task. The
// decision is now canPublish (pure, unit-tested): a draft with at least one
// task, or nothing happens.
router.post("/organiser/pages/:pageId/publish", requireAuth as any, async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const { pageId } = req.params;

  const page = await db.query.supportPagesTable.findFirst({
    where: and(
      eq(supportPagesTable.id, pageId),
      eq(supportPagesTable.organiserId, authReq.organiserId),
    ),
    with: { slots: { columns: { id: true } } },
  });

  const verdict = canPublish(page, page?.slots ?? []);
  if (!verdict.ok) {
    res.status(verdict.status).json({ error: verdict.error, reason: verdict.reason });
    return;
  }

  // Conditional on STILL being a draft, so two presses, two tabs or a retry
  // cannot both flip it — the second finds nothing to update and is refused
  // exactly as a stale step-3 link would be.
  const [updated] = await db
    .update(supportPagesTable)
    .set({ status: "active" })
    .where(and(eq(supportPagesTable.id, page!.id), eq(supportPagesTable.status, "draft")))
    .returning();

  if (!updated) {
    const refusal = PUBLISH_REFUSALS.not_draft;
    res.status(refusal.status).json({ error: refusal.error, reason: refusal.reason });
    return;
  }

  res.json({ slug: updated.slug, status: updated.status });

  // ✅ Kate's ruling, 14 Sep 2026: PUBLISHING SENDS THIS PAGE'S HELD
  // INVITATIONS STRAIGHT AWAY. Invitations added while the page was a draft
  // were held (bug #113 — nothing leaves a draft); this is the moment they go,
  // instead of waiting up to fifteen minutes for the cron.
  //
  // AFTER the response, deliberately. The page IS live now, and a slow or
  // failing send must never surface as "That didn't work, and nothing has gone
  // live" on a page that has. Same claim as the cron (lib/inviteClaimQuery.ts),
  // so if the two overlap nobody is invited twice. Anything this never gets to
  // claim — a thrown error before the claim, a scheduled wave not yet due —
  // stays queued, and /internal/dispatch-invites sends it on its next run.
  //
  // The SAME helper scheduled activation calls (routes/internal.ts): when a
  // page goes live its invitations go, whatever made it live (lib/goLiveInvites.ts).
  void releaseHeldInvitesOnGoLive(updated.id, "publish", sendQueuedInvites);
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
      // Part A — a closed card now says when it closed, so the dashboard can
      // tell two closed pages apart. Null-safe: a page closed before migration
      // 0017 has no date, and the card simply omits the line.
      closedAt: p.closedAt?.toISOString() ?? null,
      slotCount: p.slots.length,
      claimedCount: p.slots.filter((s) => s.isClaimed).length,
    })),
  );
});

/**
 * GET /api/organiser/pages/:pageId/manage-link — "Make changes" (Part A).
 *
 * THE PROBLEM THIS SOLVES
 * /manage is reached by a grant token, and a grant token is only ever delivered
 * by message. The organiser — the person who set the page up and is signed in
 * looking straight at it — had no route to their own management screen at all
 * unless they still had the text. On a CLOSED page they had no controls
 * whatsoever, so a page could not even be reopened from the dashboard.
 *
 * WHAT IT WILL NOT DO
 * It never returns somebody else's token, and above all never the recipient's.
 * A grant token IS a credential: handing the organiser the recipient's would
 * silently give them the recipient's identity in every message the page sends,
 * and would survive any later revoking. So the match is on THEIR OWN contact
 * and nothing else, and when there is no such grant a fresh one is minted for
 * them rather than an existing one borrowed.
 *
 * ANY role counts as theirs. On a crisis page someone set up for THEMSELVES,
 * their own grant is role "recipient" (lib/setupPersonGrant) — that is correct
 * and must be reused, not duplicated with a manager grant beside it, or the
 * page would start telling them about themselves in the third person.
 *
 * The token is fetched on click and never on the page LIST, so a dashboard
 * response cannot spill credentials for every page at once.
 */
router.get("/organiser/pages/:pageId/manage-link", requireAuth as any, async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const { pageId } = req.params;

  // Not yours is answered exactly as not-a-page: a signed-in stranger learns
  // nothing about which page ids exist.
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

  const organiserEmail = (authReq.organiserEmail ?? "").trim();
  const grants = await listActiveGrants(page.id);
  const mine = grants.find(
    (g) =>
      (g.personContact ?? "").trim().toLowerCase() === organiserEmail.toLowerCase(),
  );

  if (mine) {
    res.json({ url: manageLinkFor(mine.token) });
    return;
  }

  // No grant of their own yet — a page created before #081, or a gift page
  // whose access list only ever held the recipient. Mint one. `forSelf: false`
  // makes it a MANAGER: this is the organiser asking for their own way in, not
  // a statement that the page is about them. Getting that wrong would flip the
  // addressee in every claim notification the page sends.
  const organiser = await db.query.organisersTable.findFirst({
    where: eq(organisersTable.id, authReq.organiserId),
  });

  const minted = await grantSetupPersonAccess({
    pageId: page.id,
    contact: organiserEmail,
    name: organiser?.name ?? null,
    forSelf: false,
  });

  // Page id only. Never the token, never the email (row #134).
  logger.info({ pageId: page.id }, "Minted an organiser's own management grant");

  res.json({ url: manageLinkFor(minted.token) });
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

  // Invitations waiting for this page to go live (bug #113). Step 3 says that
  // making it live sends them — and only says so when there are some, because
  // on a page with none the ruled "doesn't send anyone a message" is still true.
  const [{ n: heldInviteCount }] = await db
    .select({ n: count() })
    .from(helperInvitesTable)
    .where(and(eq(helperInvitesTable.pageId, page.id), eq(helperInvitesTable.status, "queued")));

  res.json({
    id: page.id,
    slug: page.slug,
    recipientName: page.recipientName,
    situationDescription: page.situationDescription,
    location: page.location,
    status: page.status,
    privacy: page.privacy,
    heldInviteCount,
    createdAt: page.createdAt.toISOString(),
    slots: page.slots.map((s) => ({
      id: s.id,
      slotType: s.slotType,
      customLabel: s.customLabel,
      slotDate: s.slotDate,
      slotTime: s.slotTime,
      liftWaitMode: s.liftWaitMode,
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
