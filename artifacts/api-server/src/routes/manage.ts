import { Router, type IRouter } from "express";
import crypto from "crypto";
import {
  db,
  supportPagesTable,
  slotsTable,
  contactsTable,
  helperInvitesTable,
  type SupportPage,
  type Contact,
} from "@workspace/db";
import { and, eq, isNull, desc } from "drizzle-orm";
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
  resolvePronouns,
  applyPronounTokens,
  defaultSituationLine,
  defaultTrustedLine,
  generalInviteSms,
  trustedInviteSms,
  secondWaveSms,
  generalInviteEmailSubject,
  generalInviteEmailText,
  type RecipientPronouns,
} from "../lib/inviteCopy";

const router: IRouter = Router();

const PRONOUN_VALUES: readonly RecipientPronouns[] = ["she_her", "he_him", "they_them"];
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
  const { pageId, grantRole } = req as unknown as ManagementRequest;

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

  res.json({
    role: grantRole,
    recipientName: page.recipientName,
    slug: page.slug,
    status: page.status,
    occasion: page.occasion ?? null,
    recipientPronouns: page.recipientPronouns,
    situationLine: page.situationLine ?? defaultSituationLine(page.occasion ?? null),
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
    page.situationLine ?? defaultSituationLine(page.occasion ?? null),
    pronouns,
  );
  const openingLine = trimmed(req.openingLine).slice(0, OPENER_MAX) || null;

  // Resolve the kind. A slot makes it a trusted ask; otherwise general, unless
  // the caller explicitly asked for a second-wave nudge.
  let kind: InviteKind = req.kind ?? (req.slotId ? "trusted" : "general");
  let slotId: string | null = null;
  let inviteToken: string | null = null;
  let link = `${base}/s/${page.slug}`;

  if (kind === "trusted") {
    // The trusted invite still grants the specific slot (its label shows on the
    // invite page); the SMS wording no longer names the task.
    if (!req.slotId) return { error: "A trusted invite needs a task." };
    const slot = await db.query.slotsTable.findFirst({
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

  if (channel === "email") {
    // Email only carries the general 9c copy; trusted/second-wave are SMS-first
    // by design (CLAUDE.md), so an email contact on those falls back to 9c.
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
    // An email contact can't use a per-slot trusted token page; treat as general.
    kind = kind === "second_wave" ? "second_wave" : "general";
    slotId = null;
    inviteToken = null;
    link = `${base}/s/${page.slug}`;
  } else if (kind === "trusted") {
    body = trustedInviteSms({
      helperFirstName,
      recipientFirstName,
      trustedLine: applyPronounTokens(defaultTrustedLine(page.occasion ?? null), pronouns),
      pronounPoss: poss,
      link,
      openingLine,
    });
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
        ? await sendSms({ to: prepared.mobile!, body: prepared.body })
        : await sendHelperInviteEmail({
            to: prepared.email!,
            subject: prepared.subject!,
            text: prepared.body,
            link: prepared.link,
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

export default router;
