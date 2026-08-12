/**
 * Page-access grants — sharing the running of a page, and the affected person's
 * own always-on access (the 5a fix).
 *
 * Two grant roles live in page_grants (see lib/db schema):
 *   • "recipient" — the person the page is ABOUT. Born unrevocable-by-others:
 *     view-everything + (eventually) close-the-page. On a gift page it is minted
 *     at activation; on a crisis/organiser page it only comes into being if the
 *     affected person is looped in (section E).
 *   • "manager"   — someone the page owner has asked to help RUN things day to
 *     day. Revocable by the recipient. Added via /manage (section A).
 *
 * A grant's token IS the credential: it resolves to /manage/:token exactly like
 * the recipient's own management link. Delivery of that link reuses the existing
 * transactional senders (sendSms + the generic branded email) — no new send
 * mechanism. The wording below is a SUGGESTION for Kate to approve, not final.
 */
import crypto from "crypto";
import { db, pageGrantsTable, type PageGrant } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { getAppBaseUrl } from "./appUrl";
import { firstName } from "./giftFulfilment";
import { sendSms } from "./sms";
import { sendItem17Email } from "./email";
import { logger } from "./logger";

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** The private management URL a grant token unlocks. */
export function manageLinkFor(token: string): string {
  return `${getAppBaseUrl()}/manage/${token}`;
}

/** Active (not-revoked) grants on a page, newest first. */
export async function listActiveGrants(pageId: string): Promise<PageGrant[]> {
  return db.query.pageGrantsTable.findMany({
    where: and(eq(pageGrantsTable.pageId, pageId), isNull(pageGrantsTable.revokedAt)),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });
}

// ─── Copy (SUGGESTION — Kate to approve the exact wording) ───────────────────

/**
 * The message a newly-added manager receives. Warm, plain about what they're
 * being given and why, with an explicit no-pressure out. `{recipientFirst}` is
 * the person the page is about; `{personFirst}` is the manager.
 */
function managerAccessBody(personFirst: string, recipientFirst: string, link: string): string {
  return (
    `Hi ${personFirst}, ${recipientFirst} (or someone helping ${recipientFirst}) has ` +
    `asked you to help run ${recipientFirst}'s Aunt Lucy page — the one place where ` +
    `friends can pitch in with meals, lifts and a hand. You'll be able to see what's ` +
    `needed and help keep things ticking along.\n\n` +
    `Here's your own private link — it's just for you:\n${link}\n\n` +
    `No pressure at all — if now's not the time, you can simply leave it.`
  );
}

/**
 * The message the affected person receives when they're looped in to their own
 * page (section E). Framed as theirs, emphasising they hold the key.
 */
function recipientAccessBody(personFirst: string, link: string): string {
  return (
    `Hi ${personFirst}, this is your own Aunt Lucy page — someone who cares about ` +
    `you set it up so the people around you can help with the practical things, ` +
    `without you having to ask.\n\n` +
    `It's yours. You can see everything on it and change anything you like here:\n${link}\n\n` +
    `There's nothing you have to do — it's here for whenever you want it.`
  );
}

/**
 * Send a person their private management link on whichever channel their single
 * contact point implies (email address → email, otherwise SMS). Reuses the
 * existing senders verbatim; returns whether the message was handed off. Never
 * throws — a delivery hiccup must not fail the grant that was just minted.
 */
export async function sendManagementAccessLink(opts: {
  contact: string;
  personName: string | null;
  recipientName: string;
  role: "recipient" | "manager";
  link: string;
}): Promise<boolean> {
  const personFirst = firstName(opts.personName ?? "there");
  const recipientFirst = firstName(opts.recipientName);
  const body =
    opts.role === "recipient"
      ? recipientAccessBody(personFirst, opts.link)
      : managerAccessBody(personFirst, recipientFirst, opts.link);

  try {
    if (isEmailAddress(opts.contact)) {
      const subject =
        opts.role === "recipient"
          ? `Your Aunt Lucy page`
          : `You've been added to help run ${recipientFirst}'s page`;
      return await sendItem17Email({ to: opts.contact, subject, body, link: opts.link });
    }
    return await sendSms({ to: opts.contact, body });
  } catch (err) {
    logger.error({ err, role: opts.role }, "Management access link delivery failed");
    return false;
  }
}

// ─── Minting ─────────────────────────────────────────────────────────────────

function newToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Mint a manager grant and send that person their link. `byGrantId` records who
 * issued it (the audit/handover trail). Contact is a single email OR mobile.
 */
export async function mintManagerGrant(opts: {
  pageId: string;
  byGrantId: string;
  recipientName: string;
  name: string;
  contact: string;
}): Promise<{ grant: PageGrant; delivered: boolean }> {
  const token = newToken();
  const [grant] = await db
    .insert(pageGrantsTable)
    .values({
      pageId: opts.pageId,
      token,
      role: "manager",
      personName: opts.name,
      personContact: opts.contact,
      grantedByGrantId: opts.byGrantId,
    })
    .returning();

  const delivered = await sendManagementAccessLink({
    contact: opts.contact,
    personName: opts.name,
    recipientName: opts.recipientName,
    role: "manager",
    link: manageLinkFor(token),
  });

  return { grant, delivered };
}

/**
 * Mint the affected person's own recipient grant and send them their link — the
 * section-E "loop-in". `byGrantId` is null when this happens at setup (there is
 * no minting grant yet on a crisis/organiser page). Caller must ensure no
 * recipient grant already exists.
 */
export async function grantRecipientAccess(opts: {
  pageId: string;
  recipientName: string;
  contact: string;
  byGrantId?: string | null;
}): Promise<{ grant: PageGrant; delivered: boolean }> {
  const token = newToken();
  const [grant] = await db
    .insert(pageGrantsTable)
    .values({
      pageId: opts.pageId,
      token,
      role: "recipient",
      personContact: opts.contact,
      grantedByGrantId: opts.byGrantId ?? null,
    })
    .returning();

  const delivered = await sendManagementAccessLink({
    contact: opts.contact,
    personName: opts.recipientName,
    recipientName: opts.recipientName,
    role: "recipient",
    link: manageLinkFor(token),
  });

  return { grant, delivered };
}
