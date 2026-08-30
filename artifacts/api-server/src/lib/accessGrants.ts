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
 * mechanism.
 */
import crypto from "crypto";
import { db, pageGrantsTable, type PageGrant } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { getAppBaseUrl } from "./appUrl";
import { firstName } from "./giftFulfilment";
import { sendSms } from "./sms";
import { sendItem17Email } from "./email";
import { logger } from "./logger";
import { setupPersonGrantInput } from "./setupPersonGrant";

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** The private management URL a grant token unlocks. */
/**
 * Where the AFFECTED PERSON's own link goes (bug #074).
 *
 * Not the management screen. Someone who never asked for any of this, and did
 * not receive a gift, needs to be told what the page is and who made it before
 * being handed an admin console. The doorway carries a button through to
 * /manage, so nothing is hidden — it is one screen earlier, not a detour.
 *
 * A MANAGER's link still points straight at /manage: they were handed the
 * running of the page deliberately, and their own email already explains it.
 */
export function welcomeLinkFor(token: string): string {
  return `${getAppBaseUrl()}/welcome/${token}`;
}

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

// ─── Naming the granter ──────────────────────────────────────────────────────

/**
 * The first name of whoever issued a grant, or null when it cannot be resolved.
 *
 * A recipient's own grant deliberately carries no personName — the page is
 * already theirs — so when the granting grant is theirs, the granter IS the
 * recipient and the name comes from the page instead.
 *
 * Null happens on the two third-party setup paths, where nothing has ever
 * captured the setter-upper's name: the organisers table stores only an email
 * address, and /hardest-times asks only for the RECIPIENT's name. Each message
 * below carries its own purpose-written no-name opener for that case rather
 * than describing the person by their role.
 */
async function granterFirstName(
  byGrantId: string | null | undefined,
  recipientName: string,
): Promise<string | null> {
  if (!byGrantId) return null;
  const granting = await db.query.pageGrantsTable.findFirst({
    where: eq(pageGrantsTable.id, byGrantId),
  });
  if (!granting) return null;
  if (granting.personName) return firstName(granting.personName);
  return granting.role === "recipient" ? firstName(recipientName) : null;
}

// ─── Copy (approved 22 August 2026) ──────────────────────────────────────────
//
// Email and SMS carry deliberately different wordings — SMS is a single short
// paragraph, email is the fuller note. Both are approved text; neither is a
// truncation of the other.
//
// Every message has a named and a no-name opener. Only the opener differs; the
// remainder of each body is identical either way.

/** A. The email a newly-added manager receives. */
function managerAccessEmail(
  personFirst: string,
  granterFirst: string | null,
  recipientFirst: string,
  link: string,
): string {
  const opener = granterFirst
    ? `Hi ${personFirst}, ${granterFirst} has asked you to help run ${recipientFirst}'s Aunt Lucy page`
    : `Hi ${personFirst}, someone looking after ${recipientFirst}'s Aunt Lucy page has asked you to help run it`;
  return (
    // #076 sweep site ④. Occasion-blind, so a manager on a bereavement page
    // read "the school run". Adopts the shipped, occasion-safe line from
    // recipientAccessGentleSms rather than drafting a new one. The lead-in
    // "practical help:" is dropped only because the adopted fragment already
    // carries "practical" — a deletion, not a rewrite.
    `${opener} — a simple page where friends and family coordinate ` +
    `meals, lifts, the practical bits.\n\n` +
    `You'll be able to see what's needed, add things and invite people. Here's your ` +
    `own private link — it's just for you:\n\n${link}\n\n` +
    `No pressure at all — if now's not the time, you can simply leave it.`
  );
}

/** A. The SMS a newly-added manager receives. */
function managerAccessSms(
  granterFirst: string | null,
  recipientFirst: string,
  link: string,
): string {
  const opener = granterFirst
    ? `${granterFirst} has asked you to help run ${recipientFirst}'s Aunt Lucy page`
    : `Someone looking after ${recipientFirst}'s Aunt Lucy page has asked you to help run it`;
  return (
    `${opener} — where friends coordinate practical help like meals and lifts. ` +
    `Your own link: ${link}`
  );
}

/**
 * B. The email the affected person receives when looped in to their own page.
 * The base wording, used for every occasion except bereavement and serious
 * illness — INCLUDING a null occasion, which is why it is written to read
 * correctly at a funeral as well as at a baby shower.
 */
function recipientAccessEmail(
  personFirst: string,
  granterFirst: string | null,
  link: string,
): string {
  const opener = granterFirst
    ? `Hi ${personFirst}, ${granterFirst} set up an Aunt Lucy page for you`
    : `Hi ${personFirst}, someone who's looking out for you has set up an Aunt Lucy page`;
  return (
    `${opener} — one place where your friends and family can pick up the practical ` +
    `things, without you having to ask or organise anything.\n\n` +
    `It's yours. You can see everything on it, change anything you like, or close it ` +
    `whenever you want:\n\n${link}\n\n` +
    `There's nothing you have to do — it's here for whenever you want it.`
  );
}

/** B. The base SMS counterpart. */
function recipientAccessSms(granterFirst: string | null, link: string): string {
  const opener = granterFirst
    ? `${granterFirst} set up an Aunt Lucy page for you`
    : `Someone who's looking out for you has set up an Aunt Lucy page`;
  return (
    `${opener} — one place where your friends and family can pick up the practical ` +
    `things, without you having to ask. It's yours: ${link}`
  );
}

/**
 * B. The gentler email, for a bereavement or serious-illness page. Mirrors the
 * register-softening already applied to the recipient claim notification
 * (lib/email.ts, PR #42): quieter, no "without having to ask" framing, and an
 * explicit reassurance that nothing happens unprompted.
 */
function recipientAccessGentleEmail(
  personFirst: string,
  granterFirst: string | null,
  link: string,
): string {
  const opener = granterFirst
    ? `Hi ${personFirst}, ${granterFirst} set up an Aunt Lucy page for you`
    : `Hi ${personFirst}, someone who's looking out for you has set up an Aunt Lucy page`;
  return (
    // #076 sweep site ③, and the sharpest one: `gentle` is selected ONLY for
    // bereavement and illness_recovery, so the branch that exists TO BE
    // GENTLER named the school run anyway — while its own SMS sibling below
    // already said the right thing. The two halves of one message disagreed;
    // this makes them agree by adopting the sibling's words verbatim.
    `${opener} — one place where the people around you can pick up ` +
    `meals, lifts, the practical bits.\n\n` +
    `It's yours now, to use or not. You can see everything on it, change anything, or ` +
    `close it whenever you like:\n\n${link}\n\n` +
    `There's nothing you have to do. Nothing on it happens without someone offering ` +
    `first.`
  );
}

/** B. The gentler SMS counterpart. */
function recipientAccessGentleSms(granterFirst: string | null, link: string): string {
  const opener = granterFirst
    ? `${granterFirst} set up an Aunt Lucy page to keep track of who's helping you`
    : `Someone who's looking out for you has set up an Aunt Lucy page to keep track of who's helping you`;
  return (
    `${opener} — meals, lifts, the practical bits. It's yours now, to use or ` +
    `not: ${link}`
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
  /** Granter first name, or null for the no-name opener. */
  granterFirst?: string | null;
  /**
   * The page's occasion (gift_occasion enum value). Only used to choose the
   * gentler recipient wording; null — the organiser-wizard case — correctly
   * takes the base wording, which reads right on any occasion.
   */
  occasion?: string | null;
}): Promise<boolean> {
  const personFirst = firstName(opts.personName ?? "there");
  const recipientFirst = firstName(opts.recipientName);
  const granterFirst = opts.granterFirst ?? null;

  // A bereavement or serious-illness page takes the quieter register, exactly as
  // the claim notification does. Every other occasion — and a null one — keeps
  // the base wording.
  const gentle = opts.occasion === "bereavement" || opts.occasion === "illness_recovery";
  const toEmail = isEmailAddress(opts.contact);

  const body =
    opts.role === "recipient"
      ? toEmail
        ? gentle
          ? recipientAccessGentleEmail(personFirst, granterFirst, opts.link)
          : recipientAccessEmail(personFirst, granterFirst, opts.link)
        : gentle
          ? recipientAccessGentleSms(granterFirst, opts.link)
          : recipientAccessSms(granterFirst, opts.link)
      : toEmail
        ? managerAccessEmail(personFirst, granterFirst, recipientFirst, opts.link)
        : managerAccessSms(granterFirst, recipientFirst, opts.link);

  try {
    if (toEmail) {
      const subject =
        opts.role === "recipient"
          ? granterFirst
            ? `${granterFirst} set this up for you`
            : `Your Aunt Lucy page`
          : `You've been added to help run ${recipientFirst}'s page`;
      // The manager email gets the green primary button (#045): being handed the
      // running of someone's page IS an action, and this is the one email in the
      // pair whose copy was approved for it. The recipient-role variant is a
      // different, unapproved body and deliberately keeps the plain link.
      const ctaLabel =
        opts.role === "manager" ? `Open ${recipientFirst}'s page` : null;
      return await sendItem17Email({
        to: opts.contact,
        subject,
        body,
        link: opts.link,
        ctaLabel,
      });
    }
    return await sendSms({ to: opts.contact, body, label: `accessGrant:${opts.role}` });
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
 * issued it (the audit/handover trail) and is also what names the granter in the
 * message. Contact is a single email OR mobile.
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
    granterFirst: await granterFirstName(opts.byGrantId, opts.recipientName),
  });

  return { grant, delivered };
}

/**
 * Put the SETUP PERSON on the page's own access list (bug #081).
 *
 * WHY THIS EXISTS
 * #025 widened who a notification can reach — the page's own contact plus every
 * unrevoked grant. That fix is correct and deployed. But on the crisis and
 * organiser paths the resulting set was EMPTY: neither flow sets a page-level
 * contact, and the only grant either could mint was for the AFFECTED person,
 * gated on having their contact AND ticking "they're ready to know". So the
 * person actually running the page — who typed their own email into the form
 * and is doing all the work — was never a notification target at all. A friend
 * would say "I'll bring dinner Tuesday" and nobody would ever be told.
 *
 * Kate's framing, and it is the reason this is a one-line concept rather than a
 * feature: `page_grants` is what models RUNS in the handover model — whoever is
 * doing the work today. The setup person IS runs. This is not new machinery,
 * it is the existing model finally being applied on the path that needs it most.
 *
 * ⚠️ IT SENDS NOTHING, DELIBERATELY. mintManagerGrant exists for handing the
 * page to SOMEONE ELSE, so it messages them their link. This person is already
 * holding the page — they are mid-setup on it in this very request — so an
 * email saying "you've been added to help run this page" would be noise at
 * best and confusing at worst. The grant is bookkeeping, not an announcement.
 *
 * ROLE IS THE CALLER'S CALL AND IT MATTERS FOR THE WORDS, not just for access.
 * `isRecipient` on a grant drives the addressee swap in every claim
 * notification ("shown up for you" vs "shown up for Val"). Someone setting a
 * page up for a friend is a `manager` and reads the friend's name; someone
 * setting one up for themselves is the `recipient` and reads "you". Passing
 * the wrong one here tells a grieving person about themselves in third person.
 *
 * `grantedByGrantId` is null: this grant is the ORIGIN of the page's access
 * chain, not something issued by an earlier grant.
 */
export async function grantSetupPersonAccess(opts: {
  pageId: string;
  /** The email or mobile they gave when creating the page. */
  contact: string;
  /** Their own name, when the form collected one. */
  name: string | null;
  /** True when the page is about the person setting it up. */
  forSelf: boolean;
}): Promise<PageGrant> {
  const [grant] = await db
    .insert(pageGrantsTable)
    .values({
      pageId: opts.pageId,
      token: newToken(),
      grantedByGrantId: null,
      ...setupPersonGrantInput(opts),
    })
    .returning();
  return grant;
}

/**
 * Mint the affected person's own recipient grant and send them their link — the
 * section-E "loop-in". `byGrantId` is null when this happens at setup (there is
 * no minting grant yet on a crisis/organiser page), and the message then uses
 * its no-name opener. Caller must ensure no recipient grant already exists.
 */
export async function grantRecipientAccess(opts: {
  pageId: string;
  recipientName: string;
  contact: string;
  byGrantId?: string | null;
  /** The page's occasion, so a bereavement page gets the gentler wording. */
  occasion?: string | null;
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
    link: welcomeLinkFor(token),
    granterFirst: await granterFirstName(opts.byGrantId, opts.recipientName),
    occasion: opts.occasion ?? null,
  });

  return { grant, delivered };
}
