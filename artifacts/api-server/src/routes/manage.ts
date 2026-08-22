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
  type ManagementRequest,
} from "../middleware/requireManagementToken";
import { getAppBaseUrl } from "../lib/appUrl";
import { firstName } from "../lib/giftFulfilment";
import { logger } from "../lib/logger";
import { sendSms } from "../lib/sms";
import { sendHelperInviteEmail } from "../lib/email";
import {
  notifyHelperOfTaskEvent,
  shareLinkFor,
  releaseLinkFor,
} from "../lib/item17Notify";
import {
  taskLabel,
  whenLabel,
  helperTaskChanged,
  helperTaskCancelledStandard,
  helperTaskCancelledBereavement,
  helperEmailSubject,
} from "../lib/item17Copy";
import { type SlotFlexibility } from "../lib/slotFlexibility";
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

router.get("/manage/:token", requireManagementToken as any, async (req, res) => {
  const { pageId, grantId, grantRole } = req as unknown as ManagementRequest;

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

  res.json({
    role: grantRole,
    recipientName: page.recipientName,
    managers,
    recipientHasOwnAccess,
    // Present only for a sealed team card — the "See your card 💛" entry point.
    cardKeepsakeUrl,
    slug: page.slug,
    status: page.status,
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
      label: s.customLabel ?? s.slotType,
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

    const [invite] = await db
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
        status: mode === "schedule" ? "queued" : "queued",
        scheduledFor,
      })
      .returning();

    if (mode === "schedule") {
      results.push({ contactId: prepared.contact.id, status: "queued" });
      continue;
    }

    // Send now, inline, and record the outcome on the row.
    const ok =
      prepared.channel === "sms"
        ? await sendSms({
            to: prepared.mobile!,
            body: prepared.body,
            label: `inviteSms:${prepared.kind}`,
          })
        : await sendHelperInviteEmail({
            to: prepared.email!,
            subject: prepared.subject!,
            text: prepared.body,
            link: prepared.link,
            ctaLabel: prepared.ctaLabel ?? undefined,
            unsubscribeUrl: prepared.unsubscribeUrl!,
            openingLine: prepared.openingLine,
          });

    await db
      .update(helperInvitesTable)
      .set(ok ? { status: "sent", sentAt: new Date() } : { status: "failed", failedAt: new Date() })
      .where(eq(helperInvitesTable.id, invite.id));

    results.push({ contactId: prepared.contact.id, status: ok ? "sent" : "failed" });
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
      const newDetail = whenLabel(updated.slotDate, updated.slotTime);
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
      });
    }

    logger.info({ pageId, slotId, claimed: updated.isClaimed }, "Item 17: task edited");

    res.json({
      id: updated.id,
      slotType: updated.slotType,
      label: updated.customLabel ?? updated.slotType,
      customLabel: updated.customLabel,
      notes: updated.notes ?? null,
      flexibility: updated.flexibility,
      slotDate: updated.slotDate,
      slotTime: updated.slotTime,
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

export default router;
